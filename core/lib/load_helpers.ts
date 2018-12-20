import * as Parser from "shitty-peg/dist/Parser";

var logger = require('tracer').colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export function currentSource(c: Parser.Parse): string {
    return '"' + c.source.body.substr(c.offset, 30).replace('\n', '\\n') + '..."';
}

export function removeQuotes(s: string): string {
    if (s.length < 2) return s;
    let c = s.charAt(0);
    if (c == s.charAt(s.length - 1) && (c == '"' || c == "'")) return s.substr(1, s.length - 2)
    return s
}

function emptyLine(c: Parser.Parse): any {
    console.log('empty line content found')
}

export function eatComments(c: Parser.Parse): void {
    c.optional((c) => {
        c.skip(/^ *(#.*)?(\n *#.*)*/)
    });
}
/*let document = <doc>c.context().doc;
 
    let comments = true;
    do {
        if (c.isNext(/^\n/)) {
            logger.debug('empty line')
            document.comments[c.location().line()] = '';
            c.skip('\n')
            //c.newline();
        } else if (c.isNext(BLANKLINE)) {
            logger.debug('blank line')
            document.comments[c.location().line()] = c.one(BLANKLINE);
            c.skip('\n')
            //c.newline();
        } else if (c.isNext(COMMENT)) {
            logger.debug('comment')
            document.comments[c.location().line()] = c.one(COMMENT);
            c.skip('\n')
            //c.newline();
        } else {
            logger.debug('rien')
            comments = false;
        }
    } while (comments);
}
*/
export function eatCommentsBlock(c: Parser.Parse): string {
    let comments = true;
    let block = "";

    do {
        if (c.isNext(/^ *\n/)) {
            logger.debug('empty line')
            block += c.one(/^ *\n/);
        } else if (c.isNext(/^ *#.*\n/)) {
            logger.debug('comment')
            block += c.one(/^ *#.*\n/);
            //logger.debug('=>', block)
        } else {
            logger.debug('rien')
            comments = false;
        }
    } while (comments);
    return block;
}

export function trim(s: string): string {
    return s.replace(/ *([^ ]*).*/, "$1")
}


export function sortedDeviceList(c: Parser.Parse): string[] {
    let devices: string[] = [];
    for (let d in c.context().devices) {
        devices.push(d)
    }
    // make sure longer items are first so that they are
    // catched first by c.oneOf
    devices.sort((a, b) => { return b.length - a.length });

    return devices;
}

