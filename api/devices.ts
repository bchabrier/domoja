import { Errors, Path, PreProcessor, GET, POST, PathParam, FormParam, QueryParam, ContextResponse, Return } from 'typescript-rest';
import * as express from 'express';
import * as net from 'net';
import * as http from 'http';
import * as zlib from 'zlib';

import { GenericDevice } from 'domoja-core';
import * as core from 'domoja-core';
import { getDomojaServer } from './app';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

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
    state: device.getState(),
    lastUpdateDate: device.lastUpdateDate,
    name: device.name,
    type: device.type,
    source: device.source.path,
    widget: device.widget,
    tags: device.tags
  }
}

const callsCache: Map<string, {
  reqs: {
    res: express.Response,
    resolve: (value: {} | PromiseLike<{}>) => void,
    reject: (reason?: any) => void,
  }[],
  bytesRead: Buffer
}> = new Map();

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
    let port = undefined;
    if (addrInfo.port) {
      if (addrInfo.port == 443) {
        baseURL += 's';
      }
      port = addrInfo.port;
    }
    baseURL += '://' + res.req.headers.host.split(':')[0];
    if (port != undefined) baseURL += ':' + port;

    return new Promise<{}>((resolve, reject) => {

      // check if a request is already ongoing for this URL
      let firstCall = false;
      let identifier = camera.path + ' ' + (method === camera['getSnapshot'] ? 'getSnaphot' : 'getStream');
      if (!callsCache.get(identifier)) {
        logger.debug(`First call to "${identifier}"!`)
        firstCall = true;
        callsCache.set(identifier, {
          reqs: [],
          bytesRead: Buffer.of(),
        });
      } else {
        logger.debug(`Additional call to "${identifier}", using cache!`)
      }
      const cachedRequest = callsCache.get(identifier);
      // keep track of res, resolve and reject of the request
      cachedRequest.reqs.push({ res, resolve, reject });
      logger.debug(`Cache of "${identifier}" now contains ${cachedRequest.reqs.length} calls`)
      // set the header of the response
      res.setHeader('content-encoding', 'gzip');
      if (res.req.query && res.req.query.t) {
        // if ?t=, then we cache the query
        res.setHeader("Cache-Control", "private, max-age=999999"); // max-age is needed for Safari
      }
      // send any byte that was already received so far
      if (cachedRequest.bytesRead.length > 0) {
        logger.debug(`Call to "${identifier}": writing ${cachedRequest.bytesRead.length} bytes already read`)
        res.write(cachedRequest.bytesRead);
      }

      if (!firstCall) {
        logger.debug(`Call to "${identifier}": waiting for first call to return`)
        return;
      }

      logger.debug(`Call to "${identifier}": doing the real request...`)
      method.apply(camera, [baseURL, res.req.headers, function onResponse(response: http.IncomingMessage) {
        if (!response) return reject();

        //response.pipe(zlib.createGzip()).pipe(ws)

        response.pipe(zlib.createGzip())
          .on("data", (data: Buffer) => {
            logger.debug(`Call to "${identifier}": got data, writing to ${cachedRequest.reqs.length} calls`);
            cachedRequest.reqs.forEach(r => r.res.write(data));
            // keeping data for subsequent requests
            //cachedRequest.bytesRead = Buffer.from([...cachedRequest.bytesRead, ...data]);
            cachedRequest.bytesRead = Buffer.concat([cachedRequest.bytesRead, data]);
          })
          .on("end", () => {
            logger.debug(`Call to "${identifier}": got end, ending ${cachedRequest.reqs.length} calls`);
            cachedRequest.reqs.forEach(r => {
              r.res.statusCode = response.statusCode;
              r.res.end();
            });
            logger.debug(`Call to "${identifier}": deleting the cache`);
            callsCache.delete(identifier);
            //res.statusCode = response.statusCode;
          })

          //.pipe(res)
          .on('finish', () => {
            logger.debug(`Call to "${identifier}": got finish, resolving for ${cachedRequest.reqs.length} calls`);
            cachedRequest.reqs.forEach(r => r.resolve(Return.NoResponse));
          })
          .on('aborted', () => {
            logger.error(`Call to "${identifier}": got aborted, rejecting for ${cachedRequest.reqs.length} calls`);
            cachedRequest.reqs.forEach(r => r.reject("Aborted"));
            callsCache.delete(identifier);
          })
          .on('error', (err) => {
            logger.error(`Call to "${identifier}": got error, rejecting for ${cachedRequest.reqs.length} calls`);
            cachedRequest.reqs.forEach(r => r.reject(err));
            callsCache.delete(identifier);
          });
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
   * @param dataSet type of aggregation: none|minute|hour|day|week|month|year
   * @param from from date, in YYYY-MM-DD or JSON formats, included
   * @param to from date, in YYYY-MM-DD or JSON formats, included
   */
  @Path(':id/history')
  @GET
  @PreProcessor(deviceIdValidator)
  getHistory(@PathParam('id') name: string, @QueryParam('aggregate') dataSet: "change" | "raw" | "minute" | "hour" | "day" | "month" | "year", @QueryParam('from') from: string, @QueryParam('to') to: string) {
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
      device.persistence.getHistory(dataSet, fromDate, toDate, (err, results) => {
        if (err) {
          logger.error(err);
          reject("KO");
        } else {
          resolve(results);
        }
      });
    });
  }

}

