import { Source, Parse, parse, token } from 'shitty-peg';

import { colorConsole, setLevel } from 'tracer';

const logger = colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

let indent = 0;
let id = 0;

function getId() {
    return ++id;
}

function duration() {
    indent = 0;
    id = 0;
    return instrument((c: Parse) => parseInt(c.pushWhitespaceInsignificant().oneOf(
        calcDurationString(),
        calcMath(true),
        calcMath(false),
    )));
}

function unitMinutes() {
    return instrument((c: Parse) => { c.one(token(/^(minutes|minute|min|mn|)/, '"minutes"')); return 1; });
}

function unitHours() {
    return instrument((c: Parse) => { c.one(token(/^(hours|hour|hr|h)/, '"hours"')); return 60; });
}

function unitDays() {
    return instrument((c: Parse) => { c.one(token(/^(days|day|d)/, '"days"')); return 24 * 60; });
}

function unitWeeks() {
    return instrument((c: Parse) => { c.one(token(/^(weeks|week|wk|w)/, '"weeks"')); return 7 * 24 * 60; });
}

function unitMonths() {
    return instrument((c: Parse) => { c.one(token(/^(months|month|m)/, '"months"')); return 30 * 24 * 60; });
}

function unitYears() {
    return instrument((c: Parse) => { c.one(token(/^(years|year|yr|y)/, '"years"')); return 365 * 24 * 60; });
}

function unit() {
    return instrument((c: Parse) => {
        return parseInt(c.oneOf(
            // always longer unit first inside (|)
            unitMinutes(),
            unitHours(),
            unitDays(),
            unitWeeks(),
            unitMonths(),
            unitYears(),
        ));
    });
}

function calcDurationString() {
    return instrument((c: Parse) => {
        const years = c.optional((c: Parse) => c.one(calcParenOrNumber(false)) * c.one(unitYears()));
        const months = c.optional((c: Parse) => c.one(calcParenOrNumber(false)) * c.one(unitMonths()));
        const weeks = c.optional((c: Parse) => c.one(calcParenOrNumber(false)) * c.one(unitWeeks()));
        const days = c.optional((c: Parse) => c.one(calcParenOrNumber(false)) * c.one(unitDays()));
        const hours = c.optional((c: Parse) => c.one(calcParenOrNumber(false)) * c.one(unitHours()));
        const minutes = c.optional((c: Parse) => c.one(calcParenOrNumber(false)) * c.one(unitMinutes()));
        c.end();

        return (isNaN(years) ? 0 : years) +
            (isNaN(months) ? 0 : months) +
            (isNaN(weeks) ? 0 : weeks) +
            (isNaN(days) ? 0 : days) +
            (isNaN(hours) ? 0 : hours) +
            (isNaN(minutes) ? 0 : minutes);
    });
}

function calcMath(withUnit: boolean) {
    return instrument(`calcMath(${withUnit})`, (c: Parse) => c.one(calcAdd(withUnit)));
}

function calcAdd(withUnit: boolean) {
    return instrument(`calcAdd(${withUnit})`, (c: Parse) => {
        const left = c.one(calcMul(withUnit));
        return parseInt(c.oneOf(
            (c: Parse) => left + c.skip('+').one(calcAdd(withUnit)),
            (c: Parse) => left - c.skip('-').one(calcAdd(withUnit)),
            (c: Parse) => left
        ))
    });
}

function calcMul(withUnit: boolean) {
    return instrument(`calcMul(${withUnit})`, (c: Parse) => parseInt(withUnit ?
        c.oneOf(
            (c: Parse) => c.one(calcParenOrNumber(false)) * c.skip('*').one(calcMul(true)),
            (c: Parse) => c.one(calcParenOrNumber(true)) * c.skip('*').one(calcMul(false)),
            (c: Parse) => c.one(calcParenOrNumber(false)) / c.skip('/').one(calcMul(true)),
            (c: Parse) => c.one(calcParenOrNumber(true)) / c.skip('/').one(calcMul(false)),
            calcParenOrNumber(true)
        ) :
        c.oneOf(
            (c: Parse) => c.one(calcParenOrNumber(false)) * c.skip('*').one(calcMul(false)),
            (c: Parse) => c.one(calcParenOrNumber(false)) / c.skip('/').one(calcMul(false)),
            calcParenOrNumber(false)
        )));
}

var NUM_RX = token(/^[+-]?\d+/, 'number');

function calcNumber(withUnit: boolean) {
    return instrument(`calcNumber(${withUnit})`, (c: Parse) => parseInt(c.one(NUM_RX)) * (withUnit ? c.one(unit()) : 1));
}

function calcParen(withUnit: boolean) {
    return instrument(`calcParen(${withUnit})`, (c: Parse) => parseInt(
        withUnit ?
            c.oneOf(
                (c: Parse) => {
                    c.skip('(');
                    var m = c.one(calcMath(false));
                    c.skip(')');
                    const factor = c.one(unit());
                    return m * factor;
                },
                (c: Parse) => {
                    c.skip('(');
                    var m = c.one(calcMath(true));
                    c.skip(')');
                    return m;
                })
            :
            c.oneOf(
                (c: Parse) => {
                    c.skip('(');
                    var m = c.one(calcMath(false));
                    c.skip(')');
                    return m;
                })));
}

function calcParenOrNumber(withUnit: boolean) {
    return instrument(`calcParenOrNumber(${withUnit})`, (c: Parse) => parseInt(c.oneOf(
        calcNumber(withUnit),
        calcParen(withUnit),
        (c: Parse) => -c.skip('-').one(calcParenOrNumber(withUnit))
    )));
}

function startOfSource(c: Parse) {
    const MAXLEN = 10;
    console.log('before')
    const str = c.source.body ? c.source.body.substr(c.location().offset, MAXLEN) : "<undefined>";
    console.log('after')

    return `"${str}${str.length < MAXLEN ? "" : "..."}"`;
}

function isDebugActive() {
    return logger.debug.toString() !== 'function(){}'
}

function instrument<T>(parseFunction: (c: Parse) => T): (c: Parse) => T;
function instrument<T>(functionName: string, parseFunction: (c: Parse) => T): (c: Parse) => T;
function instrument<T>(arg1: string | ((c: Parse) => T), arg2?: (c: Parse) => T) {
    const func = typeof arg1 === 'function' ? arg1 : arg2;
    let funcName = typeof arg1 === 'string' ? arg1 : "";

    if (funcName === "") {
        // look first in the function definition
        const ftab = func.toString().split(/(\()/)[0].split(/ +/);
        funcName = ftab[0] === 'function' ? ftab[1] : "";
    }
    if (funcName === "") {
        // if function name not found, look in the stack
        funcName = (new Error()).stack.split('\n')[2].split(/ +/)[2];
    }
    return (c: Parse) => {
        const id = getId();
        indent++;
        if (isDebugActive()) logger.debug(`${' '.repeat(4 - Math.floor(Math.log10(id)))}${id} ${' '.repeat(indent)}trying '${funcName}' on ${startOfSource(c)}`);
        let res;
        try {
            res = func(c);
        } catch (e) {
            if (isDebugActive()) logger.debug(`${' '.repeat(4 - Math.floor(Math.log10(id)))}${id} ${' '.repeat(indent)}failed '${funcName}', remains: ${startOfSource(c)}`);
            indent--;
            throw e;
        }
        if (isDebugActive()) logger.debug(`${' '.repeat(4 - Math.floor(Math.log10(id)))}${id} ${' '.repeat(indent)}done '${funcName}': ${res}, remains: ${startOfSource(c)}`);
        indent--;
        return res;
    }
}

export function parseDuration(source: string): number | undefined {
    setLevel(3);
    try {
        return parse(new Source(source||'undefined'), duration());
    } catch (e) {
        // in case of failure, reexecute parsing in debug mode
        if (isDebugActive()) {
            setLevel(2);
            try {
                parse(new Source(source), duration())
            } catch (err) { }
        }

        const col = parseInt(e.message.replace(/^.*:(\d+)$/, '$1'));
        const title = 'Error in duration:'
        logger.error(title, source);
        logger.error('-'.repeat(title.length + col) + '^');
        logger.error(e.message);
        return undefined;
    }
}
