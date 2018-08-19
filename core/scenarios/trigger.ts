
import { GenericDevice, ConfigLoader, message } from '..';
import { Scenario } from './scenario';

var logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:''-', 5:'error'
});

export abstract class Trigger {
    doc: ConfigLoader;
    scenario: Scenario;
    handler: (m: message) => void;

    constructor(doc: ConfigLoader, scenario: Scenario) {
        this.doc = doc;
        scenario.addTrigger(this);
        this.scenario = scenario;

        this.handler = (msg: message) => {
            if (msg) {
                let boxedMsg: { [key: string]: any } = {};
                Object.keys(msg).forEach((k) => {
                    if (k != "emitter") {
                        boxedMsg[k] = (msg as { [key: string]: any })[k];
                    }
                })
                this.doc.setSandboxMsg(boxedMsg);
            }
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

export class AtTrigger extends Trigger {
    when: string;

    constructor(doc: ConfigLoader, scenario: Scenario, when: string) {
        super(doc, scenario);
        this.when = when;
    }

    activate(callback?: (err: Error, trigger: Trigger) => void): void {
        switch (this.when) {
            case 'startup':
                this.doc.on('startup', this.handler)
                break;
            default:
        }
        callback && callback(null, this);
    }
    deactivate(callback?: (err: Error, trigger: Trigger) => void): void {
        this.doc.removeListener("change", this.handler)
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