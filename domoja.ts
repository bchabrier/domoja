/**
 * Module dependencies.
 */

var logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

var fsmonitor = require('fsmonitor');

import * as core from 'domoja-core';
import { Server } from 'typescript-rest';

import * as apis from './api';

import * as socketio from 'socket.io';
import * as http from 'http';

import * as colors from 'colors/safe';


//console.log(HelloService);


import * as express from 'express';
import * as session from 'express-session';

import * as cors from 'cors';
//var http = require('http')
var https = require('https')
var basicAuth = require('basic-auth');
var path = require('path');
var fs = require('fs');

var runWithMocha = /.*mocha$/.test(process.argv[1]);
//var refreshData = require('./routes/refreshData')

const CONFIG_FILE = process.argv[2] || './config/demo.yml';
//const CONFIG_FILE = null;

type http_type = 'HTTP' | 'HTTPS';

class DomojaServer {
  app: express.Application;
  nbWebsockets: { [key in http_type]: number } = { HTTP: 0, HTTPS: 0 }
  ws: socketio.Server;
  currentFile: string;
  previousFile: string;
  startTime: Date = new Date;

  constructor(port: Number, prod: boolean, listeningCallback?: () => void) {
    let self = this;

    this.app = express();

    if (!prod) {
      this.app.use(cors({
        origin: ['http://raspberrypi:8100', 'http://192.168.0.10:8100', 'http://raspberrypi:4001', 'http://192.168.0.10:4001'],
        credentials: true
      }));
    }

    this.app.set('env', prod ? 'production' : 'development');

    this.app.set('port', process.env.PORT || port);
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
    Server.swagger(this.app,'./api/swagger.yaml', '/api-docs', null, ['http']);

    var FileStore = require('session-file-store')(session);
    let store: typeof session.Store = new FileStore({
      logFn: logger.error
    });

    this.serveUI(this.app,
      '/login.html', '/../helloWorld/src', '/index.html',
      [
        '/build'
      ],
      [],
      this.app.get('env'),
      store
    );

    this.app.use(express.static(path.join(__dirname, 'www')));

    let apiTab: Function[] = [];
    Object.keys(apis).forEach(a => apiTab.push((<any>apis)[a]));
    Server.buildServices(this.app, ...apiTab);

    let server = this.app.listen(this.app.get('port'), function () {
      self.app.set('port', this.address().port); // in case app.get('port') is null
      console.log('Express %s server listening on port %s', self.app.get('env'), self.app.get('port'));
      listeningCallback && listeningCallback.apply(self);
    });

    this.ws = socketio.listen(server);
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

    let watchTimeout: NodeJS.Timer;

    fsmonitor.watch('./config', null, function (change: {
      addedFiles: string, modifiedFiles: string, removedFiles: string,
      addedFolders: string, modifiedFolders: string, removedFolders: string,
    }) {
      console.log("Change detected:\n" + change);

      console.log("Added files:    %j", change.addedFiles);
      console.log("Modified files: %j", change.modifiedFiles);
      console.log("Removed files:  %j", change.removedFiles);

      console.log("Added folders:    %j", change.addedFolders);
      console.log("Modified folders: %j", change.modifiedFolders);
      console.log("Removed folders:  %j", change.removedFolders);

      if (watchTimeout) {
        clearTimeout(watchTimeout);
      }
      watchTimeout = setTimeout(() => {
        watchTimeout = null;
        self.reloadConfig();
      }, 2000);
    });
  }

  private serveUI(app: express.Application,
    loginPath: string,
    staticPath: string,
    indexHTML: string,
    authorizedPaths: string[],
    alwaysAuthorizedPaths: string[],
    env: 'development' | 'production',
    store: typeof session.Store) {

    function serve(req: express.Request, res: express.Response) {
      res.sendFile(path.normalize(__dirname + staticPath + req.path));
    }

    core.configure(app,
      core.checkUser,
      core.findUserById,
      require('./core/lib/token'),
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



    var oneYear = 31557600000;
    var cacheOptions: { maxAge?: Number } = (env == 'production') ? { maxAge: oneYear } : {}

    // / is not forbidden, as it goes to login page
    app.get('/', core.ensureAuthenticated, function (req, res) {
      res.sendFile(path.normalize(__dirname + staticPath + indexHTML), cacheOptions);
    });

    app.get(indexHTML, core.ensureAuthenticated, function (req, res) {
      res.sendFile(path.normalize(__dirname + staticPath + indexHTML), cacheOptions);
    });

    app.use(express.static(path.join(__dirname, staticPath)));

    app.all(/^(.*)$/, auth);

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

  loadConfig(file: string) {
    if (file !== this.currentFile) {
      this.previousFile = this.currentFile;
      this.currentFile = file;
    }
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
  DmjServer = new DomojaServer(4001, false);
  logger.error(__dirname);
  DmjServer.loadConfig(CONFIG_FILE);

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
