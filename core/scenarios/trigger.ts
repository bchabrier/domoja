
import { GenericDevice, ConfigLoader, message, CRONPATTERN } from '..';
import { Scenario } from './scenario';

import { CronJob } from 'cron';
import * as moment from 'moment';

var logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:''-', 5:'error'
});

export abstract class Trigger {
    doc: ConfigLoader;
    scenario: Scenario;
    handler: (m?: message) => void;

    constructor(doc: ConfigLoader, scenario: Scenario) {
        this.doc = doc;
        scenario.addTrigger(this);
        this.scenario = scenario;

        this.handler = (msg?: message) => {
            logger.info('Scenario "%s" triggers...', this.scenario.path);
            msg && this.doc.setSandboxMsg(msg);

            this.scenario.start(err => {
                err && logger.warn(`Error while executing scenario '${this.scenario.path}':`, err);
                logger.debug('Resetting sandbox.');
                this.doc.setSandboxMsg({});
            });
        }
    }

    abstract activate(callback?: (err: Error, trigger: Trigger) => void): void;
    abstract deactivate(callback?: (err: Error, trigger: Trigger) => void): void;

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
        let m = moment(dateString)
        if (!m.isValid()) m = moment(dateString, [
            'HH:mm',
            'HH:mm:ss',
            'DD/MM/YYYY HH:mm:ss',
        ]);
        console.log(dateString, m.format())

        return m.valueOf();
    }

    activate(callback?: (err: Error, trigger: Trigger) => void): void {
        if (this.when == 'startup') {
            this.doc.on('startup', this.handler);
        } else if (this.doc.devices[this.when]) {
            // use state as date
            this.atHandler = (msg) => {
                let dt = TimeTrigger.dateTime(msg.newValue);

                this.cronJob && this.cronJob.stop();
                if (!isNaN(dt) && dt > Date.now()) {
                    this.cronJob = new CronJob(new Date(dt), this.handler);
                    this.cronJob.start();
                    logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates());
                } else {
                    logger.info('Scenario "%s" will not trigger. "%s" is invalid or in the past.', this.scenario.path, msg.newValue);
                    this.cronJob = undefined;
                }
            }
            this.doc.devices[this.when].device.on('change', this.atHandler);
        } else if (this.when.match(CRONPATTERN)) {
            // cronjob
            this.cronJob = new CronJob(this.when, () => {
                this.handler();
                logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates())
            });
            this.cronJob.start();
            logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates())
        } else {
            let dt = TimeTrigger.dateTime(this.when);
            if (!isNaN(dt)) {
                if (!isNaN(dt) && dt > Date.now()) {
                    this.timeout && clearTimeout(this.timeout);
                    setTimeout(this.handler, dt - Date.now());
                    logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, new Date(dt));
                } else {
                    logger.info('Scenario "%s" will not trigger. "%s" is invalid or in the past.', this.scenario.path, this.when);
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
        this.device && this.device.removeListener("change", this.handler)
        callback && callback(null, this);
    }

}