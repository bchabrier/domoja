import { GenericDevice, DeviceOptions, CustomDeviceType } from './genericDevice'
import { camera } from './camera'
import { Source, ID, DefaultSource } from '../sources/source'
import * as http from 'http';
import * as https from 'https';
import { InitObject, Parameters } from '../lib/module';
import { ConfigLoader } from '../lib/load';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class httpCamera extends camera {

  videoUrl: string;
  snapshotUrl: string;

  constructor(source: Source, url: string, instanceFullname: string, name: string, initObject: InitObject, options?: DeviceOptions) {
    super(source, instanceFullname, url, 'unused', name, initObject, options);
    this.videoUrl = initObject['video-url'];
    this.snapshotUrl = initObject['snapshot-url'];
  }

  private doGet(cameraURL: string, baseUrl: string, headers: http.IncomingHttpHeaders, callback: (response: http.IncomingMessage) => void): void {
    let url: URL = new URL(cameraURL, baseUrl);

    let module = url.protocol == 'https:' ? https : http;

    let options: http.RequestOptions = {};

    // if local url, we use the passed headers to get authentified
    if (baseUrl.startsWith(url.origin)) {
      options.headers = headers;
    }

    module.get(url.href, options, callback).on('error', (e) => {
      logger.warn('Cannot get snapshot for camera "%s":', this.name, e);
    });
  }

  getSnapshot(baseUrl: string, headers: http.IncomingHttpHeaders, callback: (response: http.IncomingMessage) => void): void {
    this.doGet(this.snapshotUrl, baseUrl, headers, callback);
  }

  getStream(baseUrl: string, headers: http.IncomingHttpHeaders, callback: (response: http.IncomingMessage) => void): void {
    this.doGet(this.videoUrl, baseUrl, headers, callback);
  }

  createInstance(configLoader: ConfigLoader, instanceFullname: string, initObject: InitObject): GenericDevice {
    return new httpCamera(configLoader.DEFAULT_SOURCE, initObject['video-url'], instanceFullname, initObject.name, initObject);
  }

}

Source.registerDeviceType(DefaultSource, new CustomDeviceType('httpCamera'), {
  'video-url': 'REQUIRED',
  'snapshot-url': 'REQUIRED',
  name: 'REQUIRED',
});
