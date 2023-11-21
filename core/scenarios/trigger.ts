
import { GenericDevice, ConfigLoader, message, CRONPATTERN } from '..';
import { Scenario } from './scenario';

import { CronJob } from 'cron';
import * as dayjs from 'dayjs';
var customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

var logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:''-', 5:'error'
});

export abstract class Trigger {
    doc: ConfigLoader;
    scenario: Scenario;
    handler: (m?: message) => void;
    reason: string = null;

    constructor(doc: ConfigLoader, scenario: Scenario) {
        this.doc = doc;
        scenario.addTrigger(this);
        this.scenario = scenario;

        this.handler = (msg?: message) => {
            this.scenario.debugMode && logger.info('Scenario "%s" triggers%s...', this.scenario.path, this.reason ? " due to " + this.reason : "");
            logger.debug('Scenario "%s" triggers%s...', this.scenario.path, this.reason ? " due to " + this.reason : "");
            this.reason = null;
            msg && this.doc.setSandboxMsg(msg);

            this.scenario.start(err => {
                logger.debug('Done running scenario "%s"', this.scenario.path);
                err && logger.warn(`Error while executing scenario '${this.scenario.path}':`, err);
                logger.debug('Resetting sandbox.');
                this.doc.setSandboxMsg({});
            });
        }
    }

    abstract activate(callback: (err: Error, trigger: Trigger) => void): void;
    abstract deactivate(callback: (err: Error, trigger: Trigger) => void): void;

}

export class TimeTrigger extends Trigger {
    when: string;
    cronJob: CronJob;
    timeout: NodeJS.Timeout;
    atHandler: (msg: message) => void;

    constructor(doc: ConfigLoader, scenario: Scenario, when: string) {
        super(doc, scenario);
        this.when = when;
    }

    static dateTime(dateString: string): number {
        // check the supported date / time formats
        let m = dayjs(dateString);
        if (!m.isValid()) m = dayjs(dateString, [
            'HH:mm',
            'HH:mm:ss',
            'DD/MM/YYYY HH:mm:ss',
        ]);
        //logger.info(dateString, "->", m, m.valueOf(), new Date(m.valueOf()));
        return m.valueOf();
    }

    activate(callback?: (err: Error, trigger: Trigger) => void): void {
        if (this.when == 'startup') {
            this.doc.on('startup', () => { this.reason = "startup"; this.handler() });
        } else if (this.doc.devices[this.when]) {
            // use state as date
            this.atHandler = (msg) => {
                if (msg.newValue == msg.oldValue) return;

                let dt = TimeTrigger.dateTime(msg.newValue);

                this.scenario.debugMode && logger.info(`Scenario "${this.scenario.path}" trigger date redefined due to device "${this.when}"'s state change from "${msg.oldValue}" to "${msg.newValue}".`);
                this.cronJob && this.cronJob.stop();
                if (!isNaN(dt) && dt > Date.now()) {
                    this.cronJob = new CronJob(new Date(dt), () => { this.reason = new Date(dt) + " reached"; this.handler() });
                    this.cronJob.start();
                    this.scenario.debugMode && logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates());
                } else {
                    this.scenario.debugMode && logger.info('Scenario "%s" will not trigger. "%s" is invalid or in the past.', this.scenario.path, msg.newValue);
                    this.cronJob = undefined;
                }
            }
            this.doc.devices[this.when].device.on('change', this.atHandler);
            this.atHandler({
                oldValue: null,
                newValue: this.doc.devices[this.when].device.getState(),
                id: this.doc.devices[this.when].device.id,
                emitter: this.doc.devices[this.when].device,
                date: new Date
            });
        } else if (this.when.match(CRONPATTERN)) {
            // cronjob
            this.cronJob = new CronJob(this.when, () => {
                this.reason = this.when + " reached";
                this.handler();
                this.scenario.debugMode && logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates())
            });
            this.cronJob.start();
            this.scenario.debugMode && logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates())
        } else {
            let dt = TimeTrigger.dateTime(this.when);
            if (!isNaN(dt)) {
                if (!isNaN(dt) && dt > Date.now()) {
                    this.timeout && clearTimeout(this.timeout);
                    setTimeout(() => { this.reason = dt + " reached"; this.handler() }, dt - Date.now());
                    this.scenario.debugMode && logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, new Date(dt));
                } else {
                    this.scenario.debugMode && logger.info('Scenario "%s" will not trigger. "%s" is invalid or in the past.', this.scenario.path, this.when);
                    this.timeout = undefined;
                }
            } else {
                logger.error('Unsupported expression "%s".', this.when);
            }
        }
        callback && callback(null, this);
    }
    deactivate(callback?: (err: Error, trigger: Trigger) => void): void {
        if (this.when == 'startup') {
            this.doc.removeListener('startup', this.handler);
        } else if (this.doc.devices[this.when]) {
            this.doc.devices[this.when].device && this.doc.devices[this.when].device.removeListener('change', this.atHandler);
            this.cronJob && this.cronJob.stop();
            this.cronJob = null;
        } else if (this.when.match(CRONPATTERN)) {
            this.cronJob && this.cronJob.stop();
            this.cronJob = null;
        }

        callback && callback(null, this);
    }

}

export class StateTrigger extends Trigger {
    device: GenericDevice;
    deviceName: string

    constructor(doc: ConfigLoader, scenario: Scenario, device: string) {
        super(doc, scenario);
        this.deviceName = device!;

        logger.debug('creating StateScenario with device=', device)

    }

    activate(callback?: (err: Error, trigger: Trigger) => void): void {
        this.device = this.doc.getDevice(this.deviceName)
        if (this.device) {
            logger.debug("setting 'on change' handler for device", this.deviceName)
            this.device.on("change", this.handler)
        }
        callback && callback(null, this);
    }
    deactivate(callback?: (err: Error, trigger: Trigger) => void): void {
        this.device && this.device.removeListener("change", msg => { this.reason = this.device.id + `'s state changed from '${msg.oldValue}' to '${msg.newValue}'`; this.handler(msg) })
        callback && callback(null, this);
    }

}