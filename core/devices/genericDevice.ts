import * as assert from 'assert';
import { Source, ID, message, Event } from '../..'
import { camera } from './camera'
import { InitObject, Parameters, DomoModule } from '../..';
import { ConfigLoader, getSource } from '../..';
import * as events from 'events';
import * as persistence from '../persistence/persistence';

//import secrets = require("../secrets");
//const PushBullet = require('pushbullet');
import fs = require('fs');
//import sound = require('../lib/sound');

const logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export type DeviceOptions = {
    transform?: (cb: any, transform?: any) => any,
    camera?: camera,
    others?: { [K in string]: any }
}

export class CustomDeviceType {
    name: string;
    constructor(name: string) { this.name = name}
    toString(): string { return this.name}
}

export type DeviceType = 'device' | 'sensor' | 'variable' | 'camera' | 'relay' | CustomDeviceType;

//export var pusher = new PushBullet(secrets.getPushBulletPassword());

//enum NotifyEnum { NEVER, ALWAYS, IN_ALARM };
//pusher.notifyEnum = NotifyEnum;

function transformFunction(callback: any, transform?: (value: string) => string) {
    if (transform != undefined) {
        return function (msg: message) {
            var newMsg = new message;

            for (var a in msg) {
                switch (a) {
                    case 'newValue':
                    case 'oldValue':
                        newMsg[a] = transform(msg[a]);
                        break;
                    default:
                        (<any>newMsg)[a] = (<any>msg)[a];
                }
            }
            callback(newMsg);
        }
    } else {
        return callback;
    }
}

export abstract class GenericDevice implements DomoModule {
    [x: string]: any;
    name: string;
    path: string;
    id: ID;
    attribute: string;
    source: Source;
    type: DeviceType;
    state: string;
    persistence: persistence.persistence;

    constructor(source: Source, type: DeviceType, instancePath: string, id: ID, attribute: string, name: string, options?: DeviceOptions) {
        this.source = source;

        this.persistence = new persistence.persistence();

        this.id = id;
        this.path = instancePath;
        this.attribute = attribute || 'state';
        this.name = name;
        this.type = type;

        if (options !== undefined) {
            for (var option in options) {
                switch (option) {
                    case 'transform':
                        this.transform = options[option];
                        break;
                    case 'camera':
                        this.camera = options[option];
                        break;
                    case 'others':
                        for (var member in options[option]) {
                            this[member] = options[option][member]
                        }
                        break;
                    default:
                        logger.error('Unsupported option \'' + option + '\' while creating device \'' + name + '\'.');
                }
            }
        }

        this.source.addDevice(this);




        var self = this;

        if (id && id[0] == "Z") {
            // it is a ZWave device
            // we blink the lamp in case of error
            /*
            self.on("XXXerror", function() {
                sound.say('Attention, le device "' + name + '" est en erreur.');
                //show_ZW_device_error();
                self.once("change", function(msg: message) {
                    logger.error(msg)
                    logger.error(self)
                    logger.error(msg.id, self.id)
                    if (msg.id == self.id) {
                        //clear_ZW_device_error();
                    }
                });
            });
            */
        }
    }

    abstract createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): DomoModule;

    release(): void {
        if (this.source) {
            this.source.releaseDevice(this);
        }
        this.persistence = null;
    }

    setState(newState: string, callback: (err: Error) => void): void {
        if (newState != this.state) {
            this.source.setAttribute(this, this.attribute, newState, err => {
                if (err) logger.error('error', err);
                this.source.setDeviceState(this.id, newState);
                callback(err);
            });
        } else callback(null);
    }

    getState() {
        return this.state;
    }

    /*
    notify(when: string, msg: string) {
        var self = this;

        function doNotify(msg: string) {
            if (self.camera !== undefined) {
                self.camera.getSnapshot(function(err: Error, data: Buffer) {
                    if (err) {
                        logger.error(err);
                    } else {
                        fs.open('/tmp/snapshot.jpg', 'w', function(err, fd) {
                            fs.write(fd, data, 0, data.length, function(err, written, buffer) {
                                if (err) {
                                    logger.error(err);
                                } else {
                                    fs.close(fd, function(err) {
                                        pusher.file('', '/tmp/snapshot.jpg', msg,
                                            function(error: Error, response: any) {
                                                if (error)
                                                    logger.error(error);
                                            });
                                    });
                                }
                            });
                        });
                    }
                });
            } else {
                pusher.note('', msg, "", function(error: Error, response: any) {
                    if (error)
                        logger.error(error);
                });
            }
        }

        logger.warn(msg);
        switch (when) {
            case pusher.notifyEnum.ALWAYS:
                doNotify(msg);
                break;
            case pusher.notifyEnum.IN_ALARM:
                // TODO: use alarmStatus
                var zibase = <any>getSource('myZibase'); // should probably not have this dependency
                zibase.getVariable(18, function(err: Error, val: string) {
                    if (err) {
                        logger.error("Cannot get value of V18.");
                    } else {
                        logger.info("First value:", val);
                        if (val != "0") {
                            // ask a second time (I noticed that sometimes.
                            // the alarm rings while not in alarm mode !!?!?
                            zibase.getVariable(18, function(err: Error, val: string) {
                                if (err) {
                                    logger.error("Cannot get value of V18.");
                                } else {
                                    logger.info("Second value:", val);
                                    if (val != "0") {
                                        var alarmMgr = require('../managers/alarmMgr');
                                        alarmMgr.newAlert();
                                        doNotify(msg);
                                    }
                                }
                            });
                        }
                    }
                });
                break;
            case pusher.notifyEnum.NEVER:
                break;
            default:
                logger.error("Unsupported value '" + JSON.stringify(when) + "'. Possible values are in " + JSON.stringify(pusher.notifyEnum), (new Error).stack);
        }
    }
    */

    private eventListener(callback: (msg: message) => void): (msg: message) => void {
        let self = this;

        return function (msg: message) {
            msg.emitter = self;
            transformFunction(callback, self.transform)(msg);
        }
    }

    on(event: Event, callback: (msg: message) => void) {
        var self = this;
        this.source.on(event, this.path, this.eventListener(callback));
        return this;
    }

    once(event: Event, callback: (msg: message) => void) {
        var self = this;
        this.source.once(event, this.path, this.eventListener(callback));
        return this;
    };

    removeListener(event: Event, callback: (msg: message) => void): this {
        this.source.removeListener(event, this.path, this.eventListener(callback))
        return this;
    }
}

