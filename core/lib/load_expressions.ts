import * as Parser from "shitty-peg/dist/Parser";
import { currentSource, removeQuotes } from './load_helpers';
import { ConfigLoader } from './load';


var logger = require('tracer').colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

type ExpressionFunction = (cb: (err: Error, result: string) => void) => void;

export let QUOTED_STRING = Parser.token(/^(("[^"]*")|('[^']*'))/, '"quoted string"');

export function expression(c: Parser.Parse): ExpressionFunction {
    logger.debug('Trying expression with', currentSource(c));

    let exp = <any>c.oneOf(
        timeOrIntExpression,
        quotedStringExpression,
        interpretedExpression,
    );
    logger.debug('Got expression, continuing with', currentSource(c));
    return exp;
}


function interpretedDeviceState(c: Parser.Parse): string {
    logger.debug('Trying interpretedDeviceState with', currentSource(c));
    let deviceState = c.one(/^\w+(\.\w+)*/);
    c.and(/^ *(} *#.*|, *\w+: ) /);
    let ret = 'this.getDeviceState(' + deviceState + ')'; 
    logger.debug('Got interpretedDeviceState, continuing with', currentSource(c));
    return ret;
}

function interpretedJavascriptString(c: Parser.Parse): string {
        logger.debug('Trying interpretedString with', currentSource(c));
    let str =  c.one((c: Parser.Parse) => {
        let s = '';
        let more = true;
        while (more) {
            s += c.one(/^[^ },]+/);
            logger.debug('read ', s)
            if (c.isNext(/^ *} *(#.*)?\n/) || c.isNext(/^ *, *[-a-zA-Z0-9]+: +/)) {
                // end of block with "}",        or followed by a "key: "
                more = false;
                logger.debug('stop!')
            } else {
                s += c.one(/^[ },] */);
            }
        }
        return s
    });
    logger.debug('Got interpretedString, continuing with', currentSource(c));
    return str;
}

function quotedStringExpression(c: Parser.Parse): ExpressionFunction {
    logger.debug('Trying quotedStringExpression with', currentSource(c));

    let res = removeQuotes(c.one(QUOTED_STRING));

    logger.debug('Got quotedStringExpression, continuing with', currentSource(c));
    logger.debug("Quoted string expression '%s'.", res)

    return function (cb: (err: Error, result: string) => void) {
        logger.debug("Quoted string expression '%s'.", res)
        cb(null, res);
    }
}

function timeOrIntExpression(c: Parser.Parse): ExpressionFunction {
    logger.debug('Trying timeOrIntExpression with', currentSource(c));

    let res = c.one(/^((([0-9]{1,2}:)?[0-9]{2}:)?[0-9]{2}|[0-9]+)/);

    logger.debug('Got timeOrIntExpression, continuing with', currentSource(c));
    logger.debug("timeOrIntExpression expression '%s'.", res)

    return function (cb: (err: Error, result: string) => void) {
        logger.debug("timeOrIntExpression expression '%s'.", res)
        cb(null, res);
    }
}



export function interpretedExpression(c: Parser.Parse): ExpressionFunction {
    let document = <ConfigLoader>c.context().doc;

    logger.debug('Trying interpreted expression with', currentSource(c));

    let res = c.oneOf(
        interpretedDeviceState,
        interpretedJavascriptString);

    logger.debug('Found interpreted expression:', res);

    if (/^this\./.test(res)) {
        // e.g. this.msg.oldValue
        return <ExpressionFunction>document.sandboxedFunction("function (cb) {" +
            //"console.log('this. expression: %s', " + res + ");" +
            "cb(null, " + res + ");" +
            "}")
    } else if (c.context().devices[res]) {
        // e.g. aquarium.lampes_start
        return <ExpressionFunction>document.sandboxedFunction("function (cb) {" +
            //"console.log('this. expression: %s', " + res + ");" +
            "cb(null, this.getDeviceState('" + res + "'));" +
            "}")
    } else {
        logger.error('Unsupported expression "%s"', res);
        return function (cb: (err: Error, result: string) => void) {
            cb(null, res);
        }
    }
}
