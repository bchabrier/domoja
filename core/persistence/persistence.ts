import * as assert from 'assert';
import { MongoClient } from 'mongodb';
import { message } from '../sources/source';

const logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class persistence {
    insert(collection: string, record: Object, callback: (err: Error, doc: Object) => void): void {
        MongoClient.connect('mongodb://127.0.0.1:27017/domoja', function (err, client) {
            if (err) { logger.error("error:", err, err.stack); return }
            var db = client.db();
            if (err != null) {
                logger.error("Cannot connect to Mongo:", err);
                logger.error(err.stack);
                callback(err, null);
                return;
            }
            logger.trace("inserting in Mongo...")
            var collectionStore = db.collection(collection);
            collectionStore.insertOne(record, function (err, doc) {
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

    getLastFromDB(collectionName: string, callback: (err: Error, results: Object[]) => void): void {
        MongoClient.connect('mongodb://127.0.0.1:27017/domoja',
            function (err, client) {
                var db = client.db();
                if (err != null) {
                    logger.error("Cannot connect to Mongo:", err);
                    logger.error(err.stack);
                    callback(err, undefined);
                    return;
                }
                var collection = db.collection(collectionName);
                // Locate all the entries using find
                collection.find().sort({
                    date: -1
                }).limit(1).toArray(callback);
            });
    };
}