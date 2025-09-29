import { Collection, MongoClient } from 'mongodb';
import * as async from 'async';

import { colorConsole } from 'tracer';
import { persistence, DataSet, ALL_DATA_SETS } from './persistence';

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
    private lastChangeRecord: { date: Date, state: string | Date } = undefined; // last value saved in DB, to avoid useless updates in "change" data set

    constructor(id: string, keepString?: string) {
        super(id, keepString);

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
    private static getMongoClient(): Promise<MongoClient>;
    private static getMongoClient(callback: (err: Error, client: MongoClient) => void): void;
    private static getMongoClient(callback?: (err: Error, client: MongoClient) => void): void | Promise<MongoClient> {
        if (!callback) return new Promise<MongoClient>((resolve, reject) => {
            this.getMongoClient((err, client) => {
                if (err) reject(err);
                else resolve(client);
            });
        });

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

                async.every([...ALL_DATA_SETS],
                    async (dataSet: DataSet) => {
                        // do not store if not needed
                        if (!this.keep[dataSet] || this.keep[dataSet].toMillis() === 0) return true;

                        switch (dataSet) {
                            case "raw": {
                                var collectionStore = db.collection(collection);
                                const indexName = "Index for " + collection;

                                try {
                                    await collectionStore.insertOne(record);
                                } catch (err) {
                                    logger.error("Error while storing in Mongo:", err);
                                    logger.error(err.stack);
                                }

                                await mongoDB.checkIndex(indexName, collectionStore);

                                return true;
                            }
                            case "change": {
                                var collectionStore = db.collection(collection + " by " + dataSet);
                                const indexName = "Index for " + collection + " by " + dataSet;

                                // check last value
                                if (this.lastChangeRecord === undefined) {
                                    [this.lastChangeRecord] = await collectionStore.find(
                                        {},
                                        {
                                            'sort': { date: -1 },
                                            'limit': 1,
                                            'projection': { '_id': 0, 'date': 1, 'state': 1 }
                                        }
                                    ).toArray() as { date: Date, state: string }[];
                                }

                                if (this.lastChangeRecord && record.date.getTime() <= this.lastChangeRecord.date.getTime()) {
                                    logger.warn("Cannot insert record with date older than last record date", this.lastChangeRecord.date, "in 'change' data set, while inserting", record);
                                    return true; // log error, but continue processing other data sets
                                }

                                if (this.lastChangeRecord && this.lastChangeRecord.state === record.state) {
                                    // same value, ignore
                                    return true;
                                }


                                // otherwise, just insert the new value
                                await collectionStore.insertOne(record);
                                this.lastChangeRecord = record;

                                await mongoDB.checkIndex(indexName, collectionStore); // checked after insert to ensure the collection exists

                                return true;
                            }
                            default: {
                                let d = new Date(record.date);
                                switch (dataSet) {
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
                                        let n: never = dataSet;
                                }
                                var collectionStore = db.collection(collection + " by " + dataSet);
                                const indexName = "Index for " + collection + " by " + dataSet;

                                try {
                                    await collectionStore.updateOne(
                                        {
                                            date: d
                                        },
                                        {
                                            $inc: { sum: parseFloat(record.state), count: 1 }
                                        },
                                        {
                                            upsert: true
                                        }
                                    );
                                } catch (err) {
                                    logger.error("Error while storing in Mongo:", err);
                                }

                                await mongoDB.checkIndex(indexName, collectionStore); // checked after insert to ensure the collection exists

                                return true;
                            }
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

    doBackupStateToDB(state: string | Date, date: Date): Promise<void>;
    doBackupStateToDB(state: string | Date, date: Date, callback: (err: Error) => void): void;
    doBackupStateToDB(state: string | Date, date: Date, callback?: (err: Error) => void): void | Promise<void> {

        if (callback) {
            mongoDB.getMongoClient(async (err, client) => {
                if (err) return callback(err);
                var db = client.db();
                var collection = db.collection('Backup states');
                const indexName = "Index for Backup states";

                const newObject = {
                    'id': this.id,
                    state: state,
                    date: date
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
                }).then(async () => {

                    await mongoDB.checkIndex(indexName, collection);

                    callback(null);
                });
            });
        } else {
            return new Promise<void>((resolve, reject) => {
                this.doBackupStateToDB(state, date, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    };

    doGetHistory(dataSet: DataSet, from: Date | null, to: Date | null): Promise<any[]>;
    doGetHistory(dataSet: DataSet, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;
    doGetHistory(dataSet: DataSet, from: Date | null, to: Date | null, callback?: (err: Error, results: any[]) => void): void | Promise<any[]> {
        if (callback) {
            mongoDB.getMongoClient((err, client) => {
                var db = client.db();
                var collection = this.id;
                if (dataSet != "raw") {
                    collection += " by " + dataSet;
                }
                let collectionStore = db.collection(collection);
                collectionStore.find(
                    from && to ? {
                        'date': { $gte: from, $lte: to }
                    } : from ? {
                        'date': { $gte: from }
                    } : to ? {
                        'date': { $lte: to }
                    } : {}
                    ,
                    {
                        'sort': { date: 1 },
                        'projection': { '_id': 0, 'date': 1, 'count': 1, 'sum': 1, 'state': 1 }
                    }
                ).toArray((err, results) => {
                    if (err) {
                        callback(err, null);
                    } else {
                        const ret = dataSet === "raw" || dataSet === "change"
                            ? results.map(r => { return { date: r.date, value: r.state }; })
                            : results.map(r => { return { date: r.date, value: (r.sum as number) / (r.count as number) }; });
                        callback(null, ret);
                    }
                });
            });
        } else {
            return new Promise<any[]>((resolve, reject) => {
                this.doGetHistory(dataSet, from, to, (err, results) => {
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
                    const now = new Date();
                    async.every(ALL_DATA_SETS.values(),
                        (dataSet: DataSet, cb) => {
                            if (!this.keep[dataSet] || this.keep[dataSet].toMillis() === 0) return cb(null, true);

                            const limit = new Date(
                                now.getFullYear() - this.keep[dataSet].years,
                                now.getMonth() - this.keep[dataSet].months,
                                now.getDate() - this.keep[dataSet].days,
                                now.getHours() - this.keep[dataSet].hours,
                                now.getMinutes() - this.keep[dataSet].minutes,
                                now.getSeconds() - this.keep[dataSet].seconds,
                                now.getMilliseconds() - this.keep[dataSet].milliseconds
                            );

                            const collectionName = dataSet === 'raw' ? collection : collection + " by " + dataSet;
                            const collectionStore = db.collection(collectionName);
                            collectionStore.deleteMany(
                                {
                                    'date': { $lt: limit },
                                },
                                (err, result) => {
                                    if (err) logger.error(`Could not remove old data from collection '${collectionName}'!`);
                                    else logger.info(`Removed ${result.deletedCount} data older than ${limit} (${this.keepString[dataSet].trim()}) from collection "${collectionName}".`);
                                    false && mongoDB.devRemoveDuplicates(collectionName, (err) => {
                                        if (err) logger.error(`Could not remove duplicates from collection '${collection}'!`, err);
                                        else logger.info(`Removed duplicates and recreated unique index for collection "${collection}".`);
                                    });
                                    cb(err, err === null);
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

    static async checkIndex(indexName: string, collectionStore: Collection<any>) {
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
                logger.info(`Creating unique index "${indexName}" for collection "${collectionStore.collectionName}".`);
                await collectionStore.createIndex({ date: 1 }, { name: indexName, unique: true });
            } catch (e) {
                const str = e.message;
                if (str.includes("E11000 duplicate key error")) {
                    logger.error(`Could not create index "${indexName}" because of duplicate keys! Removing duplicates...`);
                    const devRemoveDuplicates = function (collectionName: string, callback: (err: Error) => void) {
                        return new Promise<void>((resolve, reject) => {
                            mongoDB.devRemoveDuplicates(collectionStore.collectionName, (err: Error) => {
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

    static devRemoveDuplicates(collection: string, callback: (err: Error) => void) {
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

    devRebuildData(target: Exclude<DataSet, 'change'>, from: Exclude<DataSet, 'change'>, callback: (err: Error) => void) {
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
                                    if (target == "raw") return;
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

    static override async deviceIdsFromDB(): Promise<string[]> {
        try {
            const client = await mongoDB.getMongoClient();

            const collectionNames = (await client.db().collections()).filter(col =>
                col.collectionName !== 'system.indexes'
                && col.collectionName !== 'Backup states'
                && !col.collectionName.endsWith('by change')
                && !col.collectionName.endsWith('by day')
                && !col.collectionName.endsWith('by hour')
                && !col.collectionName.endsWith('by minute')
                && !col.collectionName.endsWith('by month')
                && !col.collectionName.endsWith('by week')
                && !col.collectionName.endsWith('by year')
            ).map(col => col.collectionName);

            const deviceIds = (await client.db().collection('Backup states').find(
                {},
                {
                    'projection': { '_id': 0, 'id': 1 }
                }
            ).toArray()).map(r => r.id);

            return collectionNames.concat(deviceIds).filter((v, i, a) => a.indexOf(v) === i) // unique values
                .sort((a, b) => {
                    if (a < b) return -1;
                    if (a > b) return 1;
                    return 0;
                });
        } catch (e) {
            logger.error("Could not get deviceIds from MongoDB:", e);
            return [];
        }
    }

    async doLoadDatasetToDB(dataSet: DataSet, records: { date: Date, state: string }[] | { date: Date, sum: number, count: number }[]): Promise<void> {
        let collectionName = this.id;
        if (dataSet !== 'raw') {
            collectionName += ' by ' + dataSet;
        }

        const client = await mongoDB.getMongoClient();
        var db = client.db();
        let collectionStore = db.collection(collectionName);
        const ret = await collectionStore.insertMany(records);
    }

    async doDumpDatasetFromDB(dataSet: DataSet): Promise<{ date: Date, state: string }[] | { date: Date, sum: number, count: number }[]> {
        let collectionName = this.id;
        if (dataSet !== 'raw') {
            collectionName += ' by ' + dataSet;
        }

        const client = await mongoDB.getMongoClient();
        var db = client.db();
        let collectionStore = db.collection(collectionName);
        const results = await collectionStore.find(
            {},
            {
                'sort': { date: 1 },
                'projection': { '_id': 0, 'date': 1, 'count': 1, 'sum': 1, 'state': 1 }
            }
        ).toArray();

        return results;
    }


    async release() {
        await super.release();
        mongoDB.nbInstances--;
        if (mongoDB.nbInstances === 0) {
            clearInterval(mongoDB.statsJob);
            mongoDB.statsJob = null;
            mongoDB.mongoClient && await mongoDB.mongoClient.close();
            mongoDB.mongoClient = null;
        }
    }
}
