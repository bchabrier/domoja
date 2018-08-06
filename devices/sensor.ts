import { GenericDevice, DeviceOptions } from '../devices/genericDevice'
import { Source, message, ID } from '../sources/source'
import { MongoClient } from 'mongodb';
import * as assert from 'assert';
import { InitObject, Parameters } from '../lib/module';
import { ConfigLoader } from '../lib/load';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class sensor extends GenericDevice {
  constructor(source: Source, instanceFullname: string, id: ID, name: string, options?: DeviceOptions) {
    super(source, 'sensor', instanceFullname, id, name, options);

    this.on("change", function (msg) {
      MongoClient.connect('mongodb://127.0.0.1:27017/domotique', function (
        err, client) {
          if (err) {logger.error("error:", err, err.stack); return}
        var db = client.db();
        if (err != null) {
          logger.error("Cannot connect to Mongo:", err);
          logger.error(err.stack);
          return;
        }
        logger.trace("inserting in Mongo...")
        var collection = db.collection("sensors");
        var d = new Date();
        msg.emitter.lastChangeDate = d;
        var infos = <any>{};
        Object.keys(msg).forEach((f: keyof message) => {
          var t = typeof (msg[f]); 
          // let's store only the flat properties
          if (t != "object" && t != "function") {
            infos[f] = msg[f];
          }
        });
        collection.insert({
          infos: infos,
          date: d,
        }, function (err: Error, docs) {
          if (err != null) {
            logger.error("Error while storing in Mongo:", err)
            logger.error(err.stack)
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
        });
      });
    });
  }

  // call callback(value)
  getLastValueFromDB = function (callback: any) {
    MongoClient.connect('mongodb://127.0.0.1:27017/domotique',
      function (err, client) {
        var db = client.db();
        if (err != null) {
          logger.error("Cannot connect to Mongo:", err);
          logger.error(err.stack);
          callback(undefined);
          return;
        }
        var collection = db.collection("sensors");
        // Locate all the entries using find
        collection.find().sort({
          date: -1
        }).limit(1).toArray(function (err, results) {
          if (err != null) {
            logger.error(err);
            logger.error(err.stack);
            // Let's close the db if needed
            client.close();
            callback(undefined);
          } else {
            logger.trace(results.length);
            // Let's close the db
            client.close();
            if (results.length == 0) {
              // no value stored!
              logger.warn("no value stored")
              callback(undefined);
            } else {
              assert(results.length == 1);
              // should be modified to not be temperature sensor
              // specific
              logger.trace("returning ", results[0].infos.tem)
              callback(results[0].infos.tem);
            }
          }
        });
      });
  };

  createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): GenericDevice {
    return new sensor(initObject.source, instanceFullname, initObject.id, initObject.name, {
      transform: initObject.transform,
      camera: initObject.camera
    });
  }

}
