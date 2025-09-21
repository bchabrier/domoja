import { close, createReadStream, openSync, writeSync } from 'fs';
import { Duration, parseDuration } from './durationParser';

import { colorConsole } from 'tracer';
import * as rd from 'readline/promises';
import * as readline from 'readline';

const logger = colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

// hack to neutralize persistence when app is in demo mode
let demoMode: boolean = false;

export function setDemoMode(mode: boolean) {
    demoMode = mode;
}

export type Strategy = "raw" | "aggregate";

export const ALL_AGGREGATION_TYPES = ["year", "month", "week", "day", "hour", "minute", "change", "none"] as const;
export type AggregationType = (typeof ALL_AGGREGATION_TYPES)[number];

/*
 * Abstract class for persistence
 * 
 * The strategy defines how data is stored and aggregated:
 * - raw: all data is stored as is
 * - change: only changes are stored (no duplicate consecutive values)
 * - aggregate: data is aggregated over time to reduce storage space (only for numerical values)
 * 
 * For this, we keep several data sets:
 *  - raw: all data is stored as is for each date
 *  - change: only changes are stored (duplicate consecutive values are ignored)
 *  - minute: one value per minute (average, we keep the sum and count of values to compute the average)
 *  - hour: one value per hour (average, we keep the sum and count of values to compute the average)
 *  - day: one value per day (average, we keep the sum and count of values to compute the average)
 *  - week: one value per week (average, we keep the sum and count of values to compute the average)
 *  - month: one value per month (average, we keep the sum and count of values to compute the average)
 *  - year: one value per year (average, we keep the sum and count of values to compute the average)
 * 
 *  Each data set has its own retention period (keep):
 *  - raw: default 1 year
 *  - change: default 5 years
 *  - minute: default 5 years
 *  - hour: default 5 years
 *  - day: default 5 years
 *  - week: default 5 years
 *  - month: default 5 years
 *  - year: default 5 years
 * 
 * The keep parameter can be set to define the retention period for raw data (and change data if strategy is aggregate):
 * - for strategy "raw": keep is a single duration (e.g. "1 year", "6 months", "30 days", "12 hours", "60 minutes")
 * - for strategy "aggregate": keep is two durations separated by a comma (e.g. "1 year,5 years", "6 months,2 years", "30 days,1 year", "12 hours,6 months", "60 minutes,3 months")
 */
export abstract class persistence {
    id: string;
    ttl: number;
    strategy: Strategy;
    keep: Duration;
    keepString: string;
    keepAggregation: Duration;
    keepAggregationString: string;
    cleanJob: NodeJS.Timeout;
    cleanJob5: NodeJS.Timeout;

    constructor(id: string, ttl?: number, strategy?: Strategy, keep?: string) {
        this.strategy = strategy || "raw";
        this.id = id;
        this.ttl = ttl > 0 ? ttl : 1 * 60; // 1h by default

        if (keep) {
            if (this.strategy === 'aggregate') {
                const keepTab = keep.split(',');
                this.keepString = keepTab[0];
                this.keep = this.keepString && parseDuration(this.keepString);
                this.keepAggregationString = keepTab[1];
                this.keepAggregation = this.keepAggregationString && parseDuration(this.keepAggregationString);
            } else {
                this.keepString = keep;
                this.keep = parseDuration(this.keepString);
                this.keepAggregationString = undefined;
                this.keepAggregation = undefined;
            }
        }

        if (strategy) {
            if (this.keep === undefined) {
                this.keepString = '1 year';
                this.keep = Duration.fromObject({ year: 1 }); // 1 year by default
            }
            if (this.keepAggregation === undefined) {
                this.keepAggregationString = '5 years';
                this.keepAggregation = Duration.fromObject({ year: 5 }); // 5 years by default
            }
        }

        this.cleanJob = setInterval(() => {
            this.cleanOldData((err) => {
                if (err) logger.warn('Could not clean history of "%s":', this.id, err);
            });
        }, 24 * 60 * 60 * 1000).unref();
        this.cleanJob5 = setTimeout(() => {
            this.cleanOldData((err) => {
                if (err) logger.warn('Could not clean history of "%s":', this.id, err);
            });
        }, 5 * 60 * 1000).unref(); // run once after 5 minutes, don't block event loop
    }
    insert(record: { date: Date, state: any }): Promise<Object>;
    insert(record: { date: Date, state: any }, callback: (err: Error, doc: Object) => void): void;
    insert(record: { date: Date, state: any }, callback?: (err: Error, doc: Object) => void): void | Promise<Object> {
        if (demoMode) {
            if (callback) return callback(null, undefined);
            else return new Promise<Object>((resolve) => resolve(undefined));
        }
        if (/^-?[0-9]+\.?[0-9]*$/.test(record.state) && (parseFloat(record.state) <= -10 || parseFloat(record.state) > 35)) {
            logger.warn("Mauvaise température reçue, ignorée:", record);
            const err = new Error("Mauvaise temperature!");
            if (callback) return callback(err, null);
            else return new Promise<Object>((resolve, reject) => reject(err));
        }
        return this.doInsert(record, callback);
    }
    getHistory(aggregate: AggregationType, from: Date | null, to: Date | null): Promise<any[]>;
    getHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;
    getHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback?: (err: Error, results: any[]) => void): void | Promise<any[]> {
        if (demoMode) {
            if (callback) return callback(null, []);
            else return new Promise<any[]>((resolve) => resolve([]));
        }
        return this.doGetHistory(aggregate, from, to, callback);
    }
    restoreStateFromDB(): Promise<{ id: string, state: string | Date, date: Date }>;
    restoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void;
    restoreStateFromDB(callback?: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void | Promise<{ id: string, state: string | Date, date: Date }> {
        if (demoMode) {
            if (callback) return callback(null, undefined);
            else return new Promise<{ id: string, state: string | Date, date: Date }>((resolve) => resolve(undefined));
        }
        return this.doRestoreStateFromDB(callback);
    }
    backupStateToDB(state: string | Date): Promise<void>;
    backupStateToDB(state: string | Date, callback: (err: Error) => void): void;
    backupStateToDB(state: string | Date, callback?: (err: Error) => void): void | Promise<void> {
        if (demoMode) {
            if (callback) return callback(null);
            else return new Promise<void>((resolve) => resolve());
        }
        return this.doBackupStateToDB(state, new Date(), callback);
    }
    cleanOldData(): Promise<void>;
    cleanOldData(callback: (err: Error) => void): void;
    cleanOldData(callback?: (err: Error) => void): void | Promise<void> {
        if (demoMode) {
            if (callback) return callback(null);
            else return new Promise<void>((resolve) => resolve());
        }
        return this.doCleanOldData(callback);
    }
    abstract doInsert(record: { date: Date, state: any }): Promise<Object>;
    abstract doInsert(record: { date: Date, state: any }, callback: (err: Error, doc: Object) => void): void;
    abstract doInsert(record: { date: Date, state: any }, callback?: (err: Error, doc: Object) => void): void | Promise<Object>;

    abstract doGetHistory(aggregate: AggregationType, from: Date | null, to: Date | null): Promise<any[]>;
    abstract doGetHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;
    abstract doGetHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;

    abstract doRestoreStateFromDB(): Promise<{ id: string, state: string | Date, date: Date }>;
    abstract doRestoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void;

    abstract doBackupStateToDB(state: string | Date, date: Date): Promise<void>;
    abstract doBackupStateToDB(state: string | Date, date: Date, callback: (err: Error) => void): void;

    abstract doCleanOldData(): Promise<void>;
    abstract doCleanOldData(callback: (err: Error) => void): void;

    loadDatasetToDB(aggregate: Exclude<AggregationType, 'change' | 'none'>, records: { date: Date, sum: number, count: number }[]): Promise<void>;
    loadDatasetToDB(aggregate: Extract<AggregationType, 'change' | 'none'>, records: { date: Date, state: string }[]): Promise<void>;
    loadDatasetToDB(aggregate: AggregationType, records: { date: Date, state: string }[] | { date: Date, sum: number, count: number }[]): Promise<void> {
        return this.doLoadDatasetToDB(aggregate, records);
    }
    abstract doLoadDatasetToDB(aggregate: AggregationType, records: { date: Date, state: string }[] | { date: Date, sum: number, count: number }[]): Promise<void>;

    dumpDatasetFromDB(aggregate: Exclude<AggregationType, 'change' | 'none'>): Promise<{ date: Date, sum: number, count: number }[]>;
    dumpDatasetFromDB(aggregate: Extract<AggregationType, 'change' | 'none'>): Promise<{ date: Date, state: string }[]>;
    dumpDatasetFromDB(aggregate: AggregationType): Promise<{ date: Date, state: string }[] | { date: Date, sum: number, count: number }[]> {
        return this.doDumpDatasetFromDB(aggregate);
    }
    abstract doDumpDatasetFromDB(aggregate: AggregationType): Promise<{ date: Date, state: string }[] | { date: Date, sum: number, count: number }[]>;


    static async deviceIdsFromDB(): Promise<string[]> {
        throw new Error('Method not implemented! Use derived class, which should use "override" keyword'); // cannot use static & abstract
    }


    static async dumpToFile(filename: string) {
        //throw new Error('Method not implemented! Use derived class, which should use "override" keyword'); // cannot use static & abstract
        const file = openSync(filename, 'w');
        writeSync(file, "{\n");

        // get all device ids
        const devices = await this.deviceIdsFromDB();

        // dump backup states
        writeSync(file, `  "Backup states": [\n`);
        let i = 0;
        //console.log("Dumping Backup states for devices:", devices);
        for (const deviceId of devices) {
            //console.log(" Dumping Backup state for device:", deviceId);
            i++;
            // create an instance of the persistence subclass
            const p: persistence = Reflect.construct(this.prototype.constructor, [deviceId]);

            console.log(p);

            const result = await p.restoreStateFromDB();
            if (!result) continue;
            //console.log(result)
            writeSync(file, "    {\n" + JSON.stringify({
                id: result.id,
                state: result.state,
                date: result.date
                // do not dump _id field
            }, null, 6).slice(2, -2) + "\n    }");
            if (i < devices.length) writeSync(file, ",\n");

        }
        writeSync(file, "\n  ]");
        if (devices.length > 0) writeSync(file, ",");
        //writeSync(file, "\n");


        // dump all devices
        let wroteDeviceId = false; // do not write empty "deviceid" {} if no data
        let wroteDeviceBlock = false; // to manage commas between device blocks
        //console.log("Dumping datasets for devices:", devices);
        for (const deviceId of devices) {

            // create an instance of the persistence subclass
            const p: persistence = Reflect.construct(this.prototype.constructor, [deviceId]);

            let i = 0;
            for (const aggregate of ALL_AGGREGATION_TYPES) {
                i++;

                const records = aggregate === "change" || aggregate === "none" ? await p.dumpDatasetFromDB(aggregate) : await p.dumpDatasetFromDB(aggregate);

                if (records.length === 0) continue;

                if (!wroteDeviceId) {
                    writeSync(file, wroteDeviceBlock ? ",\n" : "\n");
                    writeSync(file, `  "${deviceId}": {\n`); // do not write empty "deviceid" {} if no data
                    wroteDeviceBlock = true;
                }
                wroteDeviceId = true;

                writeSync(file, `    "${aggregate}": [\n`);

                for (let j = 0; j < records.length; j++) {
                    const s = JSON.stringify(records[j], null, 10).slice(2, -2);
                    writeSync(file, "      {\n" + s + "\n      }");
                    if (j < records.length - 1) writeSync(file, ",");
                    writeSync(file, "\n");
                }

                writeSync(file, "    ]");
                writeSync(file, i < ALL_AGGREGATION_TYPES.length ? ",\n" : "\n");
            }
            if (wroteDeviceId) { // do not write empty "deviceid" {} if no data
                writeSync(file, "  }");
                //writeSync(file, devices.indexOf(deviceId) < devices.length - 1 ? ",\n" : "\n");
                wroteDeviceId = false;
            }
        }

        writeSync(file, "\n}\n");
        close(file);

    }

    static async loadFromFile(filename: string) {
        return new Promise<void>(async (resolve, reject) => {

            /* file content in the form:
            {
                "Backup states": [
                    {
                        "id": "test_device1",
                        "state": "OFF",
                        "date": "2025-09-12T17:54:14.146Z"
                    },
                    {
                        "id": "test_device2",
                        "state": "15",
                        "date": "2025-09-12T17:54:14.569Z"
                    }
                ],
                "test_device1": {
                    "change": [
                        {
                            "date": "2025-10-10T08:30:50.119Z",
                            "state": "ON"
                        },
                        {
                            "date": "2025-10-10T09:30:50.119Z",
                            "state": "OFF"
                        }
                    ]
                }
            }
            */

            try {
                const reader = rd.createInterface(createReadStream(filename));

                const rl = readline.createInterface(createReadStream(filename));

                let JSONstring = "";

                for await (const line of rl) {

                    if (line === "{") {
                        // ignore first line
                        continue;
                    }
                    if (line === "  ]," || line === "  ]") {
                        // end of Backup states json block

                        JSONstring += "]\n";

                        const object = JSON.parse("{" + JSONstring + "}");

                        const key = Object.keys(object)[0]; // should be only one key
                        if (key === "Backup states") {
                            const states: any[] = object["Backup states"];
                            for (const s of states) {
                                const deviceId = s.id;
                                // create an instance of the persistence subclass 
                                const p: persistence = Reflect.construct(this.prototype.constructor, [deviceId]);

                                const state = s.state;
                                const date = new Date(s.date);
                                await p.doBackupStateToDB(state, date);
                                await p.release();
                            }
                        } else {
                            logger.error("Error parsing dump file, expected 'Backup states' key, got:", key);
                        }

                        JSONstring = "";
                        continue;
                    } else if (line === "  }," || line === "  }") {
                        // end of device json block

                        JSONstring += "}\n";

                        const object = JSON.parse("{" + JSONstring + "}");
                        const key = Object.keys(object)[0]; // should be only one key

                        const deviceId = key;

                        // create an instance of the persistence subclass 
                        const p: persistence = Reflect.construct(this.prototype.constructor, [deviceId]);

                        // get all aggregates for this deviceId
                        for (const aggregate of Object.keys(object[deviceId]) as AggregationType[]) {

                            // insert states for this deviceId
                            const states: {
                                date: string,
                                state: string
                            }[] | {
                                date: string,
                                sum: number,
                                count: number
                            }[] = object[deviceId][aggregate];

                            //console.log(`Loading states for device "${deviceId}", dataset "${aggregate}" (${states.length} state(s))...`);

                            // cast date strings to Date objects
                            const states2: {
                                date: Date,
                                state: string
                            }[] | {
                                date: Date,
                                sum: number,
                                count: number
                            }[] = states as any;
                            states2.forEach(s => { s.date = new Date(s.date) });

                            await p.doLoadDatasetToDB(aggregate, states2);
                        }

                        await p.release();
                        JSONstring = "";
                        continue;
                    }
                    JSONstring += line + "\n";

                }
                rl.close();
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }


    async release() {
        clearInterval(this.cleanJob);
        this.cleanJob = null;
        clearTimeout(this.cleanJob5);
        this.cleanJob5 = null;
    }
}

