import { GenericDevice, DeviceOptions, CustomDeviceType } from './genericDevice'
import { camera } from './camera'
import { Source, ID, DefaultSource } from '../sources/source'
import * as http from 'http';
import * as https from 'https';
import { InitObject, Parameters } from '../lib/module';
import { ConfigLoader } from '../lib/load';
import * as urllib from 'urllib';

import { colorConsole } from 'tracer';

const logger = colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class httpCamera extends camera {

  videoUrl: string;
  snapshotUrl: string;
  authorizationHeader: string;

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

    if (this.authorizationHeader && this.authorizationHeader !== '') {
      logger.debug(`Camera "${this.name}": authorizationHeader used:`, this.authorizationHeader);
      if (!options.headers) options.headers = {};
      options.headers['Authorization'] = this.authorizationHeader;
    }

    module.get(url.href, options, (response) => {
      if (response.statusCode === 401) {
        // need authentication, or authentication failed
        // let's see if Basic or Digest are needed
        const WWWAuthenticateHeader = response.headers['www-authenticate'];
        logger.debug(`Camera "${this.name}": unauthorized request. response header www.authenticate:`, WWWAuthenticateHeader);
        const authenticateMethod = WWWAuthenticateHeader && WWWAuthenticateHeader.split(' ')[0];
        switch (authenticateMethod.toLowerCase()) {
          case 'digest':
            logger.debug(`Camera "${this.name}": using method digest`);
            urllib.request(url.href, {
              headers: headers,
              digestAuth: url.username + ':' + url.password,
              streaming: true,
            }, (err, data, res) => {
              if (err) {
                logger.warn('Cannot get snapshot for camera "%s":', this.name, err);
                logger.debug(`Camera "${this.name}": got error, resetting authorizationHeader for next time`);
                this.authorizationHeader = res.headers['authorization'];
                callback(null);
              } else {
                const request = ((<any>res).req as http.ClientRequest);
                this.authorizationHeader = request.getHeader('authorization') as string;
                logger.debug(`Camera "${this.name}": got result, keeping authorization header for next time:`, this.authorizationHeader);
                callback(res);
              }
            });
            break;
            /*
          case 'basic':
            logger.error('method basic');
            urllib.request(url.href, {
              headers: headers,
              auth: url.username + ':' + url.password,
              streaming: true,
            }, (err, data, res) => {
              if (err) {
                logger.warn('Cannot get snapshot for camera "%s":', this.name, err);
                callback(null);
              } else {
                this.authorizationHeader = res.headers['authorization'];
                callback(res);
              }
            });
            break;
            */
          default:
            logger.warn(`Unsupported authentication method '${authenticateMethod}' used by camera "${this.name}" with url '${url.href}'.`);
            callback(response);
        }
      } else {
        callback(response);
      }
    }).on('error', (e) => {
      logger.warn('Cannot get snapshot for camera "%s":', this.name, e);
      callback(null);
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
