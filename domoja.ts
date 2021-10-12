/**
 * Module dependencies.
 */

var logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

import { DomojaServer, checkRoute } from './server';

import * as http from 'http';

import * as colors from 'colors/safe';


import * as express from 'express';

import * as path from 'path';
import * as fs from 'fs';


var runWithMocha = /.*mocha$/.test(process.argv[1]);
//var refreshData = require('./routes/refreshData')

var module_dir = __dirname;
// remove trailing /dist if any
module_dir = module_dir.replace(/\/dist$/, '');

// capture dev mode
let devMode: boolean = undefined;
if (process.argv.includes('--dev')) {
  devMode = true;
  process.argv = process.argv.filter(s => s != '--dev');
}

// process.argv is in the following form if run with mocha:
//[ '/usr/bin/node',
//  '/home/pi/domoja/node_modules/mocha/bin/mocha',
//  '-r',
//  '/home/pi/domoja/node_modules/ts-mocha/src/index.js',
//  'test/test_domoja.ts',
//  '--args', // strangely, without this, the next argument is taken as a test spec
//  'config/demo.yml' ]
const posOfArgs = process.argv.indexOf('--args');
const configArg = runWithMocha ? (posOfArgs >= 0 ? posOfArgs + 1 : process.argv.length) : 2;

const CONFIG_FILE = process.argv[configArg] ? process.argv[configArg] : module_dir + '/config/demo.yml';

//if (!runWithMocha) {

if (!fs.existsSync(CONFIG_FILE)) {
  logger.error("Cannot open configuration '%s'. Exiting...", CONFIG_FILE);
} else {

  logger.info(colors.magenta('    ____                        _'));
  logger.info(colors.magenta('   / __ \\____  ________  ____  (_)___ _'));
  logger.info(colors.magenta('  / / / / __ \\/ _    _ \\/ __ \\/ / __ `/'));
  logger.info(colors.magenta(' / /_/ / /_/ / / / / / / /_/ / / /_/ /'));
  logger.info(colors.magenta('/_____/\\____/_/ /_/ /_/\\____/ /\\__,_/ '));
  logger.info(colors.magenta('                       /_____/'));
  logger.info('')


  //var app_prod = createApp(4000, true);
  //var app_prod = createApp(3000, true);
  //var app = createApp(3001, false);
  //DmjServer = new DomojaServer(4001, false, false);
  let port = process.env.PORT && parseInt(process.env.PORT) || 4001;
  if (devMode == undefined) devMode = port != 443;
  let server = new DomojaServer(port, !devMode, port == 443);
  logger.error(__dirname);
  server.loadConfig(CONFIG_FILE, () => {
    server.start(() => {
      if (port == 443) {
        // also listen on port 80 en redirect to 443
        let app80 = express();
        app80.set('env', 'production');
        app80.use(require('morgan')('dev')); // logger

        // serve certbot
        app80.get('/.well-known/acme-challenge/*', (req, res) => {
          res.sendFile(path.join(module_dir, '/www', req.path));
        });
        app80.all(/^.*$/, (req, res) => {
          checkRoute(req) && res.redirect(301, 'https://' + req.hostname + req.originalUrl);
        });
        let server80 = http.createServer(app80).listen(80, function () {
          console.log('Express production server listening on port 80');
        });
      }
    });
  });
}