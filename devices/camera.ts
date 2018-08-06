import { GenericDevice, DeviceOptions } from './genericDevice'
import { Source, ID } from '../sources/source'
import * as express from 'express'
const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export abstract class camera extends GenericDevice {
  constructor(source: Source, instanceFullname: string, id: ID, name: string, options?: DeviceOptions) {
    super(source, 'camera', instanceFullname, id, name, options);
  }
  abstract getSnapshot(callback: (err: Error, data?: string) => void): void;
}

