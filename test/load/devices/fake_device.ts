import { Source, DefaultSource } from '../../../core';
import { ConfigLoader } from '../../../core';
import { InitObject, Parameters } from '../../../core';
import { GenericDevice, CustomDeviceType } from '../../../core';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

var FAKEDEVICETYPE = new CustomDeviceType('fakeDevice');

export class fakeDevice extends GenericDevice {

	constructor(source: DefaultSource, instanceFullname: string, name: string, parameter1: string, parameter2: string) {
		super(source, FAKEDEVICETYPE, instanceFullname, 'id', 'attribute', name, {});
	}
	createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): GenericDevice {
		return new fakeDevice(configLoader.DEFAULT_SOURCE, instanceFullname, initObject.name, initObject.parameter1, initObject.parameter2);
	}

	setState(newState: string | Date, callback: (err: Error) => void): void {
		if (newState instanceof Date) return this.setState(newState.toString(), callback);

		logger.debug('setState of device "%s" to "%s"', this.path, newState);

		if (newState == 'ERROR')
			callback(new Error('ERROR value received'));
		else
			this.source.setAttribute(this.id, this.attribute, newState, callback);
	}

}

Source.registerDeviceType(DefaultSource, FAKEDEVICETYPE, {
	parameter1: 'REQUIRED',
	parameter2: 'OPTIONAL',
});



