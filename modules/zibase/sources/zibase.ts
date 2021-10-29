import { Source, message, ConfigLoader, InitObject, Parameters, GenericDevice } from 'domoja-core';
import * as assert from 'assert'
import { ZiBase, ZbAction, ZbProtocol, ZbResponse } from 'zibase';

export { ZbAction } from 'zibase';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

/**
 * This source connects to a Zibase device.
 * 
 * Not used anymore as Zodianet company is now dead for years...
 * 
 */
export class Zibase extends Source {
	zibase: ZiBase;
	private initialEmitEvent: (event: string, arg1: any, arg2: any) => void;

	constructor(path: string, ipAddr: string, deviceId: string, token: string, timeout: number, callback?: (err: Error) => void) {
		super(path);
		this.zibase = new ZiBase(ipAddr, deviceId, token, callback);
		this.to = timeout;

		// let's intercept the ZiBase's emitEvent to catch all change events
		this.initialEmitEvent = (this.zibase as any).emitEvent;
		(this.zibase as any).emitEvent = (event: string, arg1: any, arg2: any) => {
			if (arg2) {
				var id = arg1;
				var arg = arg2;
				if (event == 'change') {
					Object.keys(arg).forEach(k => {
						if (k != "emitter") {
							//if (k == 'value') self.setAttribute(id, arg[k]);
							this.updateAttribute(id, (k == 'value') ? 'state' : k, arg[k], new Date);
						}
					});
				}
				this.zibase && this.initialEmitEvent && this.initialEmitEvent.call(this.zibase, event + ":" + id, arg);
				this.zibase || logger.error('self.zibase is null!', event + ":" + id, arg, new Error)
			} else {
				this.zibase && this.initialEmitEvent && this.initialEmitEvent.call(this.zibase, event, arg1);
				this.zibase || logger.error('self.zibase is null!', event, arg1, new Error)
			}
		};

		if (this.to) {
			this.armTimeout();
			this.zibase.on("message", () => {
				this.timeout && clearInterval(this.timeout);
				this.armTimeout();
			});
		}
	}

	private timeout: NodeJS.Timer = undefined;

	private reconnectToZibase() {
		var response = {
			reserved1: "SLAMSIG"
		};
		this.zibase.processZiBaseData(response);
	}

	private to: number; // in seconds
	private armTimeout() {
		this.timeout = setInterval(() => {
			logger.error("No message received after " + this.to + "s, restarting Zibase connection.");
			this.reconnectToZibase();
		}, this.to * 1000);
	}

	private sendCommand(address: string, action: ZbAction, protocol?: ZbProtocol, dimLevel?: number, nbBurst?: number): void {
		return this.zibase.sendCommand(address, action, protocol, dimLevel, nbBurst)
	}
	private getSensorInfo(idSensor: string, callback: (err: Error, value: { date: Date, v1: string, v2: string }) => void): void {
		return this.zibase.getSensorInfo(idSensor, callback);
	}
	private executeRemote(id: string, action: ZbAction): void {
		return this.zibase.executeRemote(id, action);
	}
	private processZiBaseData(response: ZbResponse): void {
		return this.zibase.processZiBaseData(response);
	}
	private getVariable(numVar: number, callback: (err: Error, value: string) => void): void {
		return this.zibase.getVariable(numVar, callback);
	}
	private getState(address: string, callback: (err: Error, value: string) => void): void {
		return this.zibase.getState(address, callback);
	}
	private setEvent(action: ZbAction, address: string): void {
		return this.zibase.setEvent(action, address);
	}
	private runScenario(scenario: number | string): boolean {
		return this.zibase.runScenario(scenario);
	}


	deregisterListener(): void {
		return this.zibase.deregisterListener();
	}


	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		let timeout: number = undefined;
		if (initObject.timeout) {
			timeout = +initObject.timeout;
		}
		if (isNaN(timeout)) {
			logger.warning(`Source "${path}" of type "zibase": timeout "${initObject.timeout}" is not a number.`);
		}
		return new Zibase(path, initObject.ip, initObject.device_id, initObject.token, timeout);
	}

	getParameters(): Parameters {
		return {
			ip: 'REQUIRED',
			device_id: 'REQUIRED',
			timeout: 'OPTIONAL',
			token: 'REQUIRED'
		}
	}

	doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
		if (attribute == 'state') {
			if (value == 'OFF') {
				this.sendCommand(id, ZbAction.OFF);
				return callback(null);
			}
			if (value == 'ON') {
				this.sendCommand(id, ZbAction.ON);
				return callback(null);
			}
		}
		return callback(new Error('Unsupported attribute/value: ' + attribute + '/' + value))
	}

	release(): void {
		this.timeout && clearInterval(this.timeout);
		(this.zibase as any).emitEvent = this.initialEmitEvent;
		(<any>this.zibase).socket && (<any>this.zibase).socket.removeAllListeners();
		this.deregisterListener();
		(<any>this.zibase).removeAllListeners();
		this.zibase = null;
		super.release();
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


