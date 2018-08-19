import { GenericDevice, DeviceOptions } from '..'
import { Source, message, ID, DefaultSource } from '..'
import * as assert from 'assert';
import { InitObject, Parameters } from '..';
import { ConfigLoader } from '..';
import * as persistence from '../persistence/persistence';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class sensor extends GenericDevice {
  constructor(source: Source, path: string, id: ID, attribute: string, name: string, options?: DeviceOptions) {
    super(source, 'sensor', path, id, attribute, name, options);

  let self = this;
    this.on("change", function (msg) {
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

      self.persistence.insert("sensors", {
        infos: infos,
        date: d,
      }, function (err: Error, docs: message[]) {
        if (err != null) {
          logger.error("Error while storing in %s: ", this.persistence.name, err)
          logger.error(err.stack)
        }
      });
    });
  }

  // call callback(value)
  getLastValueFromDB = function (callback: any) {
    this.persistence.getLastFromDB("sensors", function (err: Error, results: message[]) {
      if (err != null) {
        logger.error(err);
        logger.error(err.stack);
        callback(undefined);
      } else {
        logger.trace(results.length);
        if (results.length == 0) {
          // no value stored!
          logger.warn("no value stored")
          callback(undefined);
        } else {
          assert(results.length == 1);
          // should be modified to not be temperature sensor
          // specific
          logger.trace("returning ", results[0].tem)
          callback(results[0].tem);
        }
      }
    });
  };

  createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): GenericDevice {
    return new sensor(initObject.source, path, initObject.id, initObject.attribute, initObject.name, {
      transform: initObject.transform,
      camera: initObject.camera
    });
  }

}

Source.registerDeviceType(DefaultSource, 'sensor', {
  source: 'REQUIRED',
  id: 'REQUIRED',
  transform: 'OPTIONAL',
  camera: 'OPTIONAL' // added for alarm (should be an array)
});
