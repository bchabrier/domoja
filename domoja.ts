/**
 * Module dependencies.
 */

var logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

import * as chokidar from 'chokidar';
import * as core from 'domoja-core';
import { Server } from 'typescript-rest';

import * as apis from './api';

import * as socketio from 'socket.io';
import * as http from 'http';
import * as https from 'https';

import * as colors from 'colors/safe';


//console.log(HelloService);


import * as express from 'express';
import * as session from 'express-session';

import * as cors from 'cors';
var basicAuth = require('basic-auth');
import * as path from 'path';
import * as fs from 'fs';

import * as async from 'async';

var runWithMocha = /.*mocha$/.test(process.argv[1]);
//var refreshData = require('./routes/refreshData')

var module_dir = __dirname;
// remove trailing /dist if any
module_dir = module_dir.replace(/\/dist$/, '');

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

type http_type = 'HTTP' | 'HTTPS';

class DomojaServer {
  app: express.Application;
  nbWebsockets: { [key in http_type]: number } = { HTTP: 0, HTTPS: 0 }
  ws: socketio.Server;
  currentFile: string;
  previousFile: string;
  startTime: Date = new Date;
  server: http.Server | https.Server;
  watcher: chokidar.FSWatcher;

  constructor(port: Number, prod: boolean, ssl: boolean, listeningCallback?: () => void) {
    let self = this;

    this.app = express();

    if (!prod) {
      this.app.use(cors({
        origin: ['http://raspberrypi:8100', 'http://192.168.0.10:8100', 'http://raspberrypi:4001', 'http://192.168.0.10:4001'],
        credentials: true
      }));
    }

    this.app.set('env', prod ? 'production' : 'development');

    this.app.set('port', port);
    //	app.set('views', __dirname + '/views');
    //	app.set('view engine', 'jade');
    //	app.use(express.favicon()); // use serve-favicon
    this.app.use(require('morgan')('dev')); // logger
    this.app.use(require('compression')());
    //	app.use(app.router);
    //	app.use(express.bodyParser());
    //	app.use(express.methodOverride());

    //if (app.get('env') == 'development') {
    //  		app.use(express..errorHandler());
    //}

    // services autorisés
    /*
    app.get('/serial', serial.index);
    app.get('/esp8266/update', esp8266.processData);
    app.get('/ipx800/update', ipx800.processIPX800Data);
    app.get('/test', proxy.test);
    app.get('/getTempoInfos', tempo.getTempoInfos);
    app.get('/presence', presence.presence);
  */

    Server.swagger(this.app, {
      filePath: module_dir + '/api/swagger.yaml',
      endpoint: '/api-docs',
      schemes: ['http']
    });

    var FileStore = require('session-file-store')(session);
    let store: typeof session.Store = new FileStore({
      logFn: logger.error
    });

    this.serveUI(this.app,
      '/login.html', '/www', '/index.html',
      this.app.get('env'),
      store
    );

    let apiTab: Function[] = [];
    Object.keys(apis).forEach(a => apiTab.push((<any>apis)[a]));
    Server.buildServices(this.app, ...apiTab);

    let options: { key: Buffer, cert: Buffer } = null;
    let http_https: typeof http | typeof https = http;

    if (ssl) {
      options = {
        key: fs.readFileSync(module_dir + '/ssl/key.pem'),
        cert: fs.readFileSync(module_dir + '/ssl/cert.pem')
      };
      http_https = https;
    }
    this.server = http_https.createServer(options, this.app).listen(this.app.get('port'), function () {
      self.app.set('port', this.address().port); // in case app.get('port') is null
      console.log('Express %s server listening on port %s', self.app.get('env'), self.app.get('port'));
      listeningCallback && listeningCallback.apply(self);
    });


    this.ws = socketio.listen(this.server);
    this.ws.use(core.socketIoAuthorize());
    this.ws.sockets.on('connection', socket => {
      let request: http.IncomingMessage = socket.request;
      console.log(request.headers.cookie);

      let url = request.headers.origin as string;
      let http_string: http_type = url ? url.split(':')[0].toUpperCase() as http_type : 'HTTP';
      logger.error("websocket connected with", http_string);
      self.nbWebsockets[http_string]++;
      this.ws.emit('change', this.getApp());

      /*
        socket.emit('news', {
        hello : 'world'
        });
  
        socket.on('my other event', function(data) {
        console.log(data);
        });
      */

      socket.on('disconnect', () => {
        logger.error("websocket disconnected with", http_string);
        self.nbWebsockets[http_string]--;
        this.ws.emit('change', this.getApp());
      });

    });
  }

  private serveUI(app: express.Application,
    loginPath: string,
    staticPath: string,
    indexHTML: string,
    env: 'development' | 'production',
    store: typeof session.Store) {

    // find the manifest
    type manifestType = {
      alwaysAuthorizedRoutes: string[]
    }
    let minimalManifest: manifestType = {
      alwaysAuthorizedRoutes: []
    }
    let manifest = minimalManifest;
    let manifestFile = path.join(module_dir, staticPath, 'manifest-auth.json');
    try {
      let manifestString = fs.readFileSync(manifestFile, { encoding: "utf8" });
      manifest = JSON.parse(manifestString);
    } catch (ex) {
      logger.error('Cannot open UI manifest file "%s".', manifestFile);
      logger.error('This file should contain %j.', minimalManifest);
    }

    let alwaysAuthorizedRoutes = manifest.alwaysAuthorizedRoutes;

    var oneYear = 31557600000;
    var cacheOptions: { maxAge: number } = (env == 'production') ? { maxAge: oneYear } : null;

    function serve(req: express.Request, res: express.Response) {
      res.sendFile(path.join(module_dir, staticPath, req.path), cacheOptions);
    }

    core.configure(app,
      core.checkUser,
      core.findUserById,
      core.token,
      loginPath,
      serve,
      store
    );

    // � partir de ce point les services doivent etre autoris�s
    let auth = core.checkAuthenticated;
    /*
      app.get('/users', auth, user.list);
      app.get('/tempo', auth, tempo.index);
      app.get('/sensors.xml', auth, tempo.getZibaseSensors);
      app.get('/proxy', auth, proxy.index);
      app.all('/domo/getInfosPiscine', auth, piscine.index);
      app.all('/domo/getTempPiscineStats', auth, piscine.piscine_temperature_stats);
      app.all('/domo/refreshData', auth, refreshData.refreshData);
      app.get('/domo/calcul_filtration', auth, piscine.calcul_filtration);
      app.get('/domo/setFiltration', auth, poolMgr.setFiltration);
      app.get('/domo/setAlarm', auth, alarmMgr.setAlarm);
      app.all('/domo/getAlerts', auth, alarmMgr.getAlerts);
      app.all('/domo/getAlertImage', auth, alarmMgr.getAlertImage);
      app.get('/domo/tab_temp_duration', auth, piscine.tab_temp_duration);
      app.get('/domo/horaires_astronomie', auth, astronomy.getAllTimes);
      app.all('/domo/switch', auth, switchLight.switch);
      app.all('/domo/ouvrePetitPortail', auth, portails.ouvrePetitPortail);
      app.all('/domo/ouvreGrandPortail', auth, portails.ouvreGrandPortail);
    */



    // / is not forbidden, as it goes to login page
    app.get('/', core.ensureAuthenticated, function (req, res) {
      res.sendFile(path.join(module_dir, staticPath, indexHTML), cacheOptions);
    });

    app.get(indexHTML, core.ensureAuthenticated, serve);

    app.all('/manifest-auth.json', function (req, res) { res.sendStatus(403) });

    app.all(/^(.*)$/, function (req, res, next) {
      if (alwaysAuthorizedRoutes.some((p) => { let r = new RegExp(p); return r.test(req.path); })) {
        next();
      } else {
        auth(req, res, next);
      }
    });

    app.use(express.static(path.join(module_dir, staticPath), cacheOptions));


    /*
        app.all(/^(.*)$/, auth, function(req, res, next) {
      console.log(req.protocol + '://' + req.get('host') + req.originalUrl);
      next();
        });
    */
    /*
     if (env == 'development') {
       ["/bower_components",
         "/scripts",
         "/styles", ,
         "/templates",
       ].forEach(function (dir) {
         app.use(dir, express.static(__dirname + staticPath + dir));
       });
     } else {
       function getHandlerWithCacheOptions(cacheOptions: { maxAge?: Number }) {
         return function handler(req: express.Request, res: express.Response) {
           var targetFile = req.path;
           console.log('Sending static file', targetFile);
           if (targetFile.indexOf("jsmpeg") >= 0 || targetFile.indexOf("jsmjpg") >= 0) {
             console.log(targetFile)
             res.sendFile(path.normalize(__dirname + "/" + targetFile));
           } else {
             res.sendFile(path.normalize(__dirname + staticPath + targetFile),
               cacheOptions);
           }
         }
       }
   
       var handler = getHandlerWithCacheOptions(cacheOptions);
       // authorized:
       app.get('/.well-known/acme-challenge/*', handler);
   
       app.get('/login.html', handler);
       app.get('/scripts/login.js', handler);
       app.all('/bower_components/angular/angular.js', handler);
       app.all('/bower_components/angular-animate/angular-animate.js', handler);
       app.all('/bower_components/angular-sanitize/angular-sanitize.js', handler);
       app.all('/bower_components/angular-ui-router/release/angular-ui-router.js', handler);
       app.all('/bower_components/ionic/release/js/ionic-angular.js', handler);
       app.all('/bower_components/ionic/release/js/ionic.js', handler);
   
       app.all('/bower_components/ionic/release/css/ionic.css', handler);
       app.all('/styles/style.css', handler);
       app.all('/apple-touch-icon-120x120-precomposed.png', handler);
       app.all('/apple-touch-icon-120x120.png', handler);
       app.all('/apple-touch-icon.png', handler);
   
       app.all('/styles/vendor.css', handler);
       app.all('/scripts/scripts.js', handler);
       app.all('/scripts/vendor.js', handler);
   
   
       // restricted paths
       authorizedPaths.forEach(path => {
         app.all(path, auth, handler);
       })
   
       // others are forbidden
       app.all(/^(.*)$/, auth, handler);
     }
   */
  }

  loadConfig(configPath: string) {
    configPath = path.normalize(configPath);

    if (configPath !== this.currentFile) {
      if (!fs.existsSync(configPath)) {
        logger.error("Cannot open configuration '%s'.", CONFIG_FILE);
        return;
      }
      this.previousFile = this.currentFile;
      this.currentFile = configPath;
    }
    if (this.watcher) this.watcher.close();

    let watchTimeout: NodeJS.Timer;

    this.watcher = chokidar.watch(configPath, { ignoreInitial: true });
    this.watcher.on('all',
      (event, path) => {
        console.log("Change detected:", event, path);

        if (watchTimeout) {
          clearTimeout(watchTimeout);
        }
        watchTimeout = setTimeout(() => {
          watchTimeout = null;
          this.reloadConfig();
        }, 2000);
      });


    this.reloadConfig();
  }

  reloadConfig() {
    core.reloadConfig(this.currentFile);
    let devices = core.getDevices();
    devices.forEach(device => {
      device.on('change', (message: core.message) => {
        let msg: core.message = {
          emitter: undefined,
          id: message.emitter.path,
          oldValue: message.oldValue,
          newValue: message.newValue,
          date: message.date
        }
        this.ws.emit('change', msg);
      });
    });
    this.ws.emit('reload');
  }

  close(callback?: (err: Error) => void) {
    if (this.watcher) this.watcher.close();
    this.watcher = undefined;
    async.parallel([
      (cb) => {
        if (this.server.listening) {
          this.server.close(cb);
        } else {
          cb(null);
        }
      },
      (cb) => {
        this.ws.close(() => { cb(null) });
      },

    ],
      // results contains the various potential errors
      (err) => {
        callback(err);
      }
    )
  }

  getNbWebsockets(type?: 'HTTP' | 'HTTPS') {
    if (type) return this.nbWebsockets[type];
    else return this.nbWebsockets['HTTP'] + this.nbWebsockets['HTTPS'];
  }

  getApp() {
    return {
      demoMode: /.*\/config\/demo.yml/.test(DmjServer.currentFile),
      nbWebsockets: this.getNbWebsockets(),
      nbWebsocketsHTTP: this.getNbWebsockets('HTTP'),
      nbWebsocketsHTTPS: this.getNbWebsockets('HTTPS'),
      startTime: this.startTime,
      nbDevices: core.getDevices().length,
      nbSources: core.getCurrentConfig() && Object.keys(core.getCurrentConfig().sources).length,
      nbScenarios: core.getCurrentConfig() && Object.keys(core.getCurrentConfig().scenarios).length,
      nbPages: core.getCurrentConfig() && Object.keys(core.getCurrentConfig().pages).length,
    }
  }
}

export let DmjServer: DomojaServer;

export function ___setDmjServer___(d: DomojaServer) {
  if (runWithMocha) {
    DmjServer && DmjServer.close(() => console.log('===============================closed'))
    DmjServer = d;
  } else {
    logger.warning('Enabled only when running with mocha!')
  }
}

if (!fs.existsSync(CONFIG_FILE)) {
  logger.error("Cannot open configuration '%s'. Exiting...", CONFIG_FILE);
} else {

  if (!runWithMocha) {

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
    DmjServer = new DomojaServer(port, port == 443, port == 443);
    logger.error(__dirname);
    DmjServer.loadConfig(CONFIG_FILE);

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
        res.redirect(301, 'https://' + req.hostname + req.originalUrl);
      });
      let server80 = http.createServer(app80).listen(80, function () {
        console.log('Express production server listening on port 80');
      });
    }

    let n = 1;
    false && setInterval(() => {
      let dev = core.getDevice("aquarium.lampes_end");
      dev.setState(n.toString(), () => {
        n++
      });
    }, 10000)



    /*
  
    var options = {
      key: fs.readFileSync(__dirname + '/ssl/key.pem'),
      cert: fs.readFileSync(__dirname + '/ssl/cert.pem')
    };
  
    server_sec = https.createServer(options, app_prod).listen(443, function () {
      console.log("Express server listening on port " + 443);
    });
  
    server_prod = http.createServer(app_prod).listen(app_prod.get('port'), function () {
      console.log("Express server listening on port " + app_prod.get('port'));
    });
  
    server_80 = http.createServer(app_prod).listen(80, function () {
      console.log("Express server listening on port " + 80);
    });
  */
    //refreshData.createWebsockets([server, server_prod, server_80], [server_sec]);


  }
}