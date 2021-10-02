import * as assert from 'assert';
import { MongoClient } from 'mongodb';
import { message } from '../sources/source';
import * as async from 'async';

const logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

// hack to neutralize persistence when app is in demo mode
let demoMode: boolean = false;

export function setDemoMode(mode: boolean) {
    demoMode = mode;
}

type Strategy = "raw" | "aggregate";

const ALL_AGGREGATION_TYPES = ["year", "month", "week", "day", "hour", "minute", "none"] as const;
type AggregationType = (typeof ALL_AGGREGATION_TYPES)[number];

export abstract class persistence {
    id: string;
    ttl: number;
    strategy: Strategy;
    keep: number;
    cleanJob: NodeJS.Timeout;

    constructor(id: string, ttl?: number, strategy?: Strategy, keep?: number) {
        this.strategy = strategy || "raw";
        this.id = id;
        this.ttl = ttl > 0 ? ttl : 1 * 60; // 1h by default
        this.keep = keep || 5 * 365 * 24 * 60; // 5 years by default

        this.cleanJob = setInterval(() => {
            this.cleanOldData((err) => {
                if (err) logger.warn('Could not clean history of "%s":', this.id, err);
            });
        }, 24 * 60 * 60 * 1000);

    }
    insert(record: { date: Date, state: any }, callback: (err: Error, doc: Object) => void): void {
        if (demoMode) return callback(null, undefined);
        this.doInsert(record, callback);
    }
    getHistory(aggregate: AggregationType, from: Date, to: Date, callback: (err: Error, results: any[]) => void): void {
        if (demoMode) return callback(null, []);
        this.doGetHistory(aggregate, from, to, callback);
    }
    restoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void {
        if (demoMode) return callback(null, undefined);
        this.doRestoreStateFromDB(callback);
    }
    backupStateToDB(state: string | Date, callback: (err: Error) => void): void {
        if (demoMode) return callback(null);
        this.doBackupStateToDB(state, callback);
    }
    cleanOldData(callback: (err: Error) => void): void {
        if (demoMode) return callback(null);
        this.doCleanOldData(callback);
    }
    abstract doInsert(record: { date: Date, state: any }, callback: (err: Error, doc: Object) => void): void;
    abstract doGetHistory(aggregate: AggregationType, from: Date, to: Date, callback: (err: Error, results: any[]) => void): void;
    abstract doRestoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void;
    abstract doBackupStateToDB(state: string | Date, callback: (err: Error) => void): void;
    abstract doCleanOldData(callback: (err: Error) => void): void;
    release() {
        clearInterval(this.cleanJob);
        this.cleanJob = null;
    }
}

export class mongoDB extends persistence {
    static mongoClient: MongoClient;
    static connecting: boolean = false;

    constructor(id: string, ttl?: number, strategy?: Strategy, keep?: number) {
        super(id, ttl, strategy, keep);
    }

    private getMongoClient(callback: (err: Error, client: MongoClient) => void): void {
        if (mongoDB.mongoClient && mongoDB.mongoClient.isConnected()) {
            callback(null, mongoDB.mongoClient);
        } else {
            if (mongoDB.connecting) {
                setTimeout(() => this.getMongoClient(callback), 1000);
                return;
            } else {
                mongoDB.connecting = true;
            }
            mongoDB.mongoClient && mongoDB.mongoClient.close();
            MongoClient.connect('mongodb://127.0.0.1:27017/domoja', { poolSize: 10 }, (err, client) => {
                if (err) {
                    logger.error("Cannot (re)connect to Mongo:", err);
                    callback(err, null);
                    return;
                }
                if (mongoDB.mongoClient) {
                    logger.warn('Connection to mongodb was lost! Successfully reconnected...')
                } else {
                    logger.info('Successfully connected to mongodb!')
                }
                mongoDB.mongoClient = client;
                mongoDB.connecting = false;
                if (!mongoDB.mongoClient.isConnected()) logger.error('Strange, just (re)connected mongo client is not connected!!!');

                false && this.devRebuildData("day", "minute", err => {
                    if (err) logger.error(`Could not rebuild week data for persistence "${this.id}":`, err);
                    else logger.info(`Successfully rebuilt week data for persistence "${this.id}".`);
                });

                callback(null, client);
            });
        }
    }

    doInsert(record: { date: Date, state: any }, callback: (err: Error, doc: Object) => void): void {
        this.getMongoClient((err, client) => {
            logger.trace("inserting in Mongo...")
            var db = client.db();
            var collection = this.id;
            async.every(!isNaN(parseFloat(record.state)) ? ALL_AGGREGATION_TYPES.values() : ["none"],
                (aggregate: AggregationType, callback) => {
                    if (aggregate == "none") {
                        var collectionStore = db.collection(collection);
                        collectionStore.insertOne(record, (err, result) => {
                            if (err != null) {
                                logger.error("Error while storing in Mongo:", err)
                                logger.error(err.stack)
                            }
                            callback(err);
                        });
                    } else {
                        let d = new Date(record.date);
                        switch (aggregate) {
                            case "year":
                                d.setMonth(0);
                            case "month":
                                d.setDate(1);
                            case "day":
                                d.setHours(0);
                            case "hour":
                                d.setMinutes(0);
                            case "minute":
                                d.setSeconds(0);
                                d.setMilliseconds(0);
                                break;
                            case "week":
                                let day = d.getDay(); // Sunday - Saturday : 0 - 6
                                if (day == 0) day = 7;
                                d.setDate(d.getDate() - day + 1); //Monday of the week
                                d.setHours(0);
                                d.setMinutes(0);
                                d.setSeconds(0);
                                d.setMilliseconds(0);
                                break;
                            default:
                                let n: never = aggregate;
                        }
                        var collectionStore = db.collection(collection + " by " + aggregate);
                        collectionStore.updateOne(
                            {
                                date: d
                            },
                            {
                                $inc: { sum: parseFloat(record.state), count: 1 }
                            },
                            {
                                upsert: true
                            },
                            (err, result) => {
                                if (err != null) {
                                    logger.error("Error while storing in Mongo:", err)
                                }
                                callback(err);
                            });
                    }
                },
                (err) => {
                    callback(err, record);
                });
        });
    }

    doRestoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void {
        this.getMongoClient((err, client) => {
            if (err) return callback(err, null);
            var db = client.db();
            var collection = db.collection('Backup states');
            let result = collection.findOne(
                { 'id': this.id },
                (err, result) => {
                    callback(err, result);
                }
            );
        });
    };

    doBackupStateToDB(state: string | Date, callback: (err: Error) => void): void {
        this.getMongoClient((err, client) => {
            if (err) return callback(err);
            var db = client.db();
            var collection = db.collection('Backup states');

            collection.findOneAndReplace(
                {
                    'id': this.id
                },
                {
                    'id': this.id,
                    state: state,
                    date: new Date()
                },
                { upsert: true }
            ).catch(e => {
                logger.error(e);
                callback(e);
            }).then(() => {
                callback(null)
            });
        });
    };

    doGetHistory(aggregate: AggregationType, from: Date, to: Date, callback: (err: Error, results: any[]) => void) {
        this.getMongoClient((err, client) => {
            var db = client.db();
            var collection = this.id;
            if (aggregate != "none") {
                collection += " by " + aggregate;
            }
            let collectionStore = db.collection(collection);
            collectionStore.find(
                {
                    'date': { $gte: from, $lt: to },
                },
                {
                    'projection': { '_id': 0, 'date': 1, 'count': 1, 'sum': 1, 'state': 1 }
                }
            ).toArray((err, results) => {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, aggregate != "none"
                        ? results.map(r => { return { date: r.date, value: (r.sum as number) / (r.count as number) } })
                        : results.map(r => { return { date: r.date, value: r.state } })
                    );
                }
            });
        });
    }

    doCleanOldData(callback: (err: Error) => void) {
        this.getMongoClient((err, client) => {
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err);
                return;
            }
            var db = client.db();
            var collection = this.id;
            let collectionStore = db.collection(collection);
            collectionStore.deleteMany(
                {
                    'date': { $lt: new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000) }, // 1 month old
                },
                (err, result) => {
                    if (err) logger.error('Could not remove old data!');
                    else logger.info('Removed %d old data in collection "%s".', result.deletedCount, collection);
                    callback(err);
                }
            );
        });
    }

    devRebuildData(target: AggregationType, from: AggregationType, callback: (err: Error) => void) {
        this.getMongoClient((err, client) => {
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err);
                return;
            }
            var db = client.db();
            var collection = this.id;
            let fromCollectionStore = db.collection(collection + " by " + from);
            let targetCollectionStore = db.collection(collection + " by " + target);
            fromCollectionStore.find(
                {
                },
                {
                    'projection': { '_id': 0, 'date': 1, 'count': 1, 'sum': 1 }
                }
            ).toArray((err, results) => {
                if (err) logger.error(err);
                else {
                    targetCollectionStore.deleteMany(
                        {
                        },
                        (err, result) => {
                            if (err) {
                                logger.error('Could not remove data!');
                                callback(err);
                            } else {
                                logger.info('Removed %d old data in collection "%s".', result.deletedCount, targetCollectionStore.collectionName);

                                results.map(r => {
                                    if (target == "none") return;
                                    let d = r.date as Date;
                                    switch (target) {
                                        case "year":
                                            d.setMonth(0);
                                        case "month":
                                            d.setDate(1);
                                        case "day":
                                            d.setHours(0);
                                        case "hour":
                                            d.setMinutes(0);
                                        case "minute":
                                            d.setSeconds(0);
                                            d.setMilliseconds(0);
                                            break;
                                        case "week":
                                            let day = d.getDay(); // Sunday - Saturday : 0 - 6
                                            if (day == 0) day = 7;
                                            d.setDate(d.getDate() - day + 1); //Monday of the week
                                            d.setHours(0);
                                            d.setMinutes(0);
                                            d.setSeconds(0);
                                            d.setMilliseconds(0);
                                            break;
                                        default:
                                            let n: never = target;
                                    }
                                    targetCollectionStore.updateOne(
                                        {
                                            date: d
                                        },
                                        {
                                            $inc: { sum: r.sum, count: r.count }
                                        },
                                        {
                                            upsert: true
                                        },
                                        (err, result) => {
                                            if (err != null) {
                                                logger.error("Error while storing in Mongo:", err)
                                            }
                                            logger.warn('Inserted %d new data into collection "%s".', results.length, targetCollectionStore.collectionName);
                                            callback(err);
                                        });
                                });
                            }
                        }
                    );
                }
            });
        });
    }

    getHistory2(aggregate: AggregationType, from: Date, to: Date, callback: (err: Error, results: any[]) => void) {
        if (demoMode) return callback(null, []);
        this.getMongoClient((err, client) => {
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
                    logger.log(from, to)
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
                            if (err) {
                                callback(err, null);
                            } else {
                                logger.log(results && results[0]);
                                logger.log(results && results[0] && new Date(results[0]._id).toLocaleDateString());
                                callback(err, results.map((r: { _id: string, value: any }) => { return { "date": r._id, "value": r.value } }));
                            }
                        });
                    break;

            }
        });
    }

    release() {
        super.release();
        mongoDB.mongoClient && mongoDB.mongoClient.close();
    }
}