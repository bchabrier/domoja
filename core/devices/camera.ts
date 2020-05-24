import { GenericDevice, DeviceOptions } from './genericDevice'
import { Source, ID } from '../sources/source'
import { InitObject, Parameters } from '..';
import * as http from 'http'
const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export abstract class camera extends GenericDevice {
  constructor(source: Source, instanceFullname: string, id: ID, attribute: string, name: string, initObject: InitObject, options?: DeviceOptions) {
    super(source, 'camera', instanceFullname, id, attribute, name, initObject, options);
  }
  abstract getSnapshot(baseURL: string, headers: http.IncomingHttpHeaders, callback: (response: http.IncomingMessage) => void): void;
  abstract getStream(baseURL: string, headers: http.IncomingHttpHeaders, callback: (response: http.IncomingMessage) => void): void;
}

