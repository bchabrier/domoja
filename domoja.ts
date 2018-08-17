/**
 * Module dependencies.
 */

var logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

var fsmonitor = require('fsmonitor');

import * as domoja from 'domoja-core';

import * as express from 'express';
var http = require('http')
var https = require('https')
var basicAuth = require('basic-auth');
var path = require('path');
var fs = require('fs');

var runWithMocha = /.*mocha$/.test(process.argv[1]);
//var refreshData = require('./routes/refreshData')

function reloadConfig() {
  let demo = true;

  domoja.reloadConfig(demo ? './config/demo.yml' : null);

  // start managers
  //domoMgr.run(); // must be loaded after reloadConfig
  if (!runWithMocha) {
  }
 /* 
  refreshData.setConfig({
    // "name of data" (string): [ category, type, object containing, "attribute" ]

  });
  */
}


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

  reloadConfig();
});

reloadConfig();




function createApp(port: Number, prod: boolean) {
  var app = express();

  if (prod) {
    //protection pour n'autoriser que mon BB 9900 sur le port 80
    app.use(function (req, res, next) {
      if (req.socket.localPort != 80) {
        next();
      } else {
        console.log('%s %s', req.method, req.url);
        console.log(req.headers)
        console.log(req.ip)
        console.log(req.socket.localPort)
      }
    });
  }

  app.set('port', process.env.PORT || port);
  //	app.set('views', __dirname + '/views');
  //	app.set('view engine', 'jade');
  //	app.use(express.favicon()); // use serve-favicon
  app.use(require('morgan')('dev')); // logger
  app.use(require('compression')());
  //	app.use(app.router);
  //	app.use(express.bodyParser());
  //	app.use(express.methodOverride());
  app.use(express.static(path.join(__dirname, 'public')));

  if (app.get('env') == 'development') {
    //		app.use(express.errorHandler());
  }

  // services autoris�s
  /*
  app.get('/serial', serial.index);
  app.get('/esp8266/update', esp8266.processData);
  app.get('/ipx800/update', ipx800.processIPX800Data);
  app.get('/test', proxy.test);
  app.get('/getTempoInfos', tempo.getTempoInfos);
  app.get('/presence', presence.presence);
*/

  domoja.configure(app, 
    domoja.checkUser, /*  function check(username, password, done) {
      logger.debug('user check !');
      if (username === validuser.username &&
        password === validuser.password) {
        logger.debug('user check passed');
        return done(null, validuser);
      }
      if (username === validuser2.username &&
        password === validuser2.password) {
        logger.debug('user check passed');
        return done(null, validuser2);
      }
      return done(null, false);
    },*/
    domoja.findUserById, /* function findById(id, fn) {
      logger.debug('finding user ', id);
      if (id === validuser.username) {
        return fn(null, validuser);
      }
      if (id === validuser2.username) {
        return fn(null, validuser2);
      }
      return fn(null, null);
    },*/
    require('./core/lib/token'),
    '/login.html',
    serve
  );

  // � partir de ce point les services doivent etre autoris�s
  //	app.use(express.basicAuth('u', 'p'));
  var auth = function (req: express.Request, res: express.Response, next: express.NextFunction) {
    function unauthorized(res: express.Response) {
      res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
      return res.sendStatus(401);
    };

    if (req.headers.origin === 'http://192.168.0.10:8100' && req.headers.host === '192.168.0.10:3000') {
      console.log("authorized");
      res.set('Access-Control-Allow-Origin', req.headers.origin);
      return next();
    }
    console.log("check authorized?");

    var user = basicAuth(req);
    if (!user || !user.name || !user.pass) {
      return unauthorized(res);
    };

    if (user.name === 'foo' && user.pass === 'bar') {
      return next();
    } else {
      return unauthorized(res);
    };
  };

  auth = domoja.checkAuthenticated;
  function serve(req: express.Request, res: express.Response) {
    res.sendFile(path.normalize(__dirname + (prod ? '/www' : '/app') + req.path));
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
  var oneYear = 31557600000;
  var cacheOptions: { maxAge?: Number} = {
    maxAge: oneYear
  }
  if (!prod)
    cacheOptions = {};

  // / is not forbidden, as it goes to login page
  app.get("/", domoja.ensureAuthenticated, function (req, res) {
    res.sendFile(path.normalize(__dirname + (prod ? "/www" : "/app") + "/index.html"), cacheOptions);
  });

  app.get("/index.html", domoja.ensureAuthenticated, function (req, res) {
    res.sendFile(path.normalize(__dirname + (prod ? "/www" : "/app") + "/index.html"), cacheOptions);
  });

  /*
      app.all(/^(.*)$/, auth, function(req, res, next) {
    console.log(req.protocol + '://' + req.get('host') + req.originalUrl);
    next();
      });
  */
  if (!prod) {
    ["/bower_components",
      "/scripts",
      "/styles", ,
      "/templates",
    ].forEach(function (dir) {
      app.use(dir, express.static(__dirname + "/app" + dir));
    });
  } else {

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

    // others are forbidden
    app.all(/^(.*)$/, auth, handler);
  }

  return app;
}

function getHandlerWithCacheOptions(cacheOptions: { maxAge?: Number}) {
  return function handler(req: express.Request, res: express.Response) {
    var targetFile = req.path;
    console.log('Sending static file', targetFile);
    if (targetFile.indexOf("jsmpeg") >= 0 || targetFile.indexOf("jsmjpg") >= 0) {
      console.log(targetFile)
      res.sendFile(path.normalize(__dirname + "/" + targetFile));
    } else {
      res.sendFile(path.normalize(__dirname + "/www/" + targetFile),
        cacheOptions);
    }
  }
}

var app_prod = createApp(3000, true);
var app = createApp(3001, false);

var server;
var server_sec;
var server_prod;
var server_80;

if (!runWithMocha) {
  var app_prod = createApp(4000, true);
  var app = createApp(4001, false);

  server = http.createServer(app).listen(app.get('port'), function () {
    console.log("Express server listening on port " + app.get('port'));
  });

  logger.error(__dirname);

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
