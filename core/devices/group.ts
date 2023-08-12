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

type groupFunction = (newValues: Array<{ name: string, state: string, previousState: string, isTrigger: boolean }>, callback: (error: Error, value: string) => void) => void;
type internalGroupFunction = (newValues: Array<{ name: string, state: string, previousState: string, isTrigger: boolean }>, callback: (error: Error, value: string) => void) => void;

export class group extends GenericDevice {
  configLoader: ConfigLoader;
  tagList: string;
  devices: Array<GenericDevice>;
  recomputeStateHandler = (event: message) => this.recomputeState(event.emitter)
  function: groupFunction;


  constructor(source: Source, path: string, name: string, configLoader: ConfigLoader, tagList: string, func: string | Function, initObject: InitObject) {
    super(source, 'group', path, path, 'state', name, initObject);

    this.configLoader = configLoader;
    this.tagList = tagList;

    if (typeof func === 'string') {
      switch (func) {
        case 'count':
          this.function = (newValues, callback) => callback(null, newValues.length.toString());
          break;
        default:
          logger.warning(`Function '${func}' not supported in group '${this.path}'.`);
          this.function = (newValues, callback) => callback(null, undefined);
          break;
      }
    } else {
      this.function = (newValues, callback) => func(newValues, (error: Error, value: string) => callback(error, value.toString()));
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

    this.devices = this.configLoader.getDevicesFromTagList(this.tagList);

    this.devices.forEach(d => d.on('change', this.recomputeStateHandler));
  }

  recomputeState(emitter?: GenericDevice) {
    this.function(this.devices.map(d => ({
      name: d.name,
      state: d.getState(),
      previousState: d.getPreviousState(),
      isTrigger: emitter && d === emitter
    })), (error, newValue) => {
      if (error) logger.error(error);
      else if (newValue != this.state) {
        // avoid looping indefinitely if the group has a tag in the taglist
        this.source.setAttribute(this.id, this.attribute, newValue, (err: Error) => {
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
