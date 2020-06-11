import { GenericDevice, DeviceOptions, WidgetType } from '../devices/genericDevice'
import { Source, message, ID, DefaultSource } from '../sources/source'
import * as assert from 'assert';
import { InitObject, Parameters } from '../lib/module';
import { ConfigLoader } from '../lib/load';
import * as persistence from '../persistence/persistence';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class sensor extends GenericDevice {
  constructor(source: Source, path: string, id: ID, attribute: string, name: string, initObject: InitObject, options?: DeviceOptions) {
    super(source, 'sensor', path, id, attribute, name, initObject, options);
  }

  createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): GenericDevice {
    return new sensor(initObject.source, path, initObject.id, initObject.attribute, initObject.name, initObject, {
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
