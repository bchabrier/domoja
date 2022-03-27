import { Source, Parse, parse, token } from 'shitty-peg';
import { Duration } from 'luxon';
export { Duration } from 'luxon';
import { colorConsole, getLevel, setLevel } from 'tracer';

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
    return instrument((c: Parse) => <Duration><unknown>c.pushWhitespaceInsignificant().oneOf(
        calcDurationString(),
        calcMathWithUnit(),
        (c: Parse) => Duration.fromMillis(c.one(calcMath()) * 60 * 1000),
    ));
}

// always longer unit first inside (|)
function unitMinutes() {
    return instrument((c: Parse) => { c.one(token(/^(minutes|minute|min|mn|)/, '"minutes"')); return Duration.fromObject({ minutes: 1 }); });
}

function unitHours() {
    return instrument((c: Parse) => { c.one(token(/^(hours|hour|hr|h)/, '"hours"')); return Duration.fromObject({ hours: 1 }); });
}

function unitDays() {
    return instrument((c: Parse) => { c.one(token(/^(days|day|d)/, '"days"')); return Duration.fromObject({ days: 1 }); });
}

function unitWeeks() {
    return instrument((c: Parse) => { c.one(token(/^(weeks|week|wk|w)/, '"weeks"')); return Duration.fromObject({ days: 7 }); });
}

function unitMonths() {
    return instrument((c: Parse) => { c.one(token(/^(months|month|m)/, '"months"')); return Duration.fromObject({ months: 1 }); });
}

function unitYears() {
    return instrument((c: Parse) => { c.one(token(/^(years|year|yr|y)/, '"years"')); return Duration.fromObject({ years: 1 }); });
}

function unit() {
    return instrument((c: Parse) => {
        return <Duration><unknown>c.oneOf(
            unitMinutes(),
            unitHours(),
            unitDays(),
            unitWeeks(),
            unitMonths(),
            unitYears(),
        );
    });
}

function multiply(mult: number, duration: Duration): Duration;
function multiply(duration: Duration, mult: number): Duration;
function multiply(arg1: number | Duration, arg2: number | Duration): Duration | number {
    if (typeof arg2 === 'number' && typeof arg1 === 'object') return multiply(arg2, arg1);
    if (typeof arg2 === 'object' && typeof arg1 === 'number') {
        const mult = arg1;
        const duration = arg2;
        return Duration.fromObject({
            years: mult * duration.years,
            months: mult * duration.months,
            days: mult * duration.days,
            hours: mult * duration.hours,
            minutes: mult * duration.minutes,
        });
    }
    throw undefined;
}

function divide(duration: Duration, denom: number): Duration {
    return Duration.fromObject({
        years: duration.years / denom,
        months: duration.months / denom,
        days: duration.days / denom,
        hours: duration.hours / denom,
        minutes: duration.minutes / denom,
    });
}

function calcDurationString() {
    return instrument((c: Parse) => {
        let duration = Duration.fromObject({});
        const years = c.optional((c: Parse) => multiply(c.one(calcParenOrNumber()), c.one(unitYears())));
        if (years) duration = duration.plus(years);
        const months = c.optional((c: Parse) => multiply(c.one(calcParenOrNumber()), c.one(unitMonths())));
        if (months) duration = duration.plus(months);
        const weeks = c.optional((c: Parse) => multiply(c.one(calcParenOrNumber()), c.one(unitWeeks())));
        if (weeks) duration = duration.plus(weeks);
        const days = c.optional((c: Parse) => multiply(c.one(calcParenOrNumber()), c.one(unitDays())));
        if (days) duration = duration.plus(days);
        const hours = c.optional((c: Parse) => multiply(c.one(calcParenOrNumber()), c.one(unitHours())));
        if (hours) duration = duration.plus(hours);
        const minutes = c.optional((c: Parse) => multiply(c.one(calcParenOrNumber()), c.one(unitMinutes())));
        if (minutes) duration = duration.plus(minutes);
        c.end();

        return duration;
    });
}

function calcMath() {
    return instrument((c: Parse) => c.one(calcAdd()));
}

function calcMathWithUnit() {
    return instrument((c: Parse) => c.one(calcAddWithUnit()));
}

function calcAdd(): (c: Parse) => number {
    return instrument((c: Parse) => {
        const left = c.one(calcMul());
        return parseInt(c.oneOf(
            (c: Parse) => left + c.skip('+').one(calcAdd()),
            (c: Parse) => left - c.skip('-').one(calcAdd()),
            (c: Parse) => left
        ));
    });
}

function calcAddWithUnit(): (c: Parse) => Duration {
    return instrument((c: Parse) => {
        const left = c.one(calcMulWithUnit());
        return <Duration><unknown>c.oneOf(
            (c: Parse) => left.plus(c.skip('+').one(calcAddWithUnit())),
            (c: Parse) => left.minus(c.skip('-').one(calcAddWithUnit())),
            (c: Parse) => left
        );
    });
}

function calcMul(): (c: Parse) => number {
    return instrument((c: Parse) => parseInt(c.oneOf(
        (c: Parse) => c.one(calcParenOrNumber()) * c.skip('*').one(calcMul()),
        (c: Parse) => c.one(calcParenOrNumber()) / c.skip('/').one(calcMul()),
        calcParenOrNumber()
    )));
}

function calcMulWithUnit(): (c: Parse) => Duration {
    return instrument((c: Parse) => <Duration><unknown>(
        c.oneOf(
            (c: Parse) => multiply(c.one(calcParenOrNumber()), c.skip('*').one(calcMulWithUnit())),
            (c: Parse) => multiply(c.one(calcParenOrNumberWithUnit()), c.skip('*').one(calcMul())),
            (c: Parse) => divide(c.one(calcParenOrNumberWithUnit()), c.skip('/').one(calcMul())),
            calcParenOrNumberWithUnit()
        )));
}

var NUM_RX = token(/^[+-]?\d+/, 'number');

function calcNumber() {
    return instrument((c: Parse) => parseInt(c.one(NUM_RX)));
}

function calcNumberWithUnit() {
    return instrument((c: Parse) => multiply(c.one(calcNumber()), c.one(unit())));
}

function calcParen() {
    return instrument((c: Parse) => parseInt(c.oneOf(
        (c: Parse) => {
            c.skip('(');
            var m = c.one(calcMath());
            c.skip(')');
            return m;
        })));
}

function calcParenWithUnit() {
    return instrument((c: Parse) => <Duration><unknown>c.oneOf(
        (c: Parse) => {
            c.skip('(');
            const m = c.one(calcMath());
            c.skip(')');
            const factor = c.one(unit());
            return multiply(m, factor);
        },
        (c: Parse) => {
            c.skip('(');
            var m = c.one(calcMathWithUnit());
            c.skip(')');
            return m;
        }));
}


function calcParenOrNumber() {
    return instrument((c: Parse) => parseInt(c.oneOf(
        calcNumber(),
        calcParen(),
        (c: Parse) => -c.skip('-').one(calcParenOrNumber())
    )));
}

function calcParenOrNumberWithUnit() {
    return instrument((c: Parse) => <Duration><unknown>c.oneOf(
        calcNumberWithUnit(),
        calcParenWithUnit(),
        (c: Parse) => -c.skip('-').one(calcParenOrNumberWithUnit())
    ));
}

function startOfSource(c: Parse) {
    const MAXLEN = 10;
    const str = c.source.body ? c.source.body.substr(c.location().offset, MAXLEN) : "<undefined>";

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

export function parseDuration(source: string): Duration | undefined {
    const level = getLevel();
    try {
        return parse(new Source(source || 'undefined'), duration());
    } catch (e) {
        // in case of failure, reexecute parsing in debug mode
        if (isDebugActive()) {
            setLevel(2);
            try {
                parse(new Source(source), duration())
            } catch (err) { }
            finally {
                setLevel(level);
            }
        }

        const col = parseInt(e.message.replace(/^.*:(\d+)$/, '$1'));
        const title = 'Error in duration:'
        logger.error(title, source);
        logger.error('-'.repeat(title.length + col) + '^');
        logger.error(e.message);
        return undefined;
    }
}
