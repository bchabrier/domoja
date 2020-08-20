import * as assert from 'assert';
import { Parameters, InitObject, DomoModule } from '../lib/module';
import { GenericDevice, DeviceType, CustomDeviceType } from '../devices/genericDevice';
import { ConfigLoader } from '../lib/load';
import * as events from 'events';
import * as colors from 'colors/safe';

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
    date: Date;
    state?: string;
    dev?: string;
    tem?: string;
}

export abstract class Source /* extends events.EventEmitter */ implements DomoModule {
    // cannot derive events.EventEmitter because we want to pass Event to on, once, etc
    //id: id;

    private eventEmitter: events.EventEmitter;
    private devicesByAttribute: { [attribute: string]: { [id: string]: GenericDevice[] } };
    private devicesByPath: { [path: string]: GenericDevice }
    path: string;
    private discoveredDevices: { [id_attribute: string]: boolean } = {};

    constructor(path: string) {
        this.eventEmitter = new events.EventEmitter();
        this.devicesByAttribute = {};
        this.devicesByPath = {};
        this.path = path;
    }

    abstract createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source;
    abstract getParameters(): Parameters;
    abstract doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void;
    release(): void {
        Object.keys(this.devicesByPath).forEach(path => {
            this.devicesByPath[path].release();
        });
        this.devicesByAttribute = null;
        this.devicesByPath = null;

        this.eventEmitter.removeAllListeners();
        this.eventEmitter = null;

        this.discoveredDevices = null;
    }

    addDevice(device: GenericDevice): void {
        logger.debug('Adding device "%s" (%s, %s, %s) to source "%s"...', device.path, device.id, device.attribute, device.name, this.path);
        this.devicesByPath[device.path] = device;
        if (!this.devicesByAttribute[device.attribute]) {
            this.devicesByAttribute[device.attribute] = {}
        }
        if (!this.devicesByAttribute[device.attribute][device.id]) {
            this.devicesByAttribute[device.attribute][device.id] = [];
        }
        this.devicesByAttribute[device.attribute][device.id].push(device);
    }

    releaseDevice(device: GenericDevice): void {
        let re = new RegExp(':' + device.path + '$')
        this.eventEmitter.eventNames().forEach(e => {
            if (re.test(e.toString())) {
                this.eventEmitter.removeAllListeners(e)
            }
        });

        this.devicesByAttribute[device.attribute][device.id].splice(this.devicesByAttribute[device.attribute][device.id].indexOf(device), 1);

        this.devicesByPath[device.path] = null;
        delete this.devicesByPath[device.path];
    }

    updateAttribute(id: ID, attribute: string, value: string, lastUpdateDate: Date = new Date) {
        logger.debug('updateAttribute', id, attribute, value);
        if (this.isAttributeSupported(id, attribute)) {
            let devices = this.devicesByAttribute[attribute][id];
            if (devices) {
                devices.forEach(device => {
                    let oldValue = device.getState();
                    device.state = value;
                    device.stateHasBeenSet = true;
                    device.lastUpdateDate = new Date;
                    logger.debug('emitting change event for', device.path);
                    this.emitEvent('change', device.path, { oldValue: oldValue, newValue: value, date: device.lastUpdateDate });
                });
                return;
            }
        }
        // here the space for discovered devices
        if (this.discoveredDevices && !this.discoveredDevices[id + '_' + attribute]) {
            this.discoveredDevices[id + '_' + attribute] = true;
            logger.info('Discovered device {type=device, source=%s, id=%s, attribute=%s} with value: %s', this.path, id, attribute, value);
        }
    }

    setAttribute(id: ID, attribute: string, value: string, callback: (err: Error) => void): void {
        logger.debug('setAttribute(id="%s", attribute="%s", value="%s")', id, attribute, value);
        this.doSetAttribute(id, attribute, value, err => {
            err || this.updateAttribute(id, attribute, value);
            callback(err);
        })
    }

    isAttributeSupported(id: ID, attribute: string) {
        return this.devicesByAttribute && this.devicesByAttribute[attribute] && this.devicesByAttribute[attribute][id]
    }
    /*
        publishDeviceState(device: GenericDevice, value: string, callback: (err: Error) => void): void {
            let id = device.id;
            let attribute = device.attribute;
    
            if (device.getState() != value) {
                this.updateAttribute(id, attribute, callback);
            }
    
        }
    */
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

    getDeviceParameters(type: string): Parameters {
        logger.debug("Looking for parameters for device type '%s' in", type, Source.supportedDeviceTypes);
        for (var i in Source.supportedDeviceTypes) {
            let element = Source.supportedDeviceTypes[i];

            if (this instanceof element.source && type == element.deviceType) {
                logger.debug("Found", element);
                return element.parameters;
            }
        }
        logger.debug("Nothing found.");
        throw new Error("Source does not support device type '" + type + "'.");
    }

    emitEvent(event: Event, path: string, arg: any) {
        logger.info('Device %s (%s) emitted %s: %s',
            colors.yellow('"' + path + '"'),
            this.devicesByPath[path].name,
            colors.yellow('"' + event + '"'),
            JSON.stringify(arg, function (arg, value) {
                if (arg !== "emitter") {
                    return value;
                }
            }).replace(/"newValue":"([^"]*)"/, '"newValue":' + colors.yellow('"$1"')));
        this.eventEmitter.emit(event + ":" + path, arg);
    }

    on(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: Event, path: string, listener: (msg: message) => void): this;
    on(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            this.eventEmitter.on(event, listener);
            return this;
        }

        var path: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        this.eventEmitter.on(event + ":" + path, listener);
        return this;
    }

    once(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: Event, path: string, listener: (msg: message) => void): this;
    once(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            this.eventEmitter.once(event, listener);
            return this;
        }

        var path: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        this.eventEmitter.once(event + ":" + path, listener);
        return this;
    }

    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: Event, path: string, listener: (msg: message) => void): this;
    removeListener(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            this.eventEmitter.removeListener(event, listener);
            return this;
        }

        var path: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        this.eventEmitter.removeListener(event + ":" + path, listener);
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
    doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
        if (this.isAttributeSupported(id, attribute)) {
            // nothing to do
            return callback(null);
        }
        return callback(new Error('Device "' + id + '" does not support attribute/value "' + attribute + '/' + value + '"'));
    }
}
