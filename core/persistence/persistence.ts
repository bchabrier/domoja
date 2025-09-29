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

export const ALL_DATA_SETS = ["year", "month", "week", "day", "hour", "minute", "change", "raw"] as const;
export type DataSet = (typeof ALL_DATA_SETS)[number];

/*
 * Abstract class for persistence
 * 
 * We keep several data sets:
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
 * The keep parameter can be set to define the retention period for the different data sets, as a JSON string:
 * '{"raw": "1 month", "change": "1 year"}'
 */
export abstract class persistence {
    id: string;
    keep: {
        [key in DataSet]: Duration
    } = {
            year: undefined,
            month: undefined,
            week: undefined,
            day: undefined,
            hour: undefined,
            minute: undefined,
            change: undefined,
            raw: undefined
        };
    keepString: {
        [key in DataSet]: string
    } = {
            year: undefined,
            month: undefined,
            week: undefined,
            day: undefined,
            hour: undefined,
            minute: undefined,
            change: undefined,
            raw: undefined
        };
    cleanJob: NodeJS.Timeout;
    cleanJob5: NodeJS.Timeout;

    constructor(id: string, keepString?: string) {
        this.id = id;

        if (this.keep) {
            let json: { [key in DataSet]: string } = null;
            try {
                json = JSON.parse(keepString);
                logger.debug("keep string converted to:", json);
            } catch (err) {
                logger.warn(`Error in ${id}' persistence definition "${keepString}": parse error while parsing json string`, keepString, ":", err);
            }

            if (!json || typeof json !== 'object') {
                return
            }

            for (const k of Object.keys(json)) {
                const key = k as DataSet;
                if (ALL_DATA_SETS.includes(key as DataSet)) {
                    const keepAggregationString = json[key];
                    const keepAggregation = parseDuration(keepAggregationString);
                    this.keep[key] = keepAggregation;
                    this.keepString[key] = keepAggregationString;
                } else {
                    logger.warn(`Error in ${id}' persistence definition "${keepString}": Unknown key "${key}" in keep json string, ignoring. Supported keys are:`, ALL_DATA_SETS);
                }
            }

            // ensure at least one key is present
            if (ALL_DATA_SETS.every(k => this.keep[k] === undefined)) {
                logger.warn(`Error in ${id}' persistence definition "${keepString}": at least one of ${ALL_DATA_SETS} should be defined!`);
            }

            logger.debug("Final keep and keepAggregation:", this.keepString);


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
    }
    insert(record: { date: Date, state: any }): Promise<Object>;
    insert(record: { date: Date, state: any }, callback: (err: Error, doc: Object) => void): void;
    insert(record: { date: Date, state: any }, callback?: (err: Error, doc: Object) => void): void | Promise<Object> {
        if (demoMode) {
            if (callback) return callback(null, undefined);
            else return new Promise<Object>((resolve) => resolve(undefined));
        }
        if (/^ -? [0 - 9] +\.?[0 - 9] * $ /.test(record.state) && (parseFloat(record.state) <= -10 || parseFloat(record.state) > 35)) {
            logger.warn("Mauvaise température reçue, ignorée:", record);
            const err = new Error("Mauvaise temperature!");
            if (callback) return callback(err, null);
            else return new Promise<Object>((resolve, reject) => reject(err));
        }
        return this.doInsert(record, callback);
    }
    getHistory(dataSet: DataSet, from: Date | null, to: Date | null): Promise<any[]>;
    getHistory(dataSet: DataSet, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;
    getHistory(dataSet: DataSet, from: Date | null, to: Date | null, callback?: (err: Error, results: any[]) => void): void | Promise<any[]> {
        if (demoMode) {
            if (callback) return callback(null, []);
            else return new Promise<any[]>((resolve) => resolve([]));
        }
        return this.doGetHistory(dataSet, from, to, callback);
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

    abstract doGetHistory(dataSet: DataSet, from: Date | null, to: Date | null): Promise<any[]>;
    abstract doGetHistory(dataSet: DataSet, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;
    abstract doGetHistory(dataSet: DataSet, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;

    abstract doRestoreStateFromDB(): Promise<{ id: string, state: string | Date, date: Date }>;
    abstract doRestoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void;

    abstract doBackupStateToDB(state: string | Date, date: Date): Promise<void>;
    abstract doBackupStateToDB(state: string | Date, date: Date, callback: (err: Error) => void): void;

    abstract doCleanOldData(): Promise<void>;
    abstract doCleanOldData(callback: (err: Error) => void): void;

    loadDatasetToDB(dataSet: Exclude<DataSet, 'change' | 'raw'>, records: { date: Date, sum: number, count: number }[]): Promise<void>;
    loadDatasetToDB(dataSet: Extract<DataSet, 'change' | 'raw'>, records: { date: Date, state: string }[]): Promise<void>;
    loadDatasetToDB(dataSet: DataSet, records: { date: Date, state: string }[] | { date: Date, sum: number, count: number }[]): Promise<void> {
        return this.doLoadDatasetToDB(dataSet, records);
    }
    abstract doLoadDatasetToDB(dataSet: DataSet, records: { date: Date, state: string }[] | { date: Date, sum: number, count: number }[]): Promise<void>;

    dumpDatasetFromDB(dataSet: Exclude<DataSet, 'change' | 'raw'>): Promise<{ date: Date, sum: number, count: number }[]>;
    dumpDatasetFromDB(dataSet: Extract<DataSet, 'change' | 'raw'>): Promise<{ date: Date, state: string }[]>;
    dumpDatasetFromDB(dataSet: DataSet): Promise<{ date: Date, state: string }[] | { date: Date, sum: number, count: number }[]> {
        return this.doDumpDatasetFromDB(dataSet);
    }
    abstract doDumpDatasetFromDB(dataSet: DataSet): Promise<{ date: Date, state: string }[] | { date: Date, sum: number, count: number }[]>;


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
            const p: persistence = Reflect.construct(this.prototype.constructor, [deviceId, '{"raw": "1 year"}']);

            //console.log(p);

            const result = await p.restoreStateFromDB();
            await p.release();

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
            const p: persistence = Reflect.construct(this.prototype.constructor, [deviceId, '{"raw": "1 year"}']);

            let i = 0;
            let wroteDataSetBlock = false; // to manage commas between data set blocks
            for (const dataSet of ALL_DATA_SETS) {
                i++;

                const records = dataSet === "change" || dataSet === "raw" ? await p.dumpDatasetFromDB(dataSet) : await p.dumpDatasetFromDB(dataSet);

                if (records.length === 0) continue;

                if (!wroteDeviceId) {
                    writeSync(file, wroteDeviceBlock ? ",\n" : "\n");
                    writeSync(file, `  "${deviceId}": {\n`); // do not write empty "deviceid" {} if no data
                    wroteDeviceBlock = true;
                }
                wroteDeviceId = true;

                writeSync(file, wroteDataSetBlock ? ",\n" : "\n");
                wroteDataSetBlock = true;

                writeSync(file, `    "${dataSet}": [\n`);

                for (let j = 0; j < records.length; j++) {
                    const s = JSON.stringify(records[j], null, 10).slice(2, -2);
                    writeSync(file, "      {\n" + s + "\n      }");
                    if (j < records.length - 1) writeSync(file, ",");
                    writeSync(file, "\n");
                }

                writeSync(file, "    ]");
            }
            await p.release();

            if (wroteDataSetBlock) {
                writeSync(file, "\n");
                wroteDataSetBlock = false;
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
                        logger.debug(`Finished reading Backup states block...`);

                        JSONstring += "]\n";

                        const object = JSON.parse("{" + JSONstring + "}");

                        const key = Object.keys(object)[0]; // should be only one key
                        if (key === "Backup states") {
                            logger.debug(`Loading Backup states block...`);
                            const states: any[] = object["Backup states"];
                            for (const s of states) {
                                const deviceId = s.id;
                                // create an instance of the persistence subclass 
                                const p: persistence = Reflect.construct(this.prototype.constructor, [deviceId, '{"raw": "1 year"}']);

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
                        logger.debug(`Finished reading a device block...`);

                        JSONstring += "}\n";

                        const object = JSON.parse("{" + JSONstring + "}");
                        const key = Object.keys(object)[0]; // should be only one key

                        const deviceId = key;

                        logger.debug(`Loading device block for '${deviceId}' with data sets:`, Object.keys(object[deviceId]));

                        // create an instance of the persistence subclass 
                        const p: persistence = Reflect.construct(this.prototype.constructor, [deviceId, '{"raw": "1 year"}']);

                        // get all data sets for this deviceId
                        for (const dataSet of Object.keys(object[deviceId]) as DataSet[]) {

                            // insert states for this deviceId
                            const states: {
                                date: string,
                                state: string
                            }[] | {
                                date: string,
                                sum: number,
                                count: number
                            }[] = object[deviceId][dataSet];

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

                            await p.doLoadDatasetToDB(dataSet, states2);
                        }
                        logger.debug(`Releasing persistence for '${deviceId}'`);
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

