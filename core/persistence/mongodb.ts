import * as assert from 'assert';
import { Collection, MongoClient } from 'mongodb';
import { message } from '../sources/source';
import { Duration, parseDuration } from './durationParser';
import * as async from 'async';

import { colorConsole } from 'tracer';
import { persistence, AggregationType, ALL_AGGREGATION_TYPES, Strategy } from './persistence';

const logger = colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class mongoDB extends persistence {
    static mongoUri: string = 'mongodb://127.0.0.1:27017/domoja';
    static mongoClient: MongoClient;
    static connecting: boolean = false;
    static statsJob: NodeJS.Timeout;
    static nbInstances = 0;
    static indexChecks: { [indexName: string]: boolean; } = {};

    constructor(id: string, ttl?: number, strategy?: Strategy, keep?: string) {
        super(id, ttl, strategy, keep);

        if (mongoDB.nbInstances === 0) mongoDB.statsJob = setInterval(() => {
            mongoDB.getMongoClient((err, client) => {
                logger.trace("Getting stats from Mongo...");
                var db = client.db();
                db.stats((err, results) => {
                    if (err) logger.error(`Could not retrieve stats from mongoDB!`, err);
                    logger.info("MongoDB stats:", results);
                });
            });
        }, 24 * 60 * 60 * 1000).unref();

        mongoDB.nbInstances++;
    }

    private static getMongoClient(callback: (err: Error, client: MongoClient) => void): void {
        if (mongoDB.mongoClient && mongoDB.mongoClient.isConnected()) {
            callback(null, mongoDB.mongoClient);
        } else {
            if (mongoDB.connecting) {
                setTimeout(() => mongoDB.getMongoClient(callback), 1000).unref();
                return;
            } else {
                mongoDB.connecting = true;
            }
            mongoDB.mongoClient && mongoDB.mongoClient.close();
            MongoClient.connect(mongoDB.mongoUri, { poolSize: 10 }, (err, client) => {
                if (err) {
                    logger.error("Cannot (re)connect to Mongo:", err);
                    callback(err, null);
                    return;
                }
                if (mongoDB.mongoClient) {
                    logger.warn('Connection to mongodb was lost! Successfully reconnected...');
                } else {
                    logger.info('Successfully connected to mongodb!');
                }
                mongoDB.mongoClient = client;
                mongoDB.connecting = false;
                if (!mongoDB.mongoClient.isConnected()) logger.error('Strange, just (re)connected mongo client is not connected!!!');

                /*
                false && this.devRebuildData("day", "minute", err => {
                    if (err) logger.error(`Could not rebuild week data for persistence "${this.id}":`, err);
                    else logger.info(`Successfully rebuilt week data for persistence "${this.id}".`);
                });
*/
                callback(null, client);
            });
        }
    }

    doInsert(record: { date: Date; state: any; }): Promise<Object>;
    doInsert(record: { date: Date; state: any; }, callback: (err: Error, doc: Object) => void): void;
    doInsert(record: { date: Date; state: any; }, callback?: (err: Error, doc: Object) => void): void | Promise<Object> {

        if (callback) {
            mongoDB.getMongoClient((err, client) => {
                logger.trace("inserting in Mongo...");
                if (err) return callback(err, null);

                var db = client.db();
                var collection = this.id;
                async.every(!isNaN(parseFloat(record.state)) ? ALL_AGGREGATION_TYPES.values() : ["none"],
                    (aggregate: Exclude<AggregationType, 'change'>, cb) => {
                        if (aggregate == "none") {
                            var collectionStore = db.collection(collection);
                            const indexName = "Index for " + collection;

                            this.checkIndex(indexName, collectionStore);
                            collectionStore.insertOne(record, (err, result) => {
                                if (err !== null) {
                                    logger.error("Error while storing in Mongo:", err);
                                    logger.error(err.stack);
                                }
                                cb(err, err === null);
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
                            const indexName = "Index for " + collection + " by " + aggregate;

                            this.checkIndex(indexName, collectionStore);

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
                                    if (err !== null) {
                                        logger.error("Error while storing in Mongo:", err);
                                    }
                                    cb(err, err === null);
                                });
                        }
                    },
                    (err) => {
                        callback(err, record);
                    });
            });
        } else {
            return new Promise<Object>((resolve, reject) => {
                this.doInsert(record, (err, doc) => {
                    if (err) reject(err);
                    else resolve(doc);
                });
            });
        }
    }

    doRestoreStateFromDB(): Promise<{ id: string; state: string | Date; date: Date; }>;
    doRestoreStateFromDB(callback: (err: Error, result: { id: string; state: string | Date; date: Date; }) => void): void;
    doRestoreStateFromDB(callback?: (err: Error, result: { id: string; state: string | Date; date: Date; }) => void): void | Promise<{ id: string; state: string | Date; date: Date; }> {
        if (callback) {
            mongoDB.getMongoClient((err, client) => {
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
        } else {
            return new Promise<{ id: string; state: string | Date; date: Date; }>((resolve, reject) => {
                this.doRestoreStateFromDB((err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        }
    };

    doBackupStateToDB(state: string | Date): Promise<void>;
    doBackupStateToDB(state: string | Date, callback: (err: Error) => void): void;
    doBackupStateToDB(state: string | Date, callback?: (err: Error) => void): void | Promise<void> {
        if (callback) {
            mongoDB.getMongoClient(async (err, client) => {
                if (err) return callback(err);
                var db = client.db();
                var collection = db.collection('Backup states');
                const indexName = "Index for Backup states";

                this.checkIndex(indexName, collection);

                const newObject = {
                    'id': this.id,
                    state: state,
                    date: new Date()
                };

                collection.findOneAndReplace(
                    {
                        'id': this.id
                    },
                    newObject,
                    { upsert: true }
                ).catch(async (e) => {
                    logger.error(e);
                    await collection.findOne({
                        'id': this.id
                    }).then((result) => {
                        logger.error("new object:", newObject, "old object:", result);
                        callback(e);
                    }).catch(e => {
                        logger.error("new object:", newObject, "could not find old object", e);
                        callback(e);
                    });
                }).then(() => {
                    callback(null);
                });
            });
        } else {
            return new Promise<void>((resolve, reject) => {
                this.doBackupStateToDB(state, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    };

    doGetHistory(aggregate: AggregationType, from: Date, to: Date): Promise<any[]>;
    doGetHistory(aggregate: AggregationType, from: Date, to: Date, callback: (err: Error, results: any[]) => void): void;
    doGetHistory(aggregate: AggregationType, from: Date, to: Date, callback?: (err: Error, results: any[]) => void): void | Promise<any[]> {
        if (callback) {
            mongoDB.getMongoClient((err, client) => {
                var db = client.db();
                var collection = this.id;
                if (aggregate != "none" && aggregate != "change") {
                    collection += " by " + aggregate;
                }
                let collectionStore = db.collection(collection);
                collectionStore.find(
                    {
                        'date': { $gte: from, $lt: to },
                    },
                    {
                        'sort': { date: 1 },
                        'projection': { '_id': 0, 'date': 1, 'count': 1, 'sum': 1, 'state': 1 }
                    }
                ).toArray((err, results) => {
                    if (err) {
                        callback(err, null);
                    } else {
                        const ret = aggregate === "none"
                            ? results.map(r => { return { date: r.date, value: r.state }; })
                            : aggregate === "change"
                                ? results.map(r => { return { date: r.date, value: r.state }; }).filter(
                                    (elt, i, tab) => i === 0 || i === tab.length - 1 ||
                                        tab[i].value !== tab[i - 1].value || tab[i].value != tab[i + 1].value)
                                : results.map(r => { return { date: r.date, value: (r.sum as number) / (r.count as number) }; });
                        callback(null, ret);
                    }
                });
            });
        } else {
            return new Promise<any[]>((resolve, reject) => {
                this.doGetHistory(aggregate, from, to, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });
        }
    }

    doCleanOldData(): Promise<void>;
    doCleanOldData(callback: (err: Error) => void): void;
    doCleanOldData(callback?: (err: Error) => void): void | Promise<void> {
        if (callback) {
            mongoDB.getMongoClient((err, client) => {
                if (err != null) {
                    logger.error("Cannot connect to Mongo:", err);
                    logger.error(err.stack);
                    callback(err);
                    return;
                }
                var db = client.db();
                var collection = this.id;
                if (this.keep) {
                    let collectionStore = db.collection(collection);
                    const now = new Date();
                    const limit = new Date(
                        now.getFullYear() - this.keep.years,
                        now.getMonth() - this.keep.months,
                        now.getDate() - this.keep.days,
                        now.getHours() - this.keep.hours,
                        now.getMinutes() - this.keep.minutes,
                        now.getSeconds() - this.keep.seconds,
                        now.getMilliseconds() - this.keep.milliseconds
                    );
                    collectionStore.deleteMany(
                        {
                            'date': { $lt: limit },
                        },
                        (err, result) => {
                            if (err) logger.error(`Could not remove old data from collection '${collection}'!`);
                            else logger.info(`Removed ${result.deletedCount} data older than ${limit} (${this.keepString.trim()}) from collection "${collection}".`);
                            false && this.devRemoveDuplicates(collection, (err) => {
                                if (err) logger.error(`Could not remove duplicates from collection '${collection}'!`, err);
                                else logger.info(`Removed duplicates and recreated unique index for collection "${collection}".`);
                            });
                            callback(err);
                        }
                    );

                }
                if (this.strategy === 'aggregate' && this.keepAggregation) {
                    const now = new Date();
                    const limit = new Date(
                        now.getFullYear() - this.keepAggregation.years,
                        now.getMonth() - this.keepAggregation.months,
                        now.getDate() - this.keepAggregation.days,
                        now.getHours() - this.keepAggregation.hours,
                        now.getMinutes() - this.keepAggregation.minutes,
                        now.getSeconds() - this.keepAggregation.seconds,
                        now.getMilliseconds() - this.keepAggregation.milliseconds
                    );
                    async.every(ALL_AGGREGATION_TYPES.values(),
                        (aggregate: AggregationType, cb) => {
                            if (aggregate == "none") { // handled with this.keep above
                                cb(null, true);
                                return;
                            }
                            const collectionName = collection + " by " + aggregate;
                            const collectionStore = db.collection(collectionName);
                            collectionStore.deleteMany(
                                {
                                    'date': { $lt: limit },
                                },
                                (err, result) => {
                                    if (err) logger.error(`Could not remove old data from collection '${collectionName}'!`);
                                    else logger.info(`Removed ${result.deletedCount} data older than ${limit} (${this.keepAggregationString.trim()}) from collection "${collectionName}".`);
                                    false && this.devRemoveDuplicates(collectionName, (err) => {
                                        if (err) logger.error(`Could not remove duplicates from aggregate collection '${collection}'!`, err);
                                        else logger.info(`Removed duplicates and recreated unique index for aggregate collection "${collection}".`);
                                    });
                                    cb(err, true);
                                }
                            );
                        },
                        (err) => {
                            callback(err);
                        });
                }
            });
        } else {
            return new Promise<void>((resolve, reject) => {
                this.doCleanOldData((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }

    async checkIndex(indexName: string, collectionStore: Collection<any>) {
        if (mongoDB.indexChecks[indexName] == true) {
            return; // index being checked
        }
        mongoDB.indexChecks[indexName] = true; // mark index as being checked

        let exists = await collectionStore.indexExists(indexName);
        let unique = true;
        if (exists) {
            try {
                const indexes = await collectionStore.indexes();
                const index = indexes.find((i: { name: string; }) => i.name === indexName);
                logger.debug(`indexInformation for "${indexName}" from collection "${collectionStore.collectionName}":`, indexes);
                unique = index.unique;
            } catch (e) {
                logger.error(`indexInformation failed for "${indexName}":`, e);
            }
            if (!unique) {
                try {
                    logger.warn(`Dropping index "${indexName}" for collection "${collectionStore.collectionName}" because it is not unique.`);
                    await collectionStore.dropIndex(indexName);
                    exists = false;
                } catch (e) {
                    logger.error(`Could not drop index "${indexName}":`, e);
                }
            }
        }
        if (!exists) {
            try {
                logger.warn(`Creating unique index "${indexName}" for collection "${collectionStore.collectionName}".`);
                await collectionStore.createIndex({ date: 1 }, { name: indexName, unique: true });
            } catch (e) {
                const str = e.message;
                if (str.includes("E11000 duplicate key error")) {
                    logger.error(`Could not create index "${indexName}" because of duplicate keys! Removing duplicates...`);
                    const devRemoveDuplicates = function (collectionName: string, callback: (err: Error) => void) {
                        return new Promise<void>((resolve, reject) => {
                            this.devRemoveDuplicates(collectionStore.collectionName, (err: Error) => {
                                callback(err);
                                resolve();
                            });
                        });
                    };

                    await devRemoveDuplicates(collectionStore.collectionName, (err) => {
                        if (err) {
                            logger.error(`Could not remove duplicates for index "${indexName}":`, err);
                        } else {
                            logger.info(`Removed duplicates for index "${indexName}".`);
                        }
                    });
                } else {
                    logger.error(`Could not create index "${indexName}":`, e);
                }
            }
        }
        mongoDB.indexChecks[indexName] = false; // remove mark that index is being checked
    }

    devRemoveDuplicates(collection: string, callback: (err: Error) => void) {
        mongoDB.getMongoClient((err, client) => {
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err);
                return;
            }
            var db = client.db();
            var collectionStore = db.collection(collection);
            const results = collectionStore.aggregate([
                { $group: { _id: "$date", count: { $sum: 1 }, docs: { $push: "$$ROOT" } } },
                { $match: { count: { $gt: 1 } } }
            ], { allowDiskUse: true }).toArray((err, results) => {
                if (err) {
                    logger.error(`Error while aggregating duplicates for collection "${collection}":`, err);
                    callback(err);
                    return;
                }
                logger.error(`Found ${results.length} duplicates in collection "${collection}":`);
                async.each(results, (result, cb) => {
                    let sum = 0;
                    let count = 0;
                    for (let i = 0; i < result.docs.length; i++) {
                        sum += parseFloat(result.docs[i].sum);
                        count += parseFloat(result.docs[i].count);
                        logger.error(`date ${result.docs[i].date} and avg ${result.docs[i].sum / result.docs[i].count}`);
                    }
                    logger.error(`date ${result._id} and cumulated avg ${sum / count}`);
                    collectionStore.deleteMany({ date: result._id }, (err, res) => {
                        if (err) {
                            logger.error(`Error while removing duplicates for collection "${collection}":`, err);
                            cb(err);
                        } else {
                            collectionStore.insertOne({ date: result._id, sum, count }, cb);
                        }
                    });
                }, async (err) => {
                    callback(err);
                });
            });
        });
    }

    devRebuildData(target: Exclude<AggregationType, 'change'>, from: Exclude<AggregationType, 'change'>, callback: (err: Error) => void) {
        mongoDB.getMongoClient((err, client) => {
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
                {},
                {
                    'projection': { '_id': 0, 'date': 1, 'count': 1, 'sum': 1 }
                }
            ).toArray((err, results) => {
                if (err) logger.error(err);
                else {
                    targetCollectionStore.deleteMany(
                        {},
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
                                                logger.error("Error while storing in Mongo:", err);
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
        mongoDB.getMongoClient((err, client) => {
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
                    filter += "d.setMonth(0);";
                case "month":
                    filter += "d.setDate(1);";
                case "day":
                    filter += "d.setHours(0);";
                case "hour":
                    filter += "d.setMinutes(0);";
                case "minute":
                    filter += "d.setMilliseconds(0);";
                    logger.log(from, to);
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
                                callback(err, results.map((r: { _id: string; value: any; }) => { return { "date": r._id, "value": r.value }; }));
                            }
                        });
                    break;

            }
        });
    }

    release() {
        super.release();
        mongoDB.nbInstances--;
        if (mongoDB.nbInstances === 0) {
            clearInterval(mongoDB.statsJob);
            mongoDB.statsJob = null;
            mongoDB.mongoClient && mongoDB.mongoClient.close();
            mongoDB.mongoClient = null;
        }
    }
}
