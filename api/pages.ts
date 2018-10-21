import { Errors, Path, Preprocessor, GET, POST, PathParam, FormParam } from 'typescript-rest';
import * as express from 'express';

import { getCurrentConfig } from '../core/lib/load';

@Path('/pages')
export class PagesService {
  /**
   * Retrieves the list of devices
   */
  @GET
  getPages() {
    let pages = getCurrentConfig().pages;

    return Object.keys(pages).map(name => {
      return pages[name]
    });
  }
}

