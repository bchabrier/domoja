import assert = require('assert');
import { Source, ID, message, DefaultSource } from '../sources/source'
import { GenericDevice, DeviceOptions } from './genericDevice'
import { ConfigLoader } from '../lib/load';
import { InitObject, Parameters, DomoModule } from '../lib/module';


const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});


export class device extends GenericDevice {
  constructor(source: Source, instanceFullname: string, id: ID, name: string, options?: DeviceOptions) {
    super(source, 'device', instanceFullname, id, name, options);
  }
   
  createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): DomoModule {
    return new device(initObject.source, instanceFullname, initObject.id, initObject.name, {
      camera: initObject.camera
    });
  }

  getParameters(): Parameters {
    return {
      source: 'REQUIRED',
      id: 'REQUIRED',
      camera: 'OPTIONAL' // added for alarm (should be an array)      
    }
  }

}

Source.registerDeviceType(DefaultSource, 'device', {
  source: 'REQUIRED',
  id: 'REQUIRED',
  camera: 'OPTIONAL' // added for alarm (should be an array)      
});
