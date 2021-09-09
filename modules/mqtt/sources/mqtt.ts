import { Source, message, ConfigLoader, InitObject, Parameters, GenericDevice } from 'domoja-core';
import * as mqtt from 'mqtt';
const match = require('mqtt-match');


export class Mqtt extends Source {
    client: mqtt.MqttClient;
    topics: string[] = [];
    pushedDos: Function[] = [];
    creatingClient = false;

    constructor(path: string, private url: string, private user: string, private password: string) {
        super(path);
    }

    createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
        return new Mqtt(path, initObject.url, initObject.user, initObject.password);
    }

    private connectAndDo(f: () => void): void {
        if (!this.client) {
            this.creatingClient = true;
            this.client = mqtt.connect(this.url, {
                username: this.user,
                password: this.password,
                reconnectPeriod: 15000
            });
            this.client.on('connect', (ack) => {
                this.creatingClient = false;
                if (ack && (<any>ack).returnCode == 0) {
                    this.debugModeLogger.info(`Successfully connected mqtt source '${this.path}' to mqtt server '${this.url}':`, ack);
                } else {
                    this.logger.error(`Could not connect mqtt source '${this.path}' to mqtt server '${this.url}':`, ack);
                }
                f();    
                this.pushedDos.forEach(f => f());
                this.pushedDos = [];
            });
            this.client.on('error', (err) => {
                this.logger.error(err);
            });
            this.client.on('close', () => {
                this.logger.error('close!!!!');
            });
            this.client.on('disconnect', () => {
                this.logger.error('disconnect!!!');
            });
            this.client.on('message', (topic, message) => {
                this.debugModeLogger.info(`received message '${message.toLocaleString()}'.`);
                this.updateAttribute(topic, 'state', message.toLocaleString());
            });
        } else {
            if (this.creatingClient) {
                this.pushedDos.push(f);
            } else {
                f();
            }
        }
    }

    addDevice(device: GenericDevice): void {
        //device.id = device.topic; // so that we can use topic instead of id
        super.addDevice(device);
        device.topic = device.id; // as a workaround until non 'id' is supported
        this.connectAndDo(() => {
            console.log('addDevice, subscribing');
            this.client.subscribe(device.topic, err => {
                if (err) this.logger.error(`mqtt source '${this.path}' could not subscribe to topic '${device.topic}' for device '${device.path}':`, err)
            });
            this.topics.push(device.topic);
        });
    }

    releaseDevice(device: GenericDevice): void {
        this.connectAndDo(() => {
            this.client.unsubscribe(device.topic, (err: Error) => {
                if (err) this.logger.error(`mqtt source '${this.path}' could not unsubscribe from topic '${device.topic}' for device '${device.path}':`, err);
            });
            this.topics.splice(this.topics.indexOf(device.topic), 1);
        });
        super.releaseDevice(device);
    }


    getParameters(): Parameters {
        return {
            url: 'REQUIRED',
            user: 'REQUIRED',
            password: 'REQUIRED',
            secure: 'OPTIONAL'
        }
    }

    doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
        if (attribute == 'state') {
            if (value == 'OFF') {
                // do the right stuff
                return callback(null);
            }
            if (value == 'ON') {
                // do the right stuff
                return callback(null);
            }
        }
        return callback(new Error('Unsupported attribute/value: ' + attribute + '/' + value))
    }

    release(): void {
        console.log('ending mqtt client')
        this.client && this.client.end();
        super.release();
    }

    static registerDeviceTypes(): void {
        Source.registerDeviceType(this, 'sensor', {
            source: 'REQUIRED',
            id: 'REQUIRED',
            transform: 'OPTIONAL',
        });
    }
}


