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

export class variable extends GenericDevice {
  constructor(source: Source, path: string, name: string) {
    super(source, 'variable', path, path, 'state', name);
  };

  createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): GenericDevice {
    return new variable(configLoader.DEFAULT_SOURCE, path, initObject.name);
  }

}

Source.registerDeviceType(DefaultSource, 'variable', {});
