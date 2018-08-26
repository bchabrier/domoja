import { Source, DefaultSource } from '../../..';
import { ConfigLoader } from '../../..';
import { InitObject, Parameters } from '../../..';
import { GenericDevice, CustomDeviceType } from '../../..';

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
}

Source.registerDeviceType(DefaultSource, FAKEDEVICETYPE, {
	parameter1: 'REQUIRED',
	parameter2: 'OPTIONAL',
});



