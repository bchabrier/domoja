var assert = require("assert");
import async = require("async");
import * as request from 'request';
import * as express from 'express';
import * as astronomy from '../lib/astronomy';
import { sensor } from '../devices/sensor';
import { device } from '../devices/device';
import { GenericDevice } from '../devices/genericDevice';
import cron = require('cron');
var cronJob = cron.CronJob;
import { Source, message, DEFAULT_SOURCE, DefaultSource } from '../sources/source';
import { ConfigLoader } from '../lib/load';
import { DomoModule, InitObject, Parameters } from '../lib/module';

var logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

type TimeSpec = number /* sumber of seconds */ | "sunset" | "sunrise";

function toMinutes(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
}

function asString(d: Date): string {
    let h = d.getHours();
    let m = d.getMinutes();
    let s = d.getSeconds();

    let t = [];

    if (h > 0) t.push(h + 'h');
    if (m > 0) t.push(m + 'mn');
    if (s > 0) t.push(s + 's');

    return t.join(' ');
}

function getDateFromTimeSpec(timeSpec: TimeSpec, callback: (err: Error, time: Date) => any) {
    _getDateFromTimeSpec(timeSpec, callback)
}

function isTimeSpec(timeSpec: TimeSpec): boolean {
    return _getDateFromTimeSpec(timeSpec, null)
}

function _getDateFromTimeSpec(timeSpec: TimeSpec, callback: (err: Error, time: Date) => any): boolean {
    let time = new Date;

    if (/([0-9]+):([0-9]+)/.test(<string>timeSpec)) {
        let match = /([0-9]+):([0-9]+)/.exec(<string>timeSpec)
        timeSpec = parseInt(match[1]) * 60 + parseInt(match[2])
    }

    if (typeof timeSpec === "number") {
        if (callback) {
            time = new Date;
            time.setSeconds(0);
            time.setMinutes(timeSpec % 60);
            time.setHours((timeSpec - time.getMinutes()) / 60);
            callback(null, time);
        }
        return true
    } else {
        switch (timeSpec) {
            case "sunset":
                if (callback) {
                    logger.debug('Getting sunset time...')
                    astronomy.getSunsetTime(callback);
                }
                return true;
            case "sunrise":
                if (callback) {
                    logger.debug('Getting sunrise time...')
                    astronomy.getSunriseTime(callback);
                }
                return true;
            default:
                if (callback) {
                    callback(new Error("'" + timeSpec + "' not yet supported in _getDateFromTimeSpec"), undefined);
                }
                return false;
        }
    }
}

function durationToNumber(duration: string) {
    let t = duration.split(':');

    let s: number = 0;
    switch (t.length) {
        case 3:
            s += 3600 * parseInt(t[t.length - 3]);
        case 2:
            s += 60 * parseInt(t[t.length - 2]);
        case 1:
            s += parseInt(t[t.length - 1]);
    }

    return s;
}

export class LightTimer extends GenericDevice {

    // WARNING: 
    // This method should be static, but static methods are not supported in interfaces.
    // Hence, do not use the 'this' keyword!
    //
    /*
        Creates an instance of the DomoModule for configLoader, initialized from initObject.
        All parameters should be checked before creating the instance, using the configLoader
        checkers, or an exception should
        be thrown.
    */
    createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): GenericDevice {

        let sensorDevices: sensor[] = [];
        try {
            sensorDevices = <sensor[]>configLoader.getDevicesFromIds(initObject.sensors);
        } catch (e) {
            throw new Error("Error in 'sensors' attribute: " + e + e.stack);
        }

        let off = initObject.off;
        if (typeof off !== "object" || off.length != 2 || !isTimeSpec(off[0]) || !isTimeSpec(off[1])) {
            throw new Error("Error in 'on' attribute: should be an interval of hh:mm | sunset | sunrise")
        }

        let activated = initObject.activated;
        if (activated) {
            if (activated != true && activated != false) {
                throw new Error("'state' value must be 'true' or 'false'")
            }
        }

        return new LightTimer(instanceFullname, initObject.name, sensorDevices,
            initObject.duration,
            initObject.off,
            initObject.on,
            initObject.priority,
            activated);
    }

    id: string;

    sensors: sensor[];
    duration: number;
    offPeriod: TimeSpec[];
    off_from: Date;
    off_to: Date;
    onPeriod: TimeSpec[];
    on_from: Date;
    on_to: Date;
    priority: 'on' | 'off';
    activated: boolean = undefined;
    sensorListener: (msg: message) => void;
    cronjob: cron.CronJob;

    private off_from_TO: NodeJS.Timer;
    private off_to_TO: NodeJS.Timer;
    private on_from_TO: NodeJS.Timer;
    private on_to_TO: NodeJS.Timer;

    // variable contenant l'�tat des d�tecteurs
    // sous forme sensorsStatus[sensor] = 0|1
    private sensorsStatus: {[x in string]?: 0 | 1} = {};



    constructor(instanceFullname: string, name: string, sensors: sensor[], duration: string, off: TimeSpec[], on?: TimeSpec[], priority?: 'on' | 'off', activated?: boolean) {
        super(DEFAULT_SOURCE, "LightTimer", instanceFullname, instanceFullname, name, {})
        this.id = instanceFullname;

        this.sensors = sensors;
        this.duration = durationToNumber(duration);
        this.offPeriod = off;
        this.onPeriod = on;
        this.priority = priority;

        // activate by default
        if (activated == undefined || this.activated == undefined) this.activate();
    }

    release(): void {
        this.deactivate();
        this.sensors = null;

        super.release();
    }


    // indique si l'un des d�tecteurs est on
    private areSensorsOn(): boolean {
        var total = 0;
        for (var s in this.sensorsStatus) {
            logger.debug("-" + s + ": " + this.sensorsStatus[s]);
            total += this.sensorsStatus[s];
        }
        return total > 0;
    }

    private isInOFFPeriod(time: Date) {
        logger.debug(this.off_from)
        logger.debug(time)
        logger.debug(this.off_to)
        logger.debug(this.off_from < this.off_to)
        logger.debug(this.off_from <= time && time <= this.off_to)
        return this.offPeriod && (
            (
                this.off_from < this.off_to &&
                this.off_from <= time && time <= this.off_to
            ) || (
                this.off_from >= this.off_to &&
                (this.off_from <= time || time <= this.off_to)
            )
        )
    }

    private isInONPeriod(time: Date) {
        return this.onPeriod && (
            (
                this.on_from < this.on_to &&
                this.on_from <= time && time <= this.on_to
            ) || (
                this.on_from >= this.on_to &&
                (this.on_from <= time || time <= this.on_to)
            )
        )
    }


    // setup of the lights ON/OFF planification for the rest of the current day
    // To be called at init, and once a day when astronomy site is updated, eg at 00:00
    private setup() {
        // exit immediately if timer has been deactivated in the meantime
        if (!this.activated) {
            return;
        }
        logger.debug("Setting up lightTimer '%s'...", this.id)

        let self = this;

        async.parallel({
            off_from: cb => getDateFromTimeSpec(self.offPeriod[0], cb),
            off_to: cb => getDateFromTimeSpec(self.offPeriod[1], cb),
            on_from: cb => { if (self.onPeriod) getDateFromTimeSpec(self.onPeriod[0], cb); else cb(null, undefined) },
            on_to: cb => { if (self.onPeriod) getDateFromTimeSpec(self.onPeriod[1], cb); else cb(null, undefined) },
        }, (err: Error, results: { off_from: Date, off_to: Date, on_from: Date, on_to: Date }) => {
            if (err) {
                logger.error("Error while setting up lightTimer '%s':", self.id, err);
                return;
            }
            logger.debug("Got off and on periods for lightTimer '%s':", self.id, results);

            // exit immediately if timer has been deactivated in the meantime
            if (!this.activated) {
                return;
            }

            // catch the results
            let now = new Date;
            if (self.offPeriod) {
                self.off_from = new Date(now.getTime());
                self.off_from.setSeconds(results.off_from.getSeconds());
                self.off_from.setMinutes(results.off_from.getMinutes());
                self.off_from.setHours(results.off_from.getHours());
                self.off_to = new Date(now.getTime());
                self.off_to.setSeconds(results.off_to.getSeconds());
                self.off_to.setMinutes(results.off_to.getMinutes());
                self.off_to.setHours(results.off_to.getHours());
            }
            if (self.onPeriod) {
                self.on_from = new Date(now.getTime());
                self.on_from.setSeconds(results.on_from.getSeconds());
                self.on_from.setMinutes(results.on_from.getMinutes());
                self.on_from.setHours(results.on_from.getHours());
                self.on_to = new Date(now.getTime());
                self.on_to.setSeconds(results.on_to.getSeconds());
                self.on_to.setMinutes(results.on_to.getMinutes());
                self.on_to.setHours(results.on_to.getHours());
            }

            // set the lights on or off accordingly
            self.updateState();

            // plan the different state changes
            function planUpdate(msg: string, time: Date, now: Date): NodeJS.Timer {
                logger.debug("Planning lighttimer '%s' update for '%s' at %s%s...", self.id, msg, asString(time),
                    (toMinutes(time) <= toMinutes(now)) ? " tomorrow" : "");
                return setTimeout(function () {
                    logger.debug("Lighttimer '%s' reached %s = %s...", self.id, msg, asString(time));
                    self.updateState();
                }, time.getTime() - now.getTime() +
                    ((toMinutes(time) <= toMinutes(now)) ?
                        24 * 60 * 60 * 1000 :
                        0));
            }
            if (self.off_from_TO) clearTimeout(self.off_from_TO);
            self.off_from_TO = planUpdate("off_from", self.off_from, now);
            if (self.off_to_TO) clearTimeout(self.off_to_TO);
            self.off_to_TO = planUpdate("off_to", self.off_to, now);
            if (self.on_from_TO) clearTimeout(self.on_from_TO);
            self.on_from_TO = self.onPeriod && planUpdate("on_from", self.on_from, now);
            if (self.on_to_TO) clearTimeout(self.on_to_TO);
            self.on_to_TO = self.onPeriod && planUpdate("on_to", self.on_to, now);
        });
    }

    private delayOFF_TO: NodeJS.Timer;

    private clearDelayOFF_TO() {
        if (this.delayOFF_TO) {
            clearTimeout(this.delayOFF_TO);
            this.delayOFF_TO = undefined;
        }
    }
    private delayedOFF() {
        let self = this;

        this.clearDelayOFF_TO();
        this.delayOFF_TO = setTimeout(() => {
            logger.debug("LightTimer '%s' reached timeout: turning lights OFF...", self.id)
            self.lightsOFF();
        }, this.duration * 1000);

    }

    // update the state of the lightTimer, i.e. turns lights on, or arm the OFF timer
    // Called when sensors trigger, and at setup
    private updateState() {
        // exit immediately if timer has been deactivated in the meantime
        if (!this.activated) {
            return;
        }

        logger.debug("Updating lightTimer '%s' state...", this.id)
        let now = new Date;
        let inON = this.isInONPeriod(now);
        let inOFF = this.isInOFFPeriod(now);
        logger.debug("lightTimer '%s': inON=%s, inOFF=%s", this.id, inON, inOFF);

        if (inOFF && !inON) {
            if (this.areSensorsOn()) {
                // do nothing
                logger.debug("LightTimer '%s': sensors ON, in !ON-OFF period => do nothing", this.id)
            } else {
                logger.debug("LightTimer '%s': sensors OFF, in !ON-OFF period => delayed OFF", this.id)
                this.delayedOFF();
            }
        } else if (inOFF && inON) {
            if (this.priority == 'on') {
                if (this.areSensorsOn()) {
                    logger.debug("LightTimer '%s': sensors ON, in ON-OFF period, priority to ON => lights ON", this.id)
                    this.clearDelayOFF_TO();
                    this.lightsON();
                } else {
                    // do nothing
                    logger.debug("LightTimer '%s': sensors OFF, in ON-OFF period, priority to ON => do nothing", this.id)
                }
            } else {
                if (this.areSensorsOn()) {
                    // do nothing
                    logger.debug("LightTimer '%s': sensors ON, in ON-OFF period, priority to OFF => do nothing", this.id)
                } else {
                    logger.debug("LightTimer '%s': sensors ON, in ON-OFF period, priority to OFF => delayed OFF", this.id)
                    this.delayedOFF();
                }
            }
        } else if (!inOFF && inON) {
            if (this.areSensorsOn()) {
                logger.debug("LightTimer '%s': sensors ON, ON-!OFF period => lights ON", this.id)
                this.clearDelayOFF_TO();
                this.lightsON();
            } else {
                // do nothing
                logger.debug("LightTimer '%s': sensors OFF, ON-!OFF period => do nothing", this.id)
            }
        } else {
            // !inOFF && !inON
            if (this.areSensorsOn()) {
                logger.debug("LightTimer '%s': sensors ON, !ON-!OFF period => lights ON", this.id)
                this.clearDelayOFF_TO();
                this.lightsON();
            } else {
                logger.debug("LightTimer '%s': sensors OFF, !ON-!OFF period => delayed OFF", this.id)
                this.delayedOFF();
            }
        }
    }

    activate() {
        logger.debug("Activating lightTimer '%s'...", this.id)
        let self = this;

        if (!this.activated) {
            this.cronjob = new cronJob('00 00 * * *', () => { self.setup() }, null, true);

            let self = this
            this.sensorListener = (msg: message) => {
                if (msg !== undefined && msg !== null) {
                    logger.debug(msg.emitter.name + " state is " + msg.newValue);
                    self.sensorsStatus[msg.emitter.id] = parseInt(msg.newValue) > 0 ? 1 : 0;
                }
                self.updateState();
            };

            for (let s of this.sensors) {
                s.on("change", this.sensorListener);
            }
            setTimeout(() => { self.setup() }, 0);
            this.activated = true;
        }
    }

    deactivate() {
        logger.debug("Deactivating lightTimer '%s'...", this.id)

        if (this.off_from_TO) clearTimeout(this.off_from_TO);
        this.off_from_TO = null;
        if (this.off_to_TO) clearTimeout(this.off_to_TO);
        this.off_to_TO = null;
        if (this.on_from_TO) clearTimeout(this.on_from_TO);
        this.on_from_TO = null;
        if (this.on_to_TO) clearTimeout(this.on_to_TO);
        this.on_to_TO = null;

        this.clearDelayOFF_TO();

        if (this.activated) {
            this.cronjob.stop()
            this.cronjob = null;

            for (let s of this.sensors) {
                s.removeListener("change", this.sensorListener);
            }
            this.sensorListener = null;

            this.activated = false;
        }
    }

    currentState: "ON" | "OFF";

    private lightsON() {
        let previousState = this.currentState;
        this.currentState = "ON";
        logger.error('Lights ON!')
        this.source.emitEvent("change", this.id, { oldValue: previousState, newValue: this.currentState })
    }

    private lightsOFF() {
        let previousState = this.currentState;
        this.currentState = "OFF";
        logger.error('Lights OFF!')
        this.source.emitEvent("change", this.id, { oldValue: previousState, newValue: this.currentState })
    }
}

Source.registerDeviceType(DefaultSource, 'LightTimer', {
    sensors: 'REQUIRED',
    duration: 'REQUIRED',
    on: 'OPTIONAL',
    off: 'REQUIRED',
    priority: 'OPTIONAL',
    activated: 'OPTIONAL'
});
