import { Source, message } from '../sources/source';
import * as assert from 'assert'
import { ZiBase, ZbAction, ZbProtocol, ZbResponse } from 'zibase';
import { ConfigLoader } from '../lib/load';
import { InitObject, Parameters } from '../lib/module';
import { GenericDevice } from '../devices/genericDevice';

export { ZbAction } from 'zibase';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

function messageHandler(handler: Function) {
	return function _handleMessage (msg: {[x in string]?: any}) {
		var newMsg = new message;
		var anyNewMsg = newMsg as {[x in string]: any};
		
		for (var p in msg) {
			switch (p) {
				case 'value':
					newMsg.newValue = msg[p];
					break;
				default:
					anyNewMsg[p] = msg[p];
			}
		}
		return handler(newMsg)
	}
}

export class Zibase extends Source {
	zibase: ZiBase;
	constructor(ipAddr: string, deviceId: string, token: string, callback?: (err: Error) => void) {
		super();
		this.zibase = new ZiBase(ipAddr, deviceId, token, callback);
	}

	on(event: string | symbol, listener: Function): this;
	on(event: string, id: string, listener: (msg: message) => void): this;
	on(event: any, ...arg2: any[]): this {
		if (arguments.length == 2) {
			var listener: Function = arguments[1];
			this.zibase.on(event, messageHandler(listener));
			return this;
		}

		var id: string = arguments[1];
		var listener: Function = arguments[2];
		this.zibase.on(event, id, messageHandler(listener));
		return this;
	}

	once(event: string | symbol, listener: Function): this;
	once(event: string, id: string, listener: (msg: message) => void): this;
	once(event: any, ...arg2: any[]): this {
		if (arguments.length == 2) {
			var listener: Function = arguments[1];
			this.zibase.once(event, messageHandler(listener));
			return this
		}

		var id: string = arguments[1];
		var listener: Function = arguments[2];
		this.zibase.once(event, id, messageHandler(listener));
		return this;
	}
	sendCommand(address: string, action: ZbAction, protocol?: ZbProtocol, dimLevel?: number, nbBurst?: number): void {
		return this.zibase.sendCommand(address, action, protocol, dimLevel, nbBurst)
	}
	getSensorInfo(idSensor: string, callback: (err: Error, value: { date: Date, v1: string, v2: string }) => void): void {
		return this.zibase.getSensorInfo(idSensor, callback);
	}
	executeRemote(id: string, action: ZbAction): void {
		return this.zibase.executeRemote(id, action);
	}
	processZiBaseData(response: ZbResponse): void {
		return this.zibase.processZiBaseData(response);
	}
	getVariable(numVar: number, callback: (err: Error, value: string) => void): void {
		return this.zibase.getVariable(numVar, callback);
	}
	getState(address: string, callback: (err: Error, value: string) => void): void {
		return this.zibase.getState(address, callback);
	}
	setEvent(action: ZbAction, address: string): void {
		return this.zibase.setEvent(action, address);
	}
	runScenario(scenario: number | string): boolean {
		return this.zibase.runScenario(scenario);
	}


	deregisterListener(): void {
		return this.zibase.deregisterListener();
	}


	createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): Source {
		return new Zibase(initObject.ip, initObject.device_id, initObject.token);
	}

	getParameters(): Parameters {
		return {
			ip: 'REQUIRED',
			device_id: 'REQUIRED',
			token: 'REQUIRED'
		}
	}

	setAttribute(device: GenericDevice, attribute: string, value: string, callback: (err: Error) => void): void {
		if (attribute == 'state') {
			if (value == 'OFF') {
				this.sendCommand(device.id, ZbAction.OFF);
				return callback(null);
			}
			if (value == 'ON') {
				this.sendCommand(device.id, ZbAction.ON);
				return callback(null);
			}
		}
		return callback(new Error('Unsupported attribute/value ' + attribute + '/' + value))
	}

	release(): void {
		this.deregisterListener();
		(<any>this.zibase).removeAllListeners();
		this.zibase = null;
		this.removeAllListeners();
	}

	static registerDeviceTypes(): void {
		Source.registerDeviceType(this, 'device', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			camera: 'OPTIONAL' // added for alarm (should be an array)      
		});

		Source.registerDeviceType(this, 'sensor', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			transform: 'OPTIONAL',
			camera: 'OPTIONAL' // added for alarm (should be an array)
		});
	}
}


