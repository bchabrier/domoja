import { GenericDevice, DeviceOptions } from './genericDevice'
import { Source, ID } from '../sources/source'
import { InitObject, Parameters } from '..';
import * as express from 'express'
const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export abstract class camera extends GenericDevice {
  constructor(source: Source, instanceFullname: string, id: ID, attribute: string, name: string, initObject: InitObject, options?: DeviceOptions) {
    super(source, 'camera', instanceFullname, id, attribute, name, initObject, options);
  }
  abstract getSnapshot(callback: (err: Error, data?: string) => void): void;
}

