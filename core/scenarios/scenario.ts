//import { Condition } from '../scenarios/condition'
import { Action } from './action'
import { Trigger } from './trigger'
import { GenericDevice } from '..'
import { message } from '..'
import { ConfigLoader, getDevice, getSource } from '..'

var logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:''-', 5:'error'
});

export type ConditionFunction = (cb: (err: Error, condition: boolean) => void) => void;
export type ActionFunction = (cb: (err: Error) => void) => void;



export class Scenario {
    triggers: Trigger[] = [];
    condition: ConditionFunction;
    action: ActionFunction;
    doc: ConfigLoader

    constructor(doc: ConfigLoader) {
        this.doc = doc;
    }

    activate(callback?: (err: Error, s: Scenario) => void): void {
        this.triggers.forEach(trigger => {
            trigger.activate();
        });
    }
    
    deactivate(callback?: (err: Error, s: Scenario) => void): void  {
        this.triggers.forEach(trigger => {
            trigger.deactivate();
        })
    }

    addTrigger(trigger: Trigger) {
        this.triggers.push(trigger);
    }

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
            logger.debug("Actions have been run.");
            cb && cb(err);
        });
    }
}


