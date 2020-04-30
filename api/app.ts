import { Errors, Path, PreProcessor, GET, POST, PathParam, FormParam } from 'typescript-rest';
import { DomojaServer } from '../server';

let DmjServer: DomojaServer;

export function setDomojaServer(server: DomojaServer) {
  DmjServer = server;
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
  setDemoMode(@FormParam('value') value: boolean) {
    if (DmjServer) {
      DmjServer.loadConfig(value?'./config/demo.yml':DmjServer.previousFile);
    return "OK";
    } else {
      console.error('_DmjServer not defined!');
      return "KO";
    }
  }

}

