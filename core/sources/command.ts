import { Source, ConfigLoader, GenericDevice, InitObject, Parameters } from '..';

import * as child_process from 'child_process';
import * as kill from 'tree-kill';

export class command extends Source {

	stateUpdaterProcess: child_process.ChildProcessWithoutNullStreams;

	constructor(path: string, public VALUES: { [value: string]: string }, public pushUpdates: string, debug: boolean) {
		super(path);
		this.debugMode = debug; // need to capture debugMode early to start pushUpdates process correctly
		if (this.pushUpdates) {
			this.stateUpdaterProcess = child_process.exec(this.pushUpdates, { env: { 'DEBUG': this.debugMode ? '1' : '0', SOURCE: this.path } });
			let data = '';
			this.stateUpdaterProcess.stderr.on('data', chunk => { this.logger.warn(`Got stderr from command '${this.path}' push-updates:\n${chunk}`); });
			this.stateUpdaterProcess.stdout.on('data', chunk => {
				data += chunk;
				while (data.indexOf('\n') != -1) {
					let line = data.substring(0, data.indexOf('\n'));
					data = data.substr(data.indexOf('\n') + 1);
					this.debugModeLogger.info(`Line in command '${this.path}': 'push-updates' returned '${line}'.`);

					if (line != '') {
						let json = null;
						let error = null
						try {
							json = JSON.parse(line);
						} catch (e) {
							error = e;
						}
						if (!json || !json.id || !json.attribute || !json.value) {
							this.logger.error(`Error in command '${this.path}': 'push-updates' returned '${line}', which is not a JSON string like: '{"id": "device_id", "attribute": "state", "value": "value"}'${error !== null ? ": " : ""}${error !== null ? error : ""}`);
						} else {
							this.updateAttribute(json.id, json.attribute, json.value);
						}
					}
				}
			});
		}
	}

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new command(path, initObject.VALUES, initObject['push-updates'], initObject['debug'] === 'true');
	}

	getParameters(): Parameters {
		return {
			VALUES: 'AT_LEAST_ONE',
			'push-updates': 'OPTIONAL'
		};
	}

	release(): void {
		if (this.stateUpdaterProcess) {
			//this.stateUpdaterProcess.kill('SIGINT');
			//process.kill(-this.stateUpdaterProcess.pid, 'SIGINT');
			kill(this.stateUpdaterProcess.pid);
			delete this.stateUpdaterProcess;
		}

		super.release();
	}

	doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
		if (attribute == 'state' && this.VALUES[value]) {
			child_process.exec(this.VALUES[value], { env: { 'ID': id, 'DEBUG': this.debugMode ? '1' : '0', SOURCE: this.path } }, (err, stdout, stderr) => {
				stderr != "" && this.logger.warn(`Got stderr from command '${this.path}' ${value}:\n${stderr}`);
				stdout != "" && this.debugModeLogger.warn(`Got stdout from command '${this.path}' ${value}:\n${stdout}`);
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



