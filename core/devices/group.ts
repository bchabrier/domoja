import { GenericDevice, DeviceOptions, WidgetType } from '..'
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

export class group extends GenericDevice {
  configLoader: ConfigLoader;
  tagList: string;
  devices: Array<GenericDevice>;
  recomputeStateHandler = (event: message) => this.recomputeState();
  function: (newValues: Array<string>, callback: (error: Error, value: string) => void) => void;


  constructor(source: Source, path: string, name: string, configLoader: ConfigLoader, tagList: string, func: string | Function, initObject: InitObject) {
    super(source, 'group', path, path, 'state', name, initObject);

    this.configLoader = configLoader;
    this.tagList = tagList;

    if (typeof func === 'string') {
      switch (func) {
        case 'count':
          this.function = (newValues: Array<string>, callback: (error: Error, value: string) => void) => callback(null, newValues.length.toString());
          break;
        default:
          logger.warning(`Function '${func}' not supported in group '${this.path}'.`);
          this.function = (newValues: Array<string>, callback: (error: Error, value: string) => void) => callback(null, undefined);
          break;
      }
    } else {
      this.function = (newValues: Array<string>, callback: (error: Error, value: string) => void) => func(newValues, (error: Error, value: string) => callback(error, value.toString()));
    }

    configLoader.on('startup', event => {
      this.initialize();
      this.recomputeState();
    });
  };

  createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): GenericDevice {
    return new group(configLoader.DEFAULT_SOURCE, path, initObject.name, configLoader, initObject.taglist, initObject.function, initObject);
  }

  release() {
    this.releaseListeners();
    super.release();
  }

  releaseListeners() {
    this.devices && this.devices.forEach(d => d.removeListener('change', this.recomputeStateHandler));

  }

  initialize() {
    this.releaseListeners();

    this.devices = Object.keys(this.configLoader.devices).map(d => this.configLoader.devices[d].device).filter(
      d => {
        for (var t of this.tagList.split(/, */)) {
          if (d.matchTag(t)) {
            return true;
          }
        }
        return false;
      }
    );

    this.devices.forEach(d => d.on('change', this.recomputeStateHandler));
  }

  recomputeState() {
    this.function(this.devices.map(d => d.getState()), (error, newValue) => {
      if (error) logger.error(error);
      else if (newValue != this.state) {
        // avoid looping indefinitely if the group has a tag in the taglist
        this.source.setAttribute(this.id, this.attribute, newValue, (err) => {
          err && logger.error(err);
        });
      }
    });
  }

}

Source.registerDeviceType(DefaultSource, 'group', {
  function: 'REQUIRED',
  taglist: 'REQUIRED'
});
