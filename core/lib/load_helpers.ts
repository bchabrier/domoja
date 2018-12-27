import * as Parser from "shitty-peg/dist/Parser";

var logger = require('tracer').colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export function currentSource(c: Parser.Parse): string {
    let s = c.source.body.substr(c.offset, 30);
    while (s.indexOf('\n') >= 0) {
        // strangely enough, "replace" does not replace all occurrences...
        s = s.replace('\n', '\\n');
    }
    return '"' + s + (s.length > 30 ? '...' : '') + '"';
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


export function eatCommentsBlock(c: Parser.Parse): string {
    let comments = true;
    let block = "";
    let willEatNewLine = false;

    if (c.source.body[c.offset] != '\n') {
        if (c.isNext(/^ *(#.*)?(?=\n)/)) block += c.one(/^ *(#.*)?(?=\n)/);
        willEatNewLine = true;
    }

    do {
        if (c.isNext(/^\n *(#.*)?(?=\n)/)) {
            logger.debug('comment:', currentSource(c));
            block += c.one(/^\n *(#.*)?(?=\n)/);
        } else {
            logger.debug('no more a comment:', currentSource(c));
            comments = false;
            logger.debug('read comment block: "' + block + '"');
            if (block.length > 0) {
                block = block.substr(1);
            }
            if (c.source.body[c.offset] == '\n') {
                logger.debug("about to read newline");
                c.newline();
                logger.debug("read newline");
            }
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

