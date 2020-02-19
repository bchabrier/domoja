import { Source, ConfigLoader, GenericDevice, InitObject, Parameters } from '..';

import * as child_process from 'child_process';

export class command extends Source {

	constructor(path: string, public ON: string, public OFF: string) {
		super(path);
	}

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new command(path, initObject.ON, initObject.OFF);
	}
	getParameters(): Parameters {
		return {
			ON: 'REQUIRED',
			OFF: 'REQUIRED',
		};
	}

	doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
		if (attribute == 'state' && value == 'ON') {
			child_process.exec(this.ON, {env: {'ID': id}}, callback);
		} else if (attribute == 'state' && value == 'OFF') {
			child_process.exec(this.OFF, {env: {'ID': id}}, callback);
		} else
			return callback(new Error('Device "' + id + '" does not support attribute/value "' + attribute + '/' + value + '"'));
	}

	static registerDeviceTypes(): void {

		Source.registerDeviceType(this, 'device', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			location: 'OPTIONAL'
		});

		Source.registerDeviceType(this, 'sensor', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			transform: 'OPTIONAL',
			camera: 'OPTIONAL' // added for alarm (should be an array)
		});
	}
}



