import { Errors, Path, PreProcessor, GET, POST, PathParam, FormParam, QueryParam, ContextResponse, Return } from 'typescript-rest';
import * as express from 'express';
import * as net from 'net';
import * as http from 'http';

import { GenericDevice } from 'domoja-core';
import * as core from 'domoja-core';
import { getDomojaServer } from './app';

function deviceIdValidator(req: express.Request): express.Request {

  let deviceID = req.params['id'];

  var devices = core.getDevices();

  if (!devices) {
    throw new Errors.InternalServerError('no devices');
  }

  if (!devices.find(device => device.path == deviceID)) {
    throw new Errors.BadRequestError(`device ${deviceID} not found`);
  }

  return req;
}

function deviceAsJSON(device: GenericDevice) {
  return {
    id: device.id,
    path: device.path,
    state: device.transform ? device.transform(device.getState()) : device.getState(),
    lastUpdateDate: device.lastUpdateDate,
    name: device.name,
    type: device.type,
    source: device.source.path,
    widget: device.widget,
    tags: device.tags
  }
}

@Path('/devices')
export class DevicesService {
  /**
   * Retrieves the list of devices
   */
  @GET
  getDevices() {
    var devices = core.getDevices();
    return Object.keys(core.getDevices()).map((index: any) => {
      return deviceAsJSON(devices[index])
    });
  }

  /**
   * Retrieves a device
   * @param name path of the device
   */
  @Path(':id')
  @GET
  @PreProcessor(deviceIdValidator)
  get(@PathParam('id') name: string) {
    let device = core.getDevices().find(device => device.path == name);
    return deviceAsJSON(device);
  }

  /**
   * Sends a command to a device
   * @param name path of the device
   * @param command command sent to the device
   */
  @Path(':id')
  @POST
  @PreProcessor(deviceIdValidator)
  sendCommand(@PathParam('id') name: string, @FormParam('command') command: string) {
    let device = core.getDevices().find(device => device.path == name);
    return new Promise<string>((resolve, reject) => {
      device.setState(command, err => { err ? reject(err) : resolve('OK') })
    });
  }

  private doGet(method: core.camera['getSnapshot'] | core.camera['getStream'], device: GenericDevice, res: express.Response, req: express.Request) {
    let camera = device as core.camera;
    if (!method) return "Not a camera!";

    let addrInfo = getDomojaServer().server.address() as net.AddressInfo;

    let baseURL = 'http';
    let port = 80;
    if (addrInfo.port) {
      if (addrInfo.port == 443) {
        baseURL += 's';
        port = 443;
      }
    }
    baseURL += '://' + res.req.headers.host + ':' + port;

    return new Promise<{}>((resolve, reject) => {
      method.apply(camera, [baseURL, res.req.headers, function onResponse(response: http.IncomingMessage) {
        if (res.req.query && res.req.query.t) {
          // if ?t=, then we cache the query
          res.setHeader("Cache-Control", "private, max-age=999999"); // max-age is needed for Safari
        }
        response.pipe(res);
        response.on('end', () => resolve(Return.NoResponse));
        response.on('aborted', () => reject(Return.NoResponse));
      }]);
    });
  }

  /**
   * Get a snapshot from a camera device
   * @param name path of the device
   * Cached if ?t=NNNN is append
   */
  @Path(':id/snapshot')
  @GET
  @PreProcessor(deviceIdValidator)
  getSnapshot(@PathParam('id') name: string, @ContextResponse res: express.Response, @ContextResponse req: express.Request) {
    let device = core.getDevices().find(device => device.path == name);
    let camera = device as core.camera;
    return this.doGet(camera.getSnapshot, device, res, req);
  }

  /**
   * Get a stream from a camera device
   * @param name path of the device
   * Cached if ?t=NNNN is append
   */
  @Path(':id/stream')
  @GET
  @PreProcessor(deviceIdValidator)
  getStream(@PathParam('id') name: string, @ContextResponse res: express.Response, @ContextResponse req: express.Request) {
    let device = core.getDevices().find(device => device.path == name);
    let camera = device as core.camera;
    return this.doGet(camera.getStream, device, res, req);
  }

  /**
   * Get the history of a device
   * @param name path of the device
   * @param aggregate type of aggregation: none|minute|hour|day|week|month|year
   * @param from from date, in YYYY-MM-DD or JSON formats, included
   * @param to from date, in YYYY-MM-DD or JSON formats, included
   */
  @Path(':id/history')
  @GET
  @PreProcessor(deviceIdValidator)
  getHistory(@PathParam('id') name: string, @QueryParam('aggregate') aggregate: "none" | "minute" | "hour" | "day" | "month" | "year", @QueryParam('from') from: string, @QueryParam('to') to: string) {
    let device = core.getDevices().find(device => device.path == name);
    return new Promise<{}>((resolve, reject) => {
      let fromDate: Date;
      let toDate: Date;
      if (!from) {
        fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0, 0);
      } else if (from.match(/^\d\d\d\d-\d\d-\d\d$/)) {
        fromDate = new Date(parseInt(from.substr(0, 4)), parseInt(from.substr(5, 2)), parseInt(from.substr(8, 2)), 0, 0, 0, 0);
      } else {
        fromDate = new Date(from);
      }
      if (!to) {
        toDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 23, 59, 59, 999);
      } else if (to.match(/^\d\d\d\d-\d\d-\d\d$/)) {
        toDate = new Date(parseInt(to.substr(0, 4)), parseInt(to.substr(5, 2)), parseInt(to.substr(8, 2)), 23, 59, 59, 999);
      } else {
        toDate = new Date(to);
      }
      device.persistence.getHistory(aggregate, fromDate, toDate, (err, results) => {
        if (err) {
          console.log(err);
          reject("KO");
        } else {
          resolve(results);
        }
      });
    });
  }

}

