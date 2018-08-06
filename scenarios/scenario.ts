//import { Condition } from '../scenarios/condition'
import { Action } from '../scenarios/action'
import { GenericDevice } from '../devices/genericDevice'
import { message } from '../sources/source'
import { ConfigLoader, getDevice, getSource } from '../lib/load'

var logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:''-', 5:'error'
});

export type ConditionFunction = (cb: (err: Error, condition: boolean) => void) => void;
export type ActionFunction = (cb: (err: Error) => void) => void;



export abstract class Scenario {
    condition: ConditionFunction;
    action: ActionFunction;
    doc: ConfigLoader

    constructor(doc: ConfigLoader) {
        this.doc = doc;
    }

    abstract activate(callback?: (err: Error, s: Scenario) => void): void;
    abstract deactivate(callback?: (err: Error, s: Scenario) => void): void;

    setCondition(condition: ConditionFunction): void {
        this.condition = condition;
    }

    setAction(action: ActionFunction): void {
        this.action = action;
    }

    checkConditions(callback: (err: Error, success: boolean) => void): void {
        if (this.condition) {
            logger.debug('Checking condition...')
            this.condition.call(this.doc["sandbox"], callback)
        } else {
            logger.debug('No condition, skipping check.')
            callback(null, true);
        }
    }

    runActions(cb?: (err: Error) => void): void {
        logger.debug("Calling actions...");
        this.action.call(this.doc["sandbox"], function endActions(err: Error) {
            logger.debug("All actions have been run.");
            cb && cb(err);
        });
    }
}

export class StateScenario extends Scenario {
    device: GenericDevice;
    deviceName: string
    handler: (m: message) => void;

    constructor(doc: ConfigLoader, device: string) {
        super(doc)
        this.deviceName = device!;

        logger.debug('creating StateScenario with device=', device)

        this.handler = (msg: message) => {
            this.doc.setSandboxMsg({oldValue: msg.oldValue,
            newValue: msg.newValue});

            // check conditions
            this.checkConditions((err: Error, success: boolean) => {
                if (success) {
                    // run actions
                    this.runActions((err: Error) => {
                        this.doc.setSandboxMsg({});
                        if (err) throw err;
                    });
                } else {
                    this.doc.setSandboxMsg({});
                    if (err) throw err;
                }
            });
        }
    }

    activate(callback?: (err: Error, s: Scenario) => void): void {
        this.device = this.doc.getDevice(this.deviceName)
        if (this.device) {
            logger.debug("setting 'on change' handler for device", this.deviceName)
            this.device.on("change", this.handler)
        }
        callback && callback(null, this);
    }
    deactivate(callback?: (err: Error, s: Scenario) => void): void {
        this.device && this.device.removeListener("change", this.handler)
        callback && callback(null, this);
    }
}
