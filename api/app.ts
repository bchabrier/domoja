import { Errors, Path, PreProcessor, GET, POST, PathParam, FormParam } from 'typescript-rest';
import { DomojaServer } from '../server';

let DmjServer: DomojaServer;

export function setDomojaServer(server: DomojaServer) {
  DmjServer = server;
}

export function getDomojaServer() {
  return DmjServer;
}

@Path('/app')
export class AppService {
  /**
   * Retrieve the app data
   */
  @GET
  getApp() {
    if (DmjServer) return DmjServer.getApp();
    console.error('_DmjServer not defined!');
    return undefined;
  }

  /**
   * Set the app demo mode
   */
  @Path('/demo-mode')
  @POST
  setDemoMode(@FormParam('value') value: boolean): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (DmjServer) {
        DmjServer.loadConfig(value ? './config/demo.yml' : DmjServer.previousFile, err => {
          if (err) return reject("KO");
          return resolve("OK");
        });
      } else {
        console.error('_DmjServer not defined!');
        return resolve("KO");
      }
    });
  }
}

