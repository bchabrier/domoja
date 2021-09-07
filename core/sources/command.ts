import { Source, ConfigLoader, GenericDevice, InitObject, Parameters } from '..';

import * as child_process from 'child_process';
import * as kill from 'tree-kill';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class command extends Source {

	stateUpdaterProcess: { [devicePath: string]: child_process.ChildProcessWithoutNullStreams } = {};

	constructor(path: string, public VALUES: { [value: string]: string }, public pushUpdates: string) {
		super(path);
	}

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new command(path, initObject.VALUES, initObject['push-updates']);
	}
	getParameters(): Parameters {
		return {
			VALUES: 'AT_LEAST_ONE',
			'push-updates': 'OPTIONAL'
		};
	}

	addDevice(device: GenericDevice): void {
		super.addDevice(device);
		if (this.pushUpdates) {
			this.stateUpdaterProcess[device.path] = child_process.exec(this.pushUpdates, { env: { 'ID': device.id, 'DEBUG': this.debugMode?'1':'0' } });
			let data = '';
			this.stateUpdaterProcess[device.path].stderr.on('data', chunk => { logger.warn(`Got stderr from command '${this.path}' push-updates:\n${chunk}`); });
			this.stateUpdaterProcess[device.path].stdout.on('data', chunk => {
				data += chunk;
				while (data.indexOf('\n') != -1) {
					let line = data.substring(0, data.indexOf('\n'));
					data = data.substr(data.indexOf('\n') + 1);
					logger.error(`Line in command '${this.path}': 'push-updates' returned '${line}'.`);

					if (line != '') {
						let sep = line.indexOf(':');
						if (sep == -1) {
							logger.error(`Error in command '${this.path}': 'push-updates' returned '${line}', which is not like: 'attribute:value'.`);
						} else {
							let attribute = line.substring(0, sep);
							let value = line.substr(sep + 1);
							this.updateAttribute(device.id, attribute, value);
						}
					}
				}
			});
		}
	}

	releaseDevice(device: GenericDevice): void {
		if (this.stateUpdaterProcess[device.path]) {
			//this.stateUpdaterProcess[device.path].kill('SIGINT');
			//process.kill(-this.stateUpdaterProcess[device.path].pid, 'SIGINT');
			kill(this.stateUpdaterProcess[device.path].pid);
			delete this.stateUpdaterProcess[device.path];
		}
		super.releaseDevice(device);
	}

	doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
		if (attribute == 'state' && this.VALUES[value]) {
			child_process.exec(this.VALUES[value], { env: { 'ID': id } }, (err, stdout, stderr) => {
				stderr != "" && logger.warn(`Got stderr from command '${this.path}' ${value}:\n${stderr}`);
				stdout != "" && logger.warn(`Got stdout from command '${this.path}' ${value}:\n${stdout}`);
				callback(err);
			});
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



