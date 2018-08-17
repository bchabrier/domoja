import { Source, DEFAULT_SOURCE, DefaultSource } from '../../..';
import { ConfigLoader } from '../../..';
import { InitObject, Parameters } from '../../..';
import { GenericDevice } from '../../..';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class fakeDevice extends GenericDevice {

    constructor(instanceFullname: string, name: string, parameter1: string, parameter2: string) {
        super(DEFAULT_SOURCE, 'fakeDevice', instanceFullname, instanceFullname, name, {})
	}
	createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): GenericDevice {
		return new fakeDevice(instanceFullname, initObject.name, initObject.parameter1, initObject.parameter2);
	}
}

Source.registerDeviceType(DefaultSource, 'fakeDevice', {
	parameter1: 'REQUIRED',
	parameter2: 'OPTIONAL',
});



