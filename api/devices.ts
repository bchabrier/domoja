import { Errors, Path, Preprocessor, GET, POST, PathParam, FormParam } from 'typescript-rest';
import * as express from 'express';

import { devices } from '../core/lib/load';

function deviceIdValidator(req: express.Request): express.Request {

  let deviceID = req.params['id'];

  if (!devices) {
    throw new Errors.InternalServerError('no devices')
  }

  if (!devices[deviceID]) {
    throw new Errors.BadRequestError('device not found')
  }

  return req;
}

@Path('/devices')
export class DevicesService {
  /**
   * Retrieves a device
   * @param name path of the device
   */
  @Path(':id')
  @GET
  @Preprocessor(deviceIdValidator)
  get(@PathParam('id') name: string) {
    let device = devices[name].device;
    return {
      id: device.id,
      path: device.path,
      state: device.getState()
    }
  }

  /**
   * Sends a command to a device
   * @param name path of the device
   * @param command command sent to the device
   */
  @Path(':id')
  @POST
  @Preprocessor(deviceIdValidator)
  sendCommand(@PathParam('id') name: string, @FormParam('command') command: string) {
    let device = devices[name].device;
    return new Promise<string>((resolve, reject) => {
      device.setState(command, err => { err && reject(err) || resolve('OK') })
    });
  }
}

