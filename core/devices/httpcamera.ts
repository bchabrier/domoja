import { GenericDevice, DeviceOptions, CustomDeviceType } from './genericDevice'
import { camera } from './camera'
import { Source, ID, DefaultSource } from '../sources/source'
import * as request from 'request'
import { InitObject, Parameters } from '../lib/module';
import { ConfigLoader } from '../lib/load';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class httpCamera extends camera {

  videoUrl: string;
  snapshotUrl: string;

  constructor(source: Source, url: string, instanceFullname: string, name: string, initObject: InitObject, options?: DeviceOptions) {
    super(source, instanceFullname, url, 'unused', name, initObject, options);
    this.videoUrl = initObject['video-url'];
    this.snapshotUrl = initObject['snapshot-url'];
  }

  getSnapshot(callback: (err: Error, data?: string) => void): void {
    request.get(this.snapshotUrl, { encoding: null }, function (error: Error, response: request.RequestResponse, body: string) {
      if (!error && response.statusCode == 200) {
        //	    logger.error('body:', body);
        //	    logger.error('response:', response);
        callback(null, body);
      } else {
        if (error) {
          logger.error('Error in getSnapshot:', error);
          callback(error);
        } else {
          logger.error('Error in getSnapshot: statusCode', response.statusCode);
          callback(new Error('Status code=' + response.statusCode));
        }
      }
    });
  }

  createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): GenericDevice {
    return new httpCamera(configLoader.DEFAULT_SOURCE, initObject['video-url'], instanceFullname, initObject.name, initObject);
  }

}

Source.registerDeviceType(DefaultSource, new CustomDeviceType('httpCamera'), {
  'video-url': 'REQUIRED',
  'snapshot-url': 'REQUIRED',
  name: 'REQUIRED', 
});
