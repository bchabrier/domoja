import { Source, message, ConfigLoader, InitObject, Parameters, GenericDevice } from 'domoja-core';
var mpg321 = require('mpg321');
import * as async from 'async';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class VoiceByGoogle extends Source {

	constructor(path: string, private language: string, private volume: number = 100) {
		super(path);
	}

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new VoiceByGoogle(path, initObject.language, initObject.volume);
	}

	getParameters(): Parameters {
		return {
			language: 'REQUIRED',
			volume: 'OPTIONAL'
		}
	}

	doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
		if (attribute == 'state') {
			this.say(value, callback);
			return ;
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
		});
	}

	private SayNow(msg: string, callback: (err: Error) => void) {
		var encodedMsg = encodeURIComponent(msg);
		mpg321().outputdevice('alsa').audiodevice('hw:0,0')
			.file('http://translate.google.com/translate_tts?tl=' +
				this.language +
				'&ie=utf-8&client=tw-ob&q=' +
				encodedMsg).stereo().gain(this.volume).exec(callback);
		logger.info(msg);
	};

	private sayQueue = async.queue( (task: { message: string }, callback: (err: Error) => void) => {
		this.SayNow(task.message, callback);
	}, 1);
	
	say(msg: string, callback?: (err: Error) => void) {
		this.sayQueue.push({
			message: msg
		}, callback);
	};
	
}


