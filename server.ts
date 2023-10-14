/**
 * Module dependencies.
 */

var logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

import * as chokidar from 'chokidar';
import * as core from 'domoja-core';
import * as net from 'net';
import { Server } from 'typescript-rest';

import * as apis from './api';

import * as socketio from 'socket.io';
import * as http from 'http';
import * as https from 'https';


import * as express from 'express';
import * as session from 'express-session';

import * as cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';

import * as async from 'async';

import { rateLimit, Options, AugmentedRequest } from 'express-rate-limit';


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

type http_type = 'HTTP' | 'HTTPS';

const whitelist = [
  "/index.html",
  "/login.html",
  "/currentsetting.htm", // from Genie
  "/cordova.js",
  /^\/build\/.*/,
  /^\/devices\/.*/,
];

export function checkRoute(req: express.Request) {
  let bad = !whitelist.some(s => {
    if (typeof s == "string") return req.path == s;
    return s.test(req.path)
  });

  if (bad) {

    function dumpInfo() {
      logger.warn("Url:", req.protocol + "://" + req.hostname + req.url);
      if (req.query && req.query != {}) logger.warn("Query:", req.query);
      if (req.method == "POST") logger.warn("Body:", req.body);
      logger.warn("Referer:", req.headers.referer);
      logger.warn("User-agent:", req.headers["user-agent"]);
      logger.warn("IP:", req.ip);
    }

    http.get(`http://ip-api.com/json/${req.ip}?fields=message,continent,country,regionName,city,isp,org,as`, (res) => {
      const { statusCode } = res;
      const contentType = res.headers['content-type'];

      let error;
      // Any 2xx status code signals a successful response but
      // here we're only checking for 200.
      if (statusCode !== 200) {
        error = new Error('Request Failed.\n' +
          `Status Code: ${statusCode}`);
      } else if (!/^application\/json/.test(contentType)) {
        error = new Error('Invalid content-type.\n' +
          `Expected application/json but received ${contentType}`);
      }
      if (error) {
        console.error(error.message);
        // Consume response data to free up memory
        res.resume();
        return;
      }

      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(rawData);
          dumpInfo();
          logger.warn(parsedData);
        } catch (e) {
          logger.error(e.message);
          dumpInfo();
        }
      });
    }).on('error', (e) => {
      logger.error(`Got error: ${e.message}`);
      dumpInfo();
    });
  }

  return !bad;
}

var runWithMocha = /.*mocha$/.test(process.argv[1]);

export class DomojaServer {
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
    apis.setDomojaServer(this);

    this.app = express();

    if (!prod) {
      let whitelist = ['http://192.168.0.10:8100', 'http://raspberrypi:8100', 'https://domo.bchabrier.com']
      false && this.app.use(cors({

        origin: function (origin, callback) {
          if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true)
          } else {
            logger.error(`Origin \'${origin}\' not allowed by CORS`);
            callback(new Error(`Origin \'${origin}\' not allowed by CORS`));
          }
        },
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
      schemes: [ssl ? 'https' : 'http']
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

    this.app.use((req, res, next) => {
      if (!res.headersSent) {
        // response not sent, which means the route has not been handled
        checkRoute(req);
      }
      next();
    });

    let options: { key: Buffer, cert: Buffer } = null;
    let http_https: typeof http | typeof https = http;

    if (ssl) {
      options = {
        key: fs.readFileSync(module_dir + '/ssl/key.pem'),
        cert: fs.readFileSync(module_dir + '/ssl/cert.pem')
      };
      http_https = https;
    }
    this.server = http_https === http ? http.createServer(null, this.app) : https.createServer(options, this.app);

    this.ws = new socketio.Server(this.server, {
      allowEIO3: true
    });
    this.ws.use(core.socketIoAuthorize());
    this.ws.sockets.on('connection', socket => {
      let request: http.IncomingMessage = socket.request;
      console.log(request.headers.cookie);

      let url: string;
      if (request.headers.origin) {
        url = request.headers.origin;
      } else if (request.headers.referer) {
        url = request.headers.referer;
      } else {
        logger.warn('Could not retrieve HTTP(S) type from headers:', request.headers);
      }
      let http_string: http_type = url ? url.split(':')[0].toUpperCase() as http_type : 'HTTP';
      logger.error("websocket connected with", http_string);
      this.nbWebsockets[http_string]++;
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
        this.nbWebsockets[http_string]--;
        this.ws.emit('change', this.getApp());
      });

    });

    listeningCallback && this.start(listeningCallback);
  }

  start(listeningCallback?: () => void) {
    this.server.listen(this.app.get('port'), () => {
      this.app.set('port', (<net.AddressInfo>this.server.address()).port); // in case app.get('port') is null
      console.log('Express %s server listening on port %s', this.app.get('env'), this.app.get('port'));
      listeningCallback && listeningCallback.apply(this);
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
      store,
      false && env == 'development' // not used anymore since we use proxy to avoid CORS rejections
    );

    // � partir de ce point les services doivent etre autoris�s
    let auth: express.Handler = (req, res, next) => {
      if (!req.isAuthenticated()) checkRoute(req);
      core.checkAuthenticated(req, res, next);
    }
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


    const limitHandler: Options["handler"] = (request: AugmentedRequest, response, next, options) => {
      logger.warn(`Too many requests received, limit is ${request.rateLimit.limit}!!`);
      response.status(options.statusCode).send(options.message);
    }

    // / is not forbidden, as it goes to login page
    app.get('/', rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: runWithMocha ? 0 : 100, // limit each IP to 100 requests per windowMs
      handler: limitHandler,
    }), core.ensureAuthenticated, function (req, res) {
      res.sendFile(path.join(module_dir, staticPath, indexHTML), cacheOptions);
    });

    app.get(indexHTML, rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: runWithMocha ? 0 : 100, // limit each IP to 100 requests per windowMs
      handler: limitHandler,
    }), core.ensureAuthenticated, serve);

    app.all('/manifest-auth.json', rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: runWithMocha ? 0 : 100, // limit each IP to 100 requests per windowMs
      handler: limitHandler,
    }), function (req, res) { res.sendStatus(403) });

    app.all(/^(.*)$/, rateLimit({
      windowMs: runWithMocha ? 100000 : 1000, // 1 second
      max: runWithMocha ? 0 : 50,
      handler: limitHandler,
    }), function (req, res, next) {
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

  loadConfig(configPath: string, done: (err: Error) => void) {
    configPath = path.normalize(configPath);

    if (configPath !== this.currentFile) {
      if (!fs.existsSync(configPath)) {
        return done(new Error(`Cannot open configuration '${configPath}'.`));
      }
      this.previousFile = this.currentFile;
      this.currentFile = configPath;
    }
    if (this.watcher) this.watcher.close();

    let watchTimeout: NodeJS.Timeout;

    this.watcher = chokidar.watch(configPath, { ignoreInitial: true, awaitWriteFinish: true });
    this.watcher.on('all',
      (event, path) => {
        // ignore changes in git repository
        if (path.indexOf('/.git/') !== -1) return;

        console.log("Change detected:", event, path);

        if (watchTimeout) {
          clearTimeout(watchTimeout);
        }
        watchTimeout = setTimeout(() => {
          watchTimeout = null;
          this.reloadConfig(err => { });
        }, 2000);
      });


    this.reloadConfig(done);
  }

  reloadConfig(done: (err: Error) => void) {
    core.setDemoMode(runWithMocha || this.getApp().demoMode);
    core.reloadConfig(this.currentFile, err => {
      if (err) return done(err);

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
      done(null);
    });
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
      demoMode: /([^\/]*\/)*config\/demo.yml/.test(this.currentFile),
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

let DmjServer: DomojaServer;

export function getDomojaServer() {
  return DmjServer;
}


