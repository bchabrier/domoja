import * as assert from 'assert';
import { MongoClient } from 'mongodb';
import { message } from '../sources/source';
import { stringify } from 'querystring';

const logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

// hack to neutralize persistence when app is in demo mode
let demoMode: boolean = false;

export function setDemoMode(mode: boolean) {
    demoMode = mode;
    console.log('demoMode set to', demoMode);
}

type Strategy = "raw" | "aggregate";

declare function emit(k: any, v: any): void;

export class persistence {
    id: string;
    ttl: number;
    strategy: Strategy;
    keep: number;

    constructor(id: string, ttl?: number, strategy?: Strategy, keep?: number) {

        this.strategy = strategy || "raw";
        this.id = id;
        this.ttl = ttl > 0 ? ttl : 1 * 60; // 1h by default
        this.keep = keep || 5 * 365 * 24 * 60; // 5 years by default
    }

    insert(record: Object, callback: (err: Error, doc: Object) => void): void {
        if (demoMode) return callback(null, undefined);
        MongoClient.connect('mongodb://127.0.0.1:27017/domoja', (err, client) => {
            if (err) { logger.error("error:", err, err.stack); return }
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err, null);
                return;
            }
            logger.trace("inserting in Mongo...")
            var db = client.db();
            var collection = this.id;
            var collectionStore = db.collection(collection);
            collectionStore.insertOne(record, (err, doc) => {
                if (err != null) {
                    logger.error("Error while storing in Mongo:", err)
                    logger.error(err.stack)
                }
                // Let's close the db
                client.close();
                callback(null, record);
            });
        });
    }

    restoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void {
        if (demoMode) return callback(null, undefined);
        MongoClient.connect('mongodb://127.0.0.1:27017/domoja', (err, client) => {
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err, undefined);
                return;
            }
            var db = client.db();
            var collection = db.collection('Backup states');
            let result = collection.findOne(
                { 'id': this.id },
                (err, result) => {
                    // Let's close the db
                    client.close();
                    callback(err, result);
                }
            );
        });
    };

    backupStateToDB(state: string | Date, callback: (err: Error) => void): void {
        if (demoMode) return callback(null);
        MongoClient.connect('mongodb://127.0.0.1:27017/domoja', (err, client) => {
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err);
                return;
            }
            var db = client.db();
            var collection = db.collection('Backup states');

            let error: Error;
            try {
                let result = collection.findOneAndReplace(
                    {
                        'id': this.id
                    },
                    {
                        'id': this.id,
                        state: state,
                        date: new Date()
                    },
                    { upsert: true }
                );
            } catch (e) {
                error = e;
            }
            // Let's close the db
            client.close();
            callback(error);
        });
    };


    getHistory(aggregate: "none" | "minute" | "hour" | "day" | "week" | "month" | "year", from: Date, to: Date, callback: (err: Error, results: any[]) => void) {
        if (demoMode) return callback(null, []);
        MongoClient.connect('mongodb://127.0.0.1:27017/domoja', (err, client) => {
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err, undefined);
                return;
            }
            var db = client.db();
            var collection = db.collection(this.id);
            let filter = "";
            switch (aggregate) {
                case "none":
                    collection.find(
                        {
                            'date': { $gte: from, $lte: to },
                            'state': { $ne: null }, // avoid if no state defined
                        },
                        {
                            'projection': { '_id': 0, 'date': 1, 'state': 1 }
                        }
                    ).toArray((err, results) => {
                        // Let's close the db
                        client.close();
                        callback(err, results);
                    });
                    break;
                case "year":
                    filter += "d.setMonth(0);"
                case "month":
                    filter += "d.setDate(1);"
                case "day":
                    filter += "d.setHours(0);"
                case "hour":
                    filter += "d.setMinutes(0);"
                case "minute":
                    filter += "d.setMilliseconds(0);"
                    console.log(from, to)
                    collection.mapReduce(
                        "function () {\
                            var d = this.date;\
                            d.setSeconds(0);\
                            d.setMilliseconds(0);"
                            + filter + 
                            "this.state && emit(d, parseFloat(this.state)); /* avoid if no state defined */ \
                        }",
                        "function (key, values) {\
                            return Array.sum(values) / values.length;\
                        }",
                        {
                            query: {
                                'date': { $gte: from, $lte: to }
                            },
                            out: { inline: 1 },
                        },
                        (err, results) => {
                            // Let's close the db
                            client.close();
                            console.log(results && results[0]);
                            console.log(results && results[0] && new Date(results[0]._id).toLocaleDateString());
                            callback(err, results.map((r: {_id: string, value: any}) => {return {"date": r._id, "value": r.value}}));
                        });
                    break;

            }
        });
    }

}