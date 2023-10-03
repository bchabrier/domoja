import { GenericDevice, DeviceOptions, WidgetType } from '..'
import { Source, message, ID, DefaultSource } from '..'
import * as assert from 'assert';
import { InitObject, Parameters } from '..';
import { ConfigLoader, getDevicesFromTagList } from '..';
import * as persistence from '../persistence/persistence';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

type groupFunction = (newValues: Array<{ name: string, state: string, previousState: string, isTrigger: boolean }>, callback: (error: Error, value: string) => void) => void;
type internalGroupFunction = (newValues: Array<{ name: string, state: string, previousState: string, isTrigger: boolean }>, args: string[], callback: (error: Error, value: string) => void) => void;

const functions: { name: string, nargs: number, argsDescription: string, description: string, func: internalGroupFunction }[] = [
  {
    name: "count",
    nargs: 0,
    argsDescription: "",
    description: "Counts the number of devices in the group",
    func: (newValues, args, callback) => callback(null, newValues.length.toString())
  },
  {
    name: "count-if",
    nargs: 1,
    argsDescription: "",
    description: "Counts the number of devices having a value in the group",
    func: (newValues, args, callback) => callback(null, newValues.filter(v => v.state === args[0]).length.toString())
  },
  {
    name: "some",
    nargs: 3,
    argsDescription: "<= value>:<if value>:<else value>",
    description: "If some devices have a value in the group",
    func: (newValues, args, callback) => callback(null, newValues.some(v => v.state === args[0]) ? args[1] : args[2])
  },
  {
    name: "some-different",
    nargs: 3,
    argsDescription: "<!= value>:<if value>:<else value>",
    description: "If some devices have a different value in the group",
    func: (newValues, args, callback) => callback(null, newValues.some(v => v.state !== args[0]) ? args[1] : args[2])
  }
]

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

      const funcTab = func.split(":");
      const funcName = funcTab[0];
      const funcArgs = funcTab.slice(1, funcTab.length);

      const foundFunctions = functions.filter(f => f.name === funcName && f.nargs === funcArgs.length);

      if (foundFunctions.length === 1) {
        const foundFunction = foundFunctions[0];
        this.function = (newValues, callback) => foundFunction.func(newValues, funcArgs, callback);
      } else {
        const help = `\nSupported functions are:\n${functions.map(f => `- "${f.name}:${f.argsDescription}": ${f.description}`).join("\n")}`;

        if (foundFunctions.length === 0)
          logger.warn(`Function '${func}' not supported in group '${this.path}'.` + help);
        else
          logger.error(`Too many internal functions matching '${func}' in group '${this.path}'.` + help);

        this.function = (newValues, callback) => callback(null, undefined);
      }
    } else {
      this.function = (newValues, callback) => func(newValues, (error: Error, value: string) => callback(error, value?.toString() || ""));
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
    this.function = null;
    this.devices = null;
  }

  releaseListeners() {
    this.devices && this.devices.forEach(d => d.removeListener('change', this.recomputeStateHandler));

  }

  initialize() {
    this.releaseListeners();

    this.devices = getDevicesFromTagList(this.tagList);

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
