import * as assert from 'assert';
import { Source, ID, message, Event } from '../sources/source'
import { camera } from './camera'
import { InitObject, Parameters, DomoModule } from '../lib/module';
import { ConfigLoader, getSource, getCurrentConfig } from '../lib/load';
import * as events from 'events';
import * as persistence from '../persistence/persistence';
import * as async from 'async';

//import secrets = require("../secrets");
//const PushBullet = require('pushbullet');
import * as fs from 'fs';
//import sound = require('../lib/sound');

const logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

type TransformFunction = (cb: any, transform?: (value: string) => string) => any;

export type DeviceOptions = {
    transform?: string | TransformFunction,
    camera?: camera,
    others?: { [K in string]: any }
}

export class CustomDeviceType {
    name: string;
    constructor(name: string) { this.name = name }
    toString(): string { return this.name }
}

export type DeviceType = 'device' | 'sensor' | 'variable' | 'group' | 'camera' | 'relay' | CustomDeviceType;

export type WidgetType = 'text' | 'toggle';

export type EventType = "change";

//export var pusher = new PushBullet(secrets.getPushBulletPassword());

//enum NotifyEnum { NEVER, ALWAYS, IN_ALARM };
//pusher.notifyEnum = NotifyEnum;

function transformFunction(callback: any, transform?: (value: string) => string) {
    if (transform != undefined) {
        return function (msg: message) {
            var newMsg = new message;

            for (var a in msg) {
                switch (a) {
                    case 'newValue':
                    case 'oldValue':
                        newMsg[a] = transform(msg[a]);
                        break;
                    default:
                        (<any>newMsg)[a] = (<any>msg)[a];
                }
            }
            callback(newMsg);
        }
    } else {
        return callback;
    }
}

function mappingFunction(mapping: string): TransformFunction {
    let transformRE = /(.*?)=>([^,]+)(,.*?=>[^,]+)*/
    if (!transformRE.test(mapping)) return undefined;

    let mappings: Map<string, string> = new Map();
    let match: RegExpExecArray;
    let input = mapping;
    do {
        match = transformRE.exec(input);
        if (match) {
            mappings.set(match[1], match[2]);
            input = match[3] && match[3].substr(1);
        }
    }
    while (input);

    return transformFunction((value: string) => {
        return mappings.get(value) || mappings.get('*') || value;
    });
}

let allDevices: GenericDevice[] = [];

let backupJob: NodeJS.Timeout;

export abstract class GenericDevice implements DomoModule {
    [x: string]: any;
    name: string;
    path: string;
    id: ID;
    attribute: string;
    source: Source;
    type: DeviceType;
    widget: WidgetType;
    state: string;
    persistence: persistence.mongoDB;
    lastUpdateDate: Date;
    tags: string;

    stateHasBeenSet = false;

    constructor(source: Source, type: DeviceType, instancePath: string, id: ID, attribute: string, name: string, initObject: InitObject, options?: DeviceOptions) {
        this.source = source;

        this.id = id;
        this.path = instancePath;
        this.attribute = attribute || 'state';
        this.name = name;
        this.type = type;
        this.widget = initObject && initObject.widget;
        this.tags = initObject && initObject.tags;

        if (options !== undefined) {
            for (var option in options) {
                switch (option) {
                    case 'transform':
                        let transform = options[option];
                        if (typeof transform == 'string') {
                            this.transform = mappingFunction(transform);
                            if (!this.transform) {
                                logger.warn('Error in transform "%s" of device "%s".', transform, this.path);
                            }
                        } else {
                            this.transform = transform;
                        }

                        break;
                    case 'camera':
                        this.camera = options[option];
                        break;
                    case 'others':
                        for (var member in options[option]) {
                            this[member] = options[option][member]
                        }
                        break;
                    default:
                        logger.error('Unsupported option \'' + option + '\' while creating device \'' + name + '\'.');
                }
            }
        }

        // "mongo:temperature_piscine:1200:aggregate:120000"
        let persistence_spec = initObject && initObject.persistence;
        if (persistence_spec) {
            let pspec = persistence_spec.split(":");
            this.persistence = new persistence.mongoDB(pspec[1], pspec[2], pspec[3], pspec[4]);
        } else {
            this.persistence = new persistence.mongoDB(this.path);
        }

        this.source.addDevice(this);
        allDevices.push(this);
        if (!backupJob) backupJob = setInterval(() => {
            async.reject(allDevices, (device, callback) => {
                device.backupStateToDB((err) => {
                    callback(null, !err);
                });
            }, (err, results) => {
                if (err) {
                    logger.error('Something happened while backing up all devices states:', err)
                }
                if (results.length > 0) {
                    logger.debug(`Some devices could not backup their state, ${results.length} failed: ${results.join(", ")}`);
                }
            });
        }, 60 * 1000);



        this.on("change", (msg) => {
            if (this.persistence) {
                var d = new Date();
                msg.emitter.lastChangeDate = d;
                var infos = <any>{};
                Object.keys(msg).forEach((f: keyof message) => {
                    var t = typeof (msg[f]);
                    // let's store only the flat properties
                    if (t != "object" && t != "function") {
                        infos[f] = msg[f];
                    }
                });

                this.persistence.insert({
                    state: this.state,
                    date: d
                }, (err: Error, docs: message[]) => {
                    if (err != null) {
                        logger.error("Error while storing in %s: ", this.persistence.id, err)
                        logger.error(err.stack)
                    }
                });

                this.persistence.backupStateToDB(this.state, (err: Error) => {
                    if (err != null) {
                        logger.error("Error while backing up %s: ", this.persistence.id, err)
                        logger.error(err.stack)
                    }
                });
            }
        });

        // start polling at an interval until the state is set from the DB
        /*
        let i = 0
        let intvl = setInterval(() => {
            i++;
            if (i == 30 * 10) logger.error(`timeout for device ${this.path}`);
            if (this.stateHasBeenSet) {
                clearInterval(intvl);
            }
        }, 100);

        while (!this.stateHasBeenSet) {
            process.nextTick(() => { });
        }
*/

        if (id && id[0] == "Z") {
            // it is a ZWave device
            // we blink the lamp in case of error
            /*
            self.on("XXXerror", function() {
                sound.say('Attention, le device "' + name + '" est en erreur.');
                //show_ZW_device_error();
                self.once("change", function(msg: message) {
                    logger.error(msg)
                    logger.error(self)
                    logger.error(msg.id, self.id)
                    if (msg.id == self.id) {
                        //clear_ZW_device_error();
                    }
                });
            });
            */
        }
    }

    restoreStateFromDB(callback: (err: Error, success: boolean) => void) {
        this.persistence.restoreStateFromDB((err, value) => {
            if (err) {
                logger.error(`Could not retrieve last persisted value for device "${this.path}":`, err);
            } else {
                if (!this.stateHasBeenSet) {
                    let val = value ? value.state : undefined;
                    this.state = (val instanceof Date) ? val.toString() : val;
                }
            }
            logger.debug(`device ${this.path} state restored to ${this.state}`);
            callback(err, !err);
        });
    }

    backupStateToDB(callback: (err: Error, success: boolean) => void) {
        this.persistence.backupStateToDB(this.state, (err) => {
            if (err) {
                logger.error(`Could not backup state of device "${this.path}":`, err);
            }
            logger.debug(`device ${this.path} state backed up: ${this.state}`);
            callback(err, !err);
        });
    }

    abstract createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): DomoModule;

    release(): void {
        allDevices.splice(allDevices.indexOf(this), 1);
        if (allDevices.length == 0) {
            clearInterval(backupJob);
            backupJob = null;
        }
        if (this.source) {
            this.source.releaseDevice(this);
        }
        this.persistence.release();
        this.persistence = null;
    }

    setState(newState: string | Date, callback: (err: Error) => void): void {
        if (newState instanceof Date) return this.setState(newState.toString(), callback);

        logger.debug('setState of device "%s" to "%s"', this.path, newState);
        this.stateHasBeenSet = true;
        this.source.setAttribute(this.id, this.attribute, newState, callback);
    }

    getState() {
        return this.state;
    }

    /*
    notify(when: string, msg: string) {
        var self = this;

        function doNotify(msg: string) {
            if (self.camera !== undefined) {
                self.camera.getSnapshot(function(err: Error, data: Buffer) {
                    if (err) {
                        logger.error(err);
                    } else {
                        fs.open('/tmp/snapshot.jpg', 'w', function(err, fd) {
                            fs.write(fd, data, 0, data.length, function(err, written, buffer) {
                                if (err) {
                                    logger.error(err);
                                } else {
                                    fs.close(fd, function(err) {
                                        pusher.file('', '/tmp/snapshot.jpg', msg,
                                            function(error: Error, response: any) {
                                                if (error)
                                                    logger.error(error);
                                            });
                                    });
                                }
                            });
                        });
                    }
                });
            } else {
                pusher.note('', msg, "", function(error: Error, response: any) {
                    if (error)
                        logger.error(error);
                });
            }
        }

        logger.warn(msg);
        switch (when) {
            case pusher.notifyEnum.ALWAYS:
                doNotify(msg);
                break;
            case pusher.notifyEnum.IN_ALARM:
                // TODO: use alarmStatus
                var zibase = <any>getSource('myZibase'); // should probably not have this dependency
                zibase.getVariable(18, function(err: Error, val: string) {
                    if (err) {
                        logger.error("Cannot get value of V18.");
                    } else {
                        logger.info("First value:", val);
                        if (val != "0") {
                            // ask a second time (I noticed that sometimes.
                            // the alarm rings while not in alarm mode !!?!?
                            zibase.getVariable(18, function(err: Error, val: string) {
                                if (err) {
                                    logger.error("Cannot get value of V18.");
                                } else {
                                    logger.info("Second value:", val);
                                    if (val != "0") {
                                        var alarmMgr = require('../managers/alarmMgr');
                                        alarmMgr.newAlert();
                                        doNotify(msg);
                                    }
                                }
                            });
                        }
                    }
                });
                break;
            case pusher.notifyEnum.NEVER:
                break;
            default:
                logger.error("Unsupported value '" + JSON.stringify(when) + "'. Possible values are in " + JSON.stringify(pusher.notifyEnum), (new Error).stack);
        }
    }
    */

    private eventListener(callback: (msg: message) => void): (msg: message) => void {
        let self = this;

        return function (msg: message) {
            msg.emitter = self;
            transformFunction(callback, self.transform)(msg);
        }
    }

    on(event: EventType, callback: (msg: message) => void) {
        var self = this;
        this.source.on(event, this.path, this.eventListener(callback));
        return this;
    }

    once(event: EventType, callback: (msg: message) => void) {
        var self = this;
        this.source.once(event, this.path, this.eventListener(callback));
        return this;
    };

    removeListener(event: EventType, callback: (msg: message) => void): this {
        this.source.removeListener(event, this.path, this.eventListener(callback))
        return this;
    }

    matchTag(tag: string): boolean {
        return (' ' + this.tags + ' ').indexOf(' ' + tag + ' ') >= 0;
    }
}

