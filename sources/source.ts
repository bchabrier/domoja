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

export class message {
    emitter: GenericDevice;
    id: ID;
    oldValue: string;
    newValue: string;
    state?: string;
    dev?: string;
    tem?: string;
}

export abstract class Source extends events.EventEmitter implements DomoModule {
    //id: id;

    abstract createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): Source;
    abstract getParameters(): Parameters;
    abstract setAttribute(device: GenericDevice, attribute: string, value: string, callback: (err: Error) => void): void;
    abstract release(): void;

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
        throw new Error("Source does not support type '" + type + "'.");
    }

    emitEvent(event: string, id: string, arg: any) {
        super.emit(event + ":" + id, arg);
        logger.info(event, id, JSON.stringify(arg, function(arg, value) {
            if (arg !== "emitter")
                return value;
        }));
    }

    on(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string, id: string, listener: (msg: message) => void): this;
    on(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            return super.on(event, listener);
        }

        var id: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        return super.on(event + ":" + id, listener);
    }

    once(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string, id: string, listener: (msg: message) => void): this;
    once(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            return super.once(event, listener);
        }

        var id: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        return super.once(event + ":" + id, listener);
    }

    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string, id: string, listener: (msg: message) => void): this;
    removeListener(event: any, ...arg2: any[]): this {
        if (arguments.length == 2) {
            var listener: (...args: any[]) => void = arguments[1];
            return super.removeListener(event, listener);
        }

        var id: string = arguments[1];
        var listener: (...args: any[]) => void = arguments[2];
        return super.removeListener(event + ":" + id, listener);
    }
}

export class DefaultSource extends Source {
    createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): Source {
        return new DefaultSource;
    }
    getParameters(): Parameters {
        return {};
    }
    setAttribute(device: GenericDevice, attribute: string, value: string, callback: (err: Error) => void): void {
        return callback(new Error('Unsupported attribute/value ' + attribute + '/' + value))
    }
    release(): void {
        this.removeAllListeners();
    }
}

export const DEFAULT_SOURCE = new DefaultSource;