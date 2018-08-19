import { Source } from '../../../core/sources/source';
import { ConfigLoader } from '../../../core/lib/load';
import { InitObject, Parameters } from '../../../core/lib/module';
import { GenericDevice } from '../../../core/devices/genericDevice';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class secretSource extends Source {
	secretParameter: string;
	publicParameter: string;

	constructor(path: string, secretParameter: string, publicParameter: string) {
		super(path);
		this.secretParameter = secretParameter
		this.publicParameter = publicParameter
	}

	release(): void { }

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new secretSource(path, initObject["secret-parameter"], initObject["public-parameter"]);
	}

	getParameters(): Parameters {
		return {
			'secret-parameter': 'REQUIRED',
			'public-parameter': 'REQUIRED'
		}
	}

	setAttribute(device: GenericDevice, attribute: string, value: string, callback: (err: Error) => void): void {
		if (attribute == 'state') {
			if (value == 'OFF') {
				//this.sendCommand(device.id, ZbAction.OFF);
				//return callback(null);
			}
			if (value == 'ON') {
				//this.sendCommand(device.id, ZbAction.ON);
				//return callback(null);
			}
		}
		return callback(new Error('Unsupported attribute/value ' + attribute + '/' + value))
	}
}

