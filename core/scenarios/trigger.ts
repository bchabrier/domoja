
import { GenericDevice, ConfigLoader, message } from '../..';
import { Scenario } from '../../core/scenarios/scenario';

import { CronJob } from 'cron';

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

            // check conditions
            this.scenario.checkConditions((err: Error, success: boolean) => {
                if (!err && success) {
                    // run actions
                    this.scenario.runActions((err: Error) => {
                        if (err) {
                            logger.debug('Got error %s while running actions.', err);
                            logger.debug(err.stack);
                        } else {
                            logger.debug('Successfully run all actions.');
                        }
                        logger.debug('Resetting sandbox.');
                        this.doc.setSandboxMsg({});
                    });
                } else {
                    if (err) {
                        logger.debug('Got error %s while checking conditions.', err);
                        logger.debug(err.stack);
                    }
                    logger.debug('Resetting sandbox.');
                    this.doc.setSandboxMsg({});
                }
            });
        }
    }

    abstract activate(callback?: (err: Error, trigger: Trigger) => void): void;
    abstract deactivate(callback?: (err: Error, trigger: Trigger) => void): void;

}

var cronRE = /([*\d-,]+ *){6}/;

export class TimeTrigger extends Trigger {
    when: string;
    cronJob: CronJob;
    atHandler: (msg: message) => void;

    constructor(doc: ConfigLoader, scenario: Scenario, when: string) {
        super(doc, scenario);
        this.when = when;
    }

    activate(callback?: (err: Error, trigger: Trigger) => void): void {
        if (this.when == 'startup') {
            this.doc.on('startup', this.handler);
        } else if (this.doc.devices[this.when]) {
            // use state as date
            this.atHandler = (msg) => {
                let d = new Date(msg.newValue);

                this.cronJob && this.cronJob.stop();
                if (d.toString() != 'Invalid Date' && d.getTime() > Date.now()) {
                    this.cronJob = new CronJob(d, this.handler);
                    this.cronJob.start();
                    logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates());    
                } else {
                    logger.info('Scenario "%s" will not trigger. "%s" is invalid or in the past.', this.scenario.path, msg.newValue)  ;  
                    this.cronJob = undefined;
                }
            }
            this.doc.devices[this.when].device.on('change', this.atHandler);
        } else if (this.when.match(cronRE)) {
            // cronjob
            this.cronJob = new CronJob(this.when, () => {
                this.handler();
                logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates())
            });
            this.cronJob.start();
            logger.info('Scenario "%s" will trigger at %s.', this.scenario.path, this.cronJob.nextDates())
        } else {
            logger.error('Unsupported expression "%s".', this.when);
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
        } else if (this.when.match(cronRE)) {
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