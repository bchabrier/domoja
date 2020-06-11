import * as assert from 'assert';
import { MongoClient } from 'mongodb';
import { message } from '../sources/source';

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
                    callback(err, null);
                }
                // Let's close the db
                client.close();
                /*
                 * collection.count(function(err, count) { if (err != null) {
                 * logger.error(err); logger.error(err.stack); }
                 * logger.trace(format("%s (%s) count = %s", id, name, count)); //
                 * Locate all the entries using find
                 * collection.find().toArray(function(err, results) { if (err !=
                 * null) { logger.error(err); logger.error(err.stack); } else {
                 * logger.trace(results.length); // Let's close the db
                 * db.close(); } }); });
                 */
                callback(null, record);
            });
        });
    }

    getLastFromDB(callback: (err: Error, result: Object) => void): void {
        if (demoMode) return callback(null, undefined);
        MongoClient.connect('mongodb://127.0.0.1:27017/domoja', (err, client) => {
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err, undefined);
                return;
            }
            var db = client.db();
            var collectionName = this.id;
            var collection = db.collection(collectionName);
            // Locate all the entries using find
            collection.find().sort({
                //date: -1
                $natural: -1
            }).limit(1).toArray((err, results) => {
                let result = err ? undefined : results[0];
                console.log(this.id);
                callback(err, result);
            });
        });
    };
}