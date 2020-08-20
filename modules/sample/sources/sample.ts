import { Source, message, ConfigLoader, InitObject, Parameters, GenericDevice } from 'domoja-core';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class Sample extends Source {
	
	constructor(path: string, ipAddr: string, deviceId: string, token: string, callback?: (err: Error) => void) {
		super(path);
		callback && callback(null);
	}

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new Sample(path, initObject.ip, initObject.device_id, initObject.token);
	}

	getParameters(): Parameters {
		return {
			ip: 'REQUIRED',
			device_id: 'REQUIRED',
			token: 'REQUIRED'
		}
	}

	doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
		if (attribute == 'state') {
			if (value == 'OFF') {
				// do the right stuff
				return callback(null);
			}
			if (value == 'ON') {
				// do the right stuff
				return callback(null);
			}
		}
		return callback(new Error('Unsupported attribute/value: ' + attribute + '/' + value))
	}

	release(): void {
		//
		super.release();
	}

	static registerDeviceTypes(): void {
		Source.registerDeviceType(this, 'device', {
			source: 'REQUIRED',
			id: 'REQUIRED',
		});

		Source.registerDeviceType(this, 'sensor', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			transform: 'OPTIONAL',
		});
	}
}


