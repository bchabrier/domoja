import { Errors, Path, PreProcessor, GET, POST, PathParam, FormParam } from 'typescript-rest';
import * as express from 'express';

import { GenericDevice } from 'domoja-core';
import * as core from 'domoja-core';

function deviceIdValidator(req: express.Request): express.Request {

  let deviceID = req.params['id'];

  var devices = core.getDevices();

  if (!devices) {
    throw new Errors.InternalServerError('no devices')
  }

  if (!devices.find(device => device.path == deviceID)) {
    throw new Errors.BadRequestError('device not found')
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

@Path('/devices')
export class DevicesService {
  /**
   * Retrieves the list of devices
   */
  @GET
  getDevices() {
    var devices = core.getDevices();
    return Object.keys(core.getDevices()).map((index : any) => {
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
}

