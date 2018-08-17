import assert = require('assert');
import { Parameters, InitObject, DomoModule } from '../lib/module';
import { GenericDevice, DeviceType } from '../devices/genericDevice';
import { ConfigLoader } from '../lib/load';
import * as events from 'events';

const logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export type ID = string;

export type Event = 'startup' | 'change';

export class message {
    emitter: GenericDevice;
    id: ID;
    oldValue: string;
    newValue: string;
    state?: string;
    dev?: string;
    tem?: string;
}

export abstract class Source /* extends events.EventEmitter */ implements DomoModule {
    // cannot derive events.EventEmitter because we want to pass Event to on, once, etc
    //id: id;

    private eventEmitter: events.EventEmitter;
    private devicesByAttribute: { [attribute: string]: { [id: string]: GenericDevice } };
    private devicesByPath: { [path: string]: GenericDevice }
    path: string;

    constructor(path: string) {
        this.eventEmitter = new events.EventEmitter();
        this.devicesByAttribute = {};
        this.devicesByPath = {};
        this.path = path;
    }

    abstract createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source;
    abstract getParameters(): Parameters;
    abstract setAttribute(device: GenericDevice, attribute: string, value: string, callback: (err: Error) => void): void;

    release(): void {
        Object.keys(this.devicesByPath).forEach(path => {
            this.devicesByPath[path].release();
        });
        this.devicesByAttribute = null;

        this.eventEmitter.removeAllListeners();
        this.eventEmitter = null;
    }

    addDevice(device: GenericDevice): void {
        this.devicesByPath[device.path] = device;
        if (!this.devicesByAttribute[device.attribute]) {
            this.devicesByAttribute[device.attribute] = {}
        }
        this.devicesByAttribute[device.attribute][device.id] = device;
    }

    releaseDevice(device: GenericDevice): void {
        let re = new RegExp(':' + device.path + '$')
        this.eventEmitter.eventNames().forEach(e => {
            if (re.test(e.toString())) {
                this.eventEmitter.removeAllListeners(e)
            }
        });

        this.devicesByAttribute[device.attribute][device.path] = null;
        delete this.devicesByAttribute[device.attribute][device.path];

        this.devicesByPath[device.path] = null;
        delete this.devicesByPath[device.path];
    }

    setDeviceAttribute(id: ID, attribute: string, value: string): void {
        if (this.devicesByAttribute[attribute]) {
            let d = this.devicesByAttribute[attribute][id];
            if (d) {
                if (d && d.getState() != value) {
                    this.emitEvent('change', d.path, { oldValue: d.getState(), newValue: value })
                    d.state = value;
                }
            } else {
                // here the space for discovered devices
                logger.info('Discovered device {type=device, source=%s, id=%s, attribute=%s}', this.path, id, attribute);
            }
        }
    }

    setDeviceState(id: ID, state: string): void {
        this.setDeviceAttribute(id, 'state', state);
    }

    private static supportedDeviceTypes: {
        source: new () => Source,
        deviceType: DeviceType,
        parameters: Parameters
    }[] = [];

    static registerDeviceType<S extends Source>(source: new (...args: any[]) => S, deviceType: DeviceType, parameters: Parameters) {
        Source.supportedDeviceTypes.push({
            source: source,
            deviceType: deviceType,
            parameters: parameters
        })
    }

    static deregisterDeviceType<S extends Source>(source: new (...args: any[]) => S, deviceType: DeviceType) {
        Source.supportedDeviceTypes = Source.supportedDeviceTypes.filter((sdt) => {
            return (source !== sdt.source || sdt.deviceType !== deviceType);
        });
    }

    static deregisterDeviceTypes<S extends Source>(source: new (...args: any[]) => S) {
        Source.supportedDeviceTypes = Source.supportedDeviceTypes.filter((sdt) => {
            return (source !== sdt.source);
        });
    }

    getDeviceParameters(type: DeviceType): Parameters {
        logger.debug("Looking for parameters for device type '%s' in", type, Source.supportedDeviceTypes);
        for (var i in Source.supportedDeviceTypes) {
            let element = Source.supportedDeviceTypes[i];

            if (this instanceof element.source && type == element.deviceType) {
                logger.debug("Found", element);
                return element.parameters;
            }
        }
        logger.debug("Nothing found.", );
        throw new Error("Source does not support device type '" + type + "'.");
    }

    emitEvent(event: Event, path: string, arg: any) {
        this.eventEmitter.emit(event + ":" + path, arg);
        logger.info('Device "%s" (%s) emitted "%s": %s', path, this.devicesByPath[path].name, event, JSON.stringify(arg, function (arg, value) {
            if (arg !== "emitter")
                return value;
        }));
    }

    on(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: Event, id: string, listener: (msg: message) => void): this;
    on(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            this.eventEmitter.on(event, listener);
            return this;
        }

        var id: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        this.eventEmitter.on(event + ":" + id, listener);
        return this;
    }

    once(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: Event, id: string, listener: (msg: message) => void): this;
    once(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            this.eventEmitter.once(event, listener);
            return this;
        }

        var id: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        this.eventEmitter.once(event + ":" + id, listener);
        return this;
    }

    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: Event, id: string, listener: (msg: message) => void): this;
    removeListener(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            this.eventEmitter.removeListener(event, listener);
            return this;
        }

        var id: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        this.eventEmitter.removeListener(event + ":" + id, listener);
        return this;
    }
}

export class DefaultSource extends Source {
    constructor() {
        super('default');
    }
    createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): Source {
        return new DefaultSource;
    }
    getParameters(): Parameters {
        return {};
    }
    setAttribute(device: GenericDevice, attribute: string, value: string, callback: (err: Error) => void): void {
        return callback(new Error('Unsupported attribute/value: ' + attribute + '/' + value))
    }
}

export const DEFAULT_SOURCE = new DefaultSource;
