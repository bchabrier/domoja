import { Errors, Path, PreProcessor, GET, POST, PathParam, FormParam } from 'typescript-rest';
import { DmjServer } from '../domoja';

@Path('/app')
export class AppService {
  /**
   * Retrieve the app data
   */
  @GET
  getApp() {
    return DmjServer.getApp();
  }

  /**
   * Set the app demo mode
   */
  @Path('/demo-mode')
  @POST
  setDemoMode(@FormParam('value') value: boolean) {
    DmjServer.loadConfig(value?'./config/demo.yml':DmjServer.previousFile);
    return "OK";
  }

}

