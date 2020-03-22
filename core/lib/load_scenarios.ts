import * as Parser from "shitty-peg/dist/Parser";
import { currentSource, removeQuotes, eatCommentsBlock, eatComments, trim, sortedDeviceList } from './load_helpers';
import { ConfigLoader, Sandbox, DASH, FUNCTION_EXT, IDENTIFIER } from './load';
import { expression } from './load_expressions';
import { Scenario, ConditionFunction, ActionFunction } from '../../core/scenarios/scenario'
import * as async from 'async';


var logger = require('tracer').colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

let CONDITIONS = Parser.token(/^conditions: */, '"conditions:"');
let ACTIONS = Parser.token(/^actions: */, '"actions:"');

export function condition(c: Parser.Parse): ConditionFunction {
    c.skip(CONDITIONS);
    return c.one(conditionArray);
}

type NamedCondition = { name: string, fct: ConditionFunction };

function conditionArray(c: Parser.Parse): ConditionFunction {
    c.indent();
    let conditions: NamedCondition[] = <any>c.many(
        (c: Parser.Parse) => {
            eatCommentsBlock(c);
            c.skip(DASH);
            return c.one(singleCondition)
        },
        (c: Parser.Parse) => { c.newline() });

    let conditionArrayFunction = function (cb: (err: Error, cond: boolean) => void) {
        let self = this;
        let n = 1;
        let N = conditions.length;
        async.everySeries(conditions, function (condition, callback) {
            logger.debug("Calling condition '%s' (%s/%s)...", condition.name, n, N);
            n++;
            condition.fct.call(self, function (err: Error, cond: boolean) {
                logger.debug("Result is", cond, ", err:", err);
                callback(err, cond);
            });
        }, function (err: Error, result: boolean) {
            if (err) {
                logger.debug('Got error %s while running %s conditions in series', err, N);
            } else {
                logger.debug('Done calling %s conditions in series with result', N, result);
            }
            cb(err, result)
        });
    };
    c.dedent();
    c.newline();
    return conditionArrayFunction;
}

function unnamedCondition(c: Parser.Parse): NamedCondition {
    logger.debug('Trying unnamedCondition with', currentSource(c));
    let document = <ConfigLoader>c.context().doc;
    let fct: ConditionFunction = <ConditionFunction><any>c.oneOf(
        (c: Parser.Parse) => {
            logger.debug("Trying ext function with", currentSource(c))
            let f = document.sandboxedExtFunction(c.one(FUNCTION_EXT));
            logger.debug('Got ext function, continuing with', currentSource(c));
            return f;
        },
        binaryCondition
    );
    eatComments(c);
    logger.debug('Got unnamedCondition, continuing with', currentSource(c));
    return { name: "<noname>", fct: fct };
}

function singleCondition(c: Parser.Parse): NamedCondition {
    logger.debug("trying singleCondition with", currentSource(c))
    let res: { name: string, fct: ConditionFunction } = <any>c.oneOf(
        namedCondition,
        unnamedCondition
    )
    eatComments(c);
    logger.debug("found singleCondition")
    return res;
}


function namedCondition(c: Parser.Parse): NamedCondition {
    logger.debug("trying namedCondition with", currentSource(c))
    let name = trim(c.one(IDENTIFIER));
    logger.debug("found ID", name);
    c.skip(Parser.token(/^ *: */, '":"'));

    let f = c.one(unnamedCondition).fct;
    logger.debug("found namedCondition")

    return { name: name, fct: f };
}


function binaryCondition(c: Parser.Parse): ConditionFunction {
    let document = <ConfigLoader>c.context().doc;

    logger.debug("trying binaryCondition with", currentSource(c));

    c.skip(/^{ */)
    c.skip(/^operator: */)
    logger.debug("trying operator with", currentSource(c));
    let operator = removeQuotes(c.oneOf(
        Parser.token(/^(["']?)=\1/, '"="'),
        Parser.token(/^(["']?)!=\1/, '"!="'),
    ));
    logger.debug("found operator:", operator);

    c.skip(/^, */)
    c.skip(/^left: */)
    let left = c.one(expression)
    logger.debug("found left:", left);
    c.skip(/^, */)
    c.skip(/^right: */)
    let right = c.one(expression)
    logger.debug("found right:", right);
    c.skip(/^ *} */)

    let binaryExpression: (left: string, right: string) => boolean;

    switch (operator) {
        case '=': binaryExpression = (left: string, right: string) => { return left == right };
            break;
        case '!=': binaryExpression = (left: string, right: string) => { return left != right };
            break;
        default: logger.error('Binary operator "%s" not yet supported!', operator);
    }

    return (cb: (err: Error, cond: boolean) => void) => {
        logger.debug("Retrieving args of binaryExpression '%s'", operator)
        async.parallel({
            left: left,
            right: right
        }, function (err, results) {
            let res = binaryExpression(results.left, results.right);
            logger.debug("Computing binaryExpression '%s' '%s' '%s' => %s...", results.left, operator, results.right, res)
            cb(null, res);
        });
    }
}

export function actions(c: Parser.Parse): ActionFunction {
    logger.debug('trying actions with:', currentSource(c));
    c.skip(ACTIONS);
    logger.debug('trying actionsArray with:', currentSource(c));
    let a = c.one(actionArray);
    logger.debug('found actions:')
    return a;
}

type NamedAction = { name: string, fct: ActionFunction };

function actionArray(c: Parser.Parse): ActionFunction {
    c.indent();
    let actions: NamedAction[] = <any>c.many(
        (c: Parser.Parse) => {
            eatCommentsBlock(c);
            c.skip(DASH);
            return c.one(singleAction);
        },
        (c: Parser.Parse) => { c.newline() });

    let actionArrayFunction = function (cb: (err: Error) => void) {
        let self = this;
        let n = 1;
        let N = actions.length;
        async.eachSeries(actions, function (action, callback) {
            logger.debug("Calling action '%s' (%d/%d)...", action.name, n, N);
            n++;
            action.fct.call(self, callback);
        }, function (err: Error) {
            if (err) {
                logger.debug('Got error %s when calling %s actions in series.', err, N)
            } else {
                logger.debug('Done calling %d actions in series.', N)
            }
            cb(err);
        });
    };
    c.dedent();
    return actionArrayFunction;
}

function singleAction(c: Parser.Parse): NamedAction {
    logger.debug("trying singleAction with", currentSource(c));
    let res: { name: string, fct: ActionFunction } = <any>c.oneOf(
        namedAction,
        unnamedAction
    )
    eatComments(c);
    logger.debug("found singleAction")
    return res;
}

function unnamedAction(c: Parser.Parse): NamedAction {
    logger.debug("trying unnamedAction")
    let document = <ConfigLoader>c.context().doc;
    let fct: ActionFunction = <ActionFunction><any>c.oneOf(
        (c: Parser.Parse) => {
            return document.sandboxedExtFunction(c.one(FUNCTION_EXT));
        },
        stateAction
    );
    eatComments(c);
    logger.debug("found unnamedAction")
    return { name: "<noname>", fct: fct };

}

function namedAction(c: Parser.Parse): NamedAction {
    logger.debug("trying namedAction")
    let name = trim(c.one(IDENTIFIER));
    c.skip(Parser.token(/^ *: */, '":"'));

    let f = c.one(unnamedAction).fct;
    logger.debug("found namedAction")

    return { name: name, fct: f };
}

function stateAction(c: Parser.Parse): ActionFunction {
    logger.debug("trying stateAction")
    c.skip(Parser.token(/^ *{ */, '"{"'));
    c.skip(Parser.token(/^device: */, '"device:"'));

    let document = <ConfigLoader>c.context().doc;

    let device = c.oneOf(...sortedDeviceList(c));
    c.skip(Parser.token(/^, */, '","'));
    c.skip(Parser.token(/^state: */, '"state:"'));
    let value = c.one(expression);
    c.skip(/^ *} */);

    logger.debug("found stateAction");

    return function (cb: (err: Error) => void) {
        let self = this as Sandbox;
        value((err, result) => {
            self.getDevice(device) && self.getDevice(device).setState(result, cb);
        });
    }

    /*
    let isString = false;
    if (value.length > 1 && value.charAt(0) == value.charAt(value.length - 1) &&
        (value.charAt(0) == "'" || value.charAt(0) == '"')) {
        // quoted string
        isString = true;
        value = removeQuotes(value);
    }

    let today = new Date().toDateString();
    let date: Date = undefined;

    if (parseInt(value, 10).toString() != value) {
        if (new Date(value).toString() != 'Invalid Date') {
            date = new Date(value);
        } else if (new Date(today + ' ' + value).toString() != 'Invalid Date') {
            date = new Date(today + ' ' + value);
        }
    }
    if (date) {
        // date value
        return function (cb: (err: Error) => void) {
            let self = this as Sandbox;
            self.getDevice(device) && self.getDevice(device).setState(date, cb);
        }
    } else if (isString) {
        return function (cb: (err: Error) => void) {
            let self = this as Sandbox;
            self.getDevice(device) && self.getDevice(device).setState(value, cb);
        }
    } else if (c.context().devices[value]) {
        // interpreted string
        return function (cb: (err: Error) => void) {
            let self = this as Sandbox;
            self.getDevice(device) && self.getDevice(device).setState(self.getDeviceState(value), cb);
        }
    } else {
        logger.error('Unsupported state expression "%s".', value);
    }
    */
}
