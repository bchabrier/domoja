import { GenericDevice, ConfigLoader, InitObject, Parameters } from 'domoja-core';
import { IPX800 } from '../sources/ipx800'
import { OptionsWithUrl, RequestResponse, RequestCallback } from 'request';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});


export class relay extends GenericDevice {
  constructor(ipx800: IPX800, id: string, deviceId: number, name: string, initObject: InitObject) {
    super(ipx800, 'relay', id, deviceId.toString(), "state", name, initObject);
    this.config(0, 0);
  }



  config(delayon: number, delayoff: number, callback?: RequestCallback) {

    var self = this;
    var options: OptionsWithUrl = {
      url: '/protect/settings/output1.htm',
      qs: {
        output: self.id,
        relayname: self.name,
        delayon: delayon,
        delayoff: delayoff
      }
    };

    (<IPX800>this.source).sendHttpRequest(options,
      callback);
  }

  start(callback?: any) {
    var self = this;
    this.config(0, 1800, function (error: Error, response: RequestResponse, body: string) {
      (<IPX800>self.source).sendHttpRequest('/leds.cgi?led=' + (parseInt(self.id) - 1), callback);
    });
  }

  startDelayed(callback?: any) {
    var self = this;
    this.config(300, 1800, function (error: Error, response: RequestResponse, body: string) {
      (<IPX800>self.source).sendHttpRequest('/leds.cgi?led=' + (parseInt(self.id) - 1), callback);
    });
  }

  stop(callback?: any) {
    var self = this;
    this.config(0, 0, function (error: Error, response: RequestResponse, body: string) {
      (<IPX800>self.source).sendHttpRequest('/preset.htm?set' + self.id + '=0', callback);
    });
  }

  createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): GenericDevice {
    return new relay(initObject.source, id, parseInt(initObject.id), initObject.name, initObject);
  }
}
