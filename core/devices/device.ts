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

const params: Parameters = {
  source: 'REQUIRED',
  id: 'REQUIRED',
  attribute: 'OPTIONAL', // to select "tem", "kwh", "w"...      
  camera: 'OPTIONAL' // added for alarm (should be an array)      
}

export class device extends GenericDevice {
  constructor(source: Source, instanceFullname: string, id: ID, attribute: string, name: string, options?: DeviceOptions) {
    super(source, 'device', instanceFullname, id, attribute, name, options);
  }

  createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): DomoModule {
    return new device(initObject.source, instanceFullname, initObject.id, initObject.attribute, initObject.name, {
      camera: initObject.camera
    });
  }

  getParameters(): Parameters { return params; }

}

Source.registerDeviceType(DefaultSource, 'device', params);


Source.registerDeviceType(DefaultSource, 'relay', {
  source: 'REQUIRED',
  id: 'REQUIRED'
});
