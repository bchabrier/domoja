import { Source } from '../sources/source';
var assert = require("assert");
import * as request from 'request';
import * as express from 'express';
import { ConfigLoader } from '../lib/load';
import { DeviceType, GenericDevice } from '../devices/genericDevice';
import { InitObject, Parameters } from '../lib/module';
import { Socket, createConnection } from 'net';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});



export class IPX800 extends Source {

	static ipxTab: IPX800[] = []


	macAddress: string;
	ip: string;
	port: number;
	input: ('0' | '1')[];
	client: Socket;

	constructor(macaddress: string, ip: string, port?: number) {
		super();
		this.macAddress = macaddress;
		this.ip = ip;
		this.port = port || 80;
		IPX800.ipxTab.push(this);
		this.input = [];

		let self = this;
		this.client = new Socket;
		this.client.on('error', (e: Error) => {
			logger.error(e);
		});
		this.client.on('data', (data: Buffer) => {
			logger.trace(data.toString());
			// in the form: 'I=00000100000000000000000000000000&O=00000000000000000000000000000000&A0=0&A1=0&A2=0&A3=0&A4=0&A5=0&A6=0&A7=0&A8=0&A9=0&A10=0&A11=0&A12=0&A13=0&A14=0&A15=0&C1=0&C2=0&C3=0&C4=0&C5=0&C6=0&C7=0&C8=0'

			var re = /I=((0|1)+)&/g;

			var match = re.exec(data.toString());
			//	logger.error(match)
			if (match == undefined) {
				logger.trace('Cannot parse IPX800 message "%s"...', data.toString())
			} else {
				assert(match != undefined);
				var I = match[1];
				self.processInput(I)
			}
		});
		this.client.on('connect', () => {
			logger.info('connected to IPX!');
		});

		this.client.on('close', () => {
			logger.info('disconnected from IPX');
			//self.connect();
			setTimeout(() => {
				self.client.connect(8124);
			}, 5000);
		});
		this.client.connect(8124);
	}

	release(): void {
		this.client.end();
		this.client = null;
		this.removeAllListeners();
		IPX800.ipxTab.splice(IPX800.ipxTab.indexOf(this));
	}

	// fill in current values
	/*
	 var ipx800IP = "192.168.0.17";
	 http_plus.getAndFollow("http://" + ipx800IP + "/status.xml", function(bodyString, statusCode) {

	 var re = new RegExp('<([^>]+)>([^<]*)(</[^>]+>)', "g");

	 var match;
	 if (( match = re.exec(bodyString)) != undefined) {
	 }
	 });
	 */


	sendHttpRequest(urlOrOptions: string | request.UrlOptions, callback: request.RequestCallback) {
		var param: request.UrlOptions;
		if (typeof urlOrOptions === 'string') {
			param = {
				url: 'http://' + this.ip + ':' + this.port + urlOrOptions
			}
		} else {
			param = urlOrOptions;
			param.url = 'http://' + this.ip + ':' + this.port +
				urlOrOptions.url;
		}
		request.get(param, callback /* error, response, body */)
			.on('error', function (err: Error) {
				logger.error('Cannot GET', param.url, ':', err.stack);
			});
	}

	processInput(inputs: String): void {
	for (var ii = 1; ii <= 32; ii++) {
		var input: '0' | '1' = inputs [ii - 1] == '0' ? '0' : '1';
		if (this.input[ii] != input) {
			this.emitEvent("change", "INPUT" + ii, {
				oldValue: this.input[ii],
				newValue: input
			})
			this.input[ii] = input;
			notifyHA(ii, input);
		}
	}
}

createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): Source {
	return new IPX800(initObject.macaddress, initObject.ip, initObject.port);
}

getParameters(): Parameters {
	return {
		ip: 'REQUIRED',
		macaddress: 'REQUIRED',
		update_url: 'REQUIRED'
	}
}

setAttribute(device: GenericDevice, attribute: string, value: string, callback: (err: Error) => void): void {
	if(attribute == 'state') {
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

	static registerDeviceTypes(): void {
	Source.registerDeviceType(this, 'sensor', {
		source: 'REQUIRED',
		id: 'REQUIRED',
		transform: 'OPTIONAL',
		camera: 'OPTIONAL' // added for alarm (should be an array)
	});

	Source.registerDeviceType(this, 'sirene', {
		source: 'REQUIRED',
		id: 'REQUIRED'
	});
}
}
export function processIPX800Data(req: express.Request, res: express.Response) {
	logger.trace("req.query =", req.query)
	var bodyString = req.query.input;

	// in the form: '00:04:A3:2D:68:E6&In=00000000000000000000000000000000&An1=0&An2=0&An3=0&An4=0&C1=4260&C2=1477&C3=2054'

	var re = /([0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F])&In=((0|1)+)/g;

	var match = re.exec(bodyString);
	//	logger.error(match)
	if (match != undefined) {
		assert(match != undefined);
		logger.trace("message coming from IPX800 with macAddress = ", match[1])
		for (var i in IPX800.ipxTab) {
			var ipx = IPX800.ipxTab[i];
			if (match[1] == ipx.macAddress) {
				logger.trace("Found IPX800 with specified macAddress")
				var In = match[2];
				logger.trace("In =", In)
				ipx.processInput(In);
			}
		}
	}

	res.send('Done');
};

function notifyHA(i: number, input: '0' | '1') {
	var request = require('request');

	request.post(
		{
			url: 'http://localhost:8123/api/states/binary_sensor.ipx800_INPUT' + i,
			headers: {
				'x-ha-access': 'thepass1',
			},
			json: true,
			body: {
				'state': input == '1' ? 'on' : 'off'
			}
		}, function (error: Error, response: express.Response, body: string) {
			if (error) console.log(error);
			//console.log(body);
		});
}
