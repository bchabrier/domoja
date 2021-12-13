import 'mocha';

import assert = require('assert');
import { parseDuration } from '../core/persistence/durationParser';

//import * as zibase from '../sources/zibase';


describe('Module durationParser', function () {
    this.timeout(10000);

    const successTrials = [
        '10', 10,
        '-10', -10,
        '10 + 3', 13,
        '10 + 2*3', 16,
        '2*5 + 10/10', 11,
        '10 hours', 10 * 60,
        '10 hours - 5 mn', 10 * 60 - 5,
        '10 hours + (10/5) mn', 10 * 60 + (10 / 5),
        '2 * 5 hours', 2 * 5 * 60,
        '10 h + 15 mn', 10 * 60 + 15,
        '(5 + 5)', 10,
        '(5 + 5) years', 10 * 365 * 24 * 60,
        '1 d + 1h + 10mn', 24 * 60 + 60 + 10,
        '(10 mn + 15 hour) * 2', (10 + 15 * 60) * 2,
        '2 * (10 mn + 15 hour) * 2', 2 * (10 + 15 * 60) * 2,
        '1d 1h 10mn', 24 * 60 + 60 + 10,
        '(10 + 1) hour (5 * 2) minutes', (10 + 1) * 60 + (5 * 2),
        '1y1m1w1d1h1min', (365 * 24 * 60) + (30 * 24 * 60) + (7 * 24 * 60) + 24 * 60 + 60 + 1,
    ];

    const failTrials = [
        undefined,
        '10 20',
        '10 / 0',
        '5 hours 10 / 0 minutes',
        '10 / 10 hours',
        '10 / 10 hours + 5/5 minutes',
        '10 + 15 mn',
        '10 mn + 15 ',
        '(10 mn + 15) ',
        '(10 + 15 ',
        '(10 min + 1 hour) hour (5 * 2) minutes',
        ' minutes',
        ' 1 minute 1 minute',
        ' 1 hour 15',
        ' 1 something',
    ];

    for (let i = 0; i < successTrials.length; i += 2) {
        const source = successTrials[i] as string;
        const result = successTrials[i + 1] as number;
        it(`should parse '${source}' to ${result}`, () => {
            const res = parseDuration(source);
            assert.ok(res);
            assert.equal(res.shiftTo('minutes').minutes, result);
        });
    }

    for (let i = 0; i < failTrials.length; i++) {
        const source = failTrials[i];
        it(`should not parse '${source}'`, () => {
            assert.equal(parseDuration(source), undefined);
        });
    }

});
