import { Source, message, ConfigLoader, InitObject, Parameters, GenericDevice } from 'domoja-core';
var mpg321 = require('mpg321');
import * as async from 'async';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class VoiceByGoogle extends Source {

	constructor(path: string, private language: string, private volume: number = 100, initObject: InitObject) {
		super(path, initObject);
	}

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new VoiceByGoogle(path, initObject.language, initObject.volume, initObject);
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
			return;
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
		const MAX = 200; // max message length supported by Google translate

		// Note: we do not use the multi file capability of mpg321 because it does a
		// segmentation fault after the first URL played. Hence we call mpg321 multiple times

		let end = msg.length;
		let spcl = 0;
		// look for last punctuation
		if (msg.length > MAX) {
			end = msg.substr(0, MAX).lastIndexOf('. ');
			spcl = 2;
		}
		// if none, look for last blank
		if (end < 0) {
			end = msg.substr(0, MAX).lastIndexOf(' ');
			spcl = 1;
		}

		let encodedMsg = encodeURIComponent(msg.substr(0, end + spcl));

		mpg321().outputdevice('alsa').audiodevice('hw:1,0')
			.file('http://translate.google.com/translate_tts?tl=' +
				this.language +
				'&ie=utf-8&client=tw-ob&q=' + encodedMsg).stereo().gain(this.volume).exec((err: Error) => {
					// skip known harmess error
					if (err && !err.message.match(/tcgetattr\(\): Inappropriate ioctl for device/)) {
						return callback(err);
					}
					if (end + spcl == msg.length) return callback(null)

					this.SayNow(msg.substr(end + spcl), callback);
				});

	}

	private sayQueue = async.queue((task: { message: string }, callback: (err: Error) => void) => {
		logger.info(task.message);
		this.SayNow(task.message, callback);
	}, 1);

	say(msg: string, callback?: (err: Error) => void) {
		this.sayQueue.push({
			message: msg
		}, err => {
			callback(err);
		});
	};
}


