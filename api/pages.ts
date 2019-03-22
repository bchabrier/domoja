import { Errors, Path, Security, PreProcessor, GET, POST, PathParam, FormParam } from 'typescript-rest';
import * as express from 'express';

import { getCurrentConfig, ConfigLoader } from '../core/lib/load';

@Path('/pages')
export class PagesService {
  /**
   * Retrieves the list of pages
   */
  @GET
  getPages() {
    let pages: ConfigLoader["pages"] = getCurrentConfig() && getCurrentConfig().pages || {};

    return Object.keys(pages).map(name => {
      return pages[name]
    });
  }
}

