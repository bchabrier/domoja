//import { Condition } from '../scenarios/condition'
import { Trigger } from './trigger'
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
    else: ActionFunction;
    doc: ConfigLoader;
    path: string;
    stopped: boolean;
    debugMode: boolean;

    constructor(doc: ConfigLoader, path: string) {
        this.doc = doc;
        this.path = path;
        this.stopped = false;
        this.debugMode = false;
    }

    activate(callback?: (err: Error, s: Scenario) => void): void {
        this.triggers.forEach(trigger => {
            trigger.activate();
        });
    }

    deactivate(callback?: (err: Error, s: Scenario) => void): void {
        this.triggers.forEach(trigger => {
            trigger.deactivate();
        });
    }

    setDebugMode(debug: boolean) {
        this.debugMode = debug;
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

    setElseAction(action: ActionFunction): void {
        this.else = action;
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
        if (this.stopped) {
            this.debugMode && logger.info("Scenario stopped, actions have not been run.");
            return cb && cb(null);
        }
        this.debugMode && logger.info("Calling actions...");
        let scenario = this;
        this.action.call(this.doc["sandbox"], function endActions(err: Error) {
            scenario.debugMode && logger.info("Actions have been run.");
            cb && cb(err);
        });
    }

    runElseActions(cb?: (err: Error) => void): void {
        if (this.stopped) {
            this.debugMode && logger.info("Scenario stopped, else actions have not been run.");
            return cb && cb(null);
        }
        this.debugMode && logger.info("Calling else actions...");
        let scenario = this;
        this.else.call(this.doc["sandbox"], function endElseActions(err: Error) {
            scenario.debugMode && logger.info("Else actions have been run.");
            cb && cb(err);
        });
    }

    start(cb: (err: Error) => void): void {
        this.stopped = false;

        // check conditions
        this.checkConditions((err: Error, success: boolean) => {
            if (err) {
                logger.debug('Got error %s while checking conditions.', err);
                logger.debug(err.stack);
                cb(err);
            } else if (success) {
                // run actions
                this.runActions((err: Error) => {
                    if (err) {
                        logger.debug('Got error %s while running actions.', err);
                        logger.debug(err.stack);
                    } else {
                        logger.debug('Successfully run all actions.');
                    }
                    cb(err);
                });
            } else {
                // run else actions
                if (this.else) {
                    this.runElseActions((err: Error) => {
                        if (err) {
                            logger.debug('Got error %s while running else actions.', err);
                            logger.debug(err.stack);
                        } else {
                            logger.debug('Successfully run all else actions.');
                        }
                        cb(err);
                    });
                } else {
                    cb(null);
                }
            }
        });
    }

    stop() {
        this.stopped = true;
    }
}