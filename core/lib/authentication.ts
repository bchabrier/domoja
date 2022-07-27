import * as util from 'util';
import * as passport from 'passport';
import * as passportLocal from 'passport-local';
var LocalStrategy = passportLocal.Strategy;
var RememberMeStrategy = require('passport-remember-me').Strategy;
import * as passportHeaderApiKey from 'passport-headerapikey';
const HeaderAPIKeyStrategy = passportHeaderApiKey.HeaderAPIKeyStrategy;
import * as passportHttp from 'passport-http';
const BasicStrategy = passportHttp.BasicStrategy;
import * as cookieParser from 'cookie-parser';
import * as ensureLogin from 'connect-ensure-login';
const flash = require('connect-flash');
import * as tokenMgr from '../lib/token';
import * as express from 'express';
import { IVerifyOptions } from 'passport-local';
import * as socketio from 'socket.io';
let passportSocketIo = require('passport.socketio');
import * as session from 'express-session';
import * as bodyParser from 'body-parser';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { rateLimit, Options, AugmentedRequest } from 'express-rate-limit';

var logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

var runWithMocha = /.*mocha$/.test(process.argv[1]);

class User {
  id: string
}

var _tokenMgr: typeof tokenMgr;
var _loginPath: string;
var _store: any;
var _dev: boolean;

export function configure(app: express.Application,
  check: (user: string, pwd: string, done: (error: any, user?: any, options?: IVerifyOptions) => void) => void,
  findById: (user: string, cb: (err: Error, user: User) => void) => void,
  tokenMgr: typeof _tokenMgr, loginPath: string,
  loginContent: (req: express.Request, resp: express.Response) => void,
  store: typeof session.Store,
  devMode: boolean) {
  _tokenMgr = tokenMgr;
  _loginPath = loginPath;
  _store = store;
  _dev = devMode

  // Local Authentication strategy
  passport.use(new LocalStrategy(function (user: string, pwd: string, done: (error: any, user?: any, options?: IVerifyOptions) => void) {
    logger.debug('LocalStrategy calling check');
    check(user, pwd, done);
  }));

  // Configure Passport authenticated session persistence.
  //
  // In order to restore authentication state across HTTP requests, Passport needs
  // to serialize users into and deserialize users out of the session.  The
  // typical implementation of this is as simple as supplying the user ID when
  // serializing, and querying the user record by ID from the database when
  // deserializing.
  passport.serializeUser(function (user: User, cb: (err: Error, user: string) => void) {
    logger.debug('serializeUser', util.inspect(user));
    cb(null, user.id);
  });

  passport.deserializeUser(function (id: string, cb) {
    logger.debug('deserializeUser', id);
    findById(id, function (err: Error, user: User) {
      if (err) {
        logger.debug('could not deserialize user', id);
        return cb(err);
      }
      if (user == null) {
        logger.debug('user not found:', user);
        // let's try the next deserializer
        cb('pass');
      } else {
        logger.debug('found user', user);
        cb(null, user);
      }
    });
  });

  // Remember Me cookie strategy
  //   This strategy consumes a remember me token, supplying the user the
  //   token was originally issued to.  The token is single-use, so a new
  //   token is then issued to replace it.
  passport.use(new RememberMeStrategy(
    function (token: string, done: (err: Error, user?: User | boolean) => void) {
      consumeRememberMeToken(token, function (err: Error, uid: string) {
        if (err) {
          logger.debug('Got error while consuming RememberMe token:', err);
          return done(err);
        }
        if (!uid) {
          logger.debug('Got no uid while consuming RememberMe token');
          return done(null, false);
        }

        logger.debug('Found uid while consuming RememberMe token:', uid);
        findById(uid, function (err, user) {
          if (err) {
            logger.debug('Found error while finding uid "', uid, '":', err);
            return done(err);
          }
          if (!user) {
            logger.debug('Didn\'t find user for uid "', uid, '"');
            return done(null, false);
          }
          logger.debug('Found user for uid "', uid, '":', user);
          return done(null, user);
        });
      });
    },
    issueToken
  ));

  passport.use(new HeaderAPIKeyStrategy(
    { header: 'Authorization', prefix: 'Api-Key ' },
    false,
    function (apikey, done) {
      /*
      User.findOne({ apikey: apikey }, function (err, user) {
        if (err) { return done(err); }
        if (!user) { return done(null, false); }
        return done(null, user);
      });
      */
      logger.debug("verifying api key")
      if (apikey == "qdpofiqdlfkj") { // some api key associating to user 0
        return findById('0', done);
      }
      logger.debug("bad api key")
      done(new Error("Unknown api key"));
    }
  ));

  passport.use(new BasicStrategy(
    function (userid, password, done) {
      logger.debug('BasicStrategy calling check');
      check(userid, password, done);
    }));

  app.use(flash());

  app.use(cookieParser());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(session({
    secret: getSecrets(),
    store: _store,
    resave: false,
    saveUninitialized: false,
    cookie: _dev ? { secure: true, sameSite: "none" } : undefined
  }));

  // Initialize Passport and restore authentication state, if any, from the
  // session.
  app.use(passport.initialize());
  app.use(passport.session());

  const limitHandler: Options["handler"] = (request: AugmentedRequest, response, next, options) => {
    logger.warn(`Too many requests received, limit is ${request.rateLimit.limit}!!`);
    response.status(options.statusCode).send(options.message);
  }

  app.use(rateLimit({
    windowMs: 1000, // 1 second
    max: runWithMocha ? 0 : 40, // limit each IP to 40 requests per windowMs
    handler: limitHandler,
  }), authenticateBasicAndApiKey);

  app.use(passport.authenticate('remember-me'));


  app.get(loginPath, function (req, res) {
    //  res.json({ user: req.user, message: req.flash('error') });
    return loginContent(req, res);
  });

  // POST /login.html
  //   Use passport.authenticate() as route middleware to authenticate the
  //   request.  If authentication fails, the user will be redirected back to the
  //   login page.  Otherwise, the primary route function function will be called,
  //   which, in this example, will redirect the user to the home page.
  //
  //   curl -v -d "username=bob&password=secret" http://127.0.0.1:3000/login.html
  app.post(loginPath,
    function (req: express.Request, res: express.Response, next: express.NextFunction) {
      logger.debug(loginPath + ' called');
      return next(null);
    },
    //	   passport.authenticate('session'),
    passport.authenticate('local', { failureRedirect: loginPath }),
    function (req: express.Request, res: express.Response, next: express.NextFunction) {

      function successReturnToOrRedirect() {
        let target = (<any>req).session.returnTo || '/';
        logger.debug('redirecting to', target);
        logger.debug('with headers', res.getHeaders());
        return res.redirect(target);
      }

      logger.debug('passport.authenticate was successful');
      // Issue a remember me cookie if the option was checked
      if (!req.body.remember_me || req.body.remember_me == 'false') {
        logger.debug('remember_me option was not checked');
        return successReturnToOrRedirect();
      }

      logger.debug('remember_me option was checked, issuing token');
      issueToken(req.user as User, function (err: Error, token: string) {
        if (err) { return next(err); }
        res.cookie('remember_me', token, { path: '/', httpOnly: true, maxAge: 604800000, sameSite: _dev ? "none" : undefined, secure: _dev ? true : undefined }); // 7 days
        return successReturnToOrRedirect();
      });
    },
    function (req: express.Request, res: express.Response) {
      logger.error('Should never pass here');
      res.redirect('/');
    });

  app.get('/logout', function (req, res) {
    // clear the remember me cookie when logging out
    res.clearCookie('remember_me');
    req.logout();
    res.redirect('/');
  });
}

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
export function ensureAuthenticated(req: express.Request, res: express.Response, next: express.NextFunction) {
  logger.debug('>> ensureAuthenticated');
  logger.debug('headers:', req.headers);
  if (logger.debug.toString() !== 'function (){}') {
    logger.debug('req.isAuthenticated():', req.isAuthenticated());
    logger.debug('req.session:', (<any>req).session);
  }
  ensureLogin.ensureLoggedIn(_loginPath)(req, res, function (err: any): void {
    logger.debug('not redirected to login.html!');
    if (!req.isAuthenticated()) {
      logger.error('Assertion failed: user is NOT authenticated!');
      return;
    }
    return next(err);
  });
  logger.debug('<< ensureAuthenticated');
}

export function checkAuthenticated(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.isAuthenticated()) {
    return res.sendStatus(401);
  } else {
    return next(null);
  }
}

function consumeRememberMeToken(token: string, fn: (err: Error, value: string) => void) {
  logger.debug('consuming token!');
  // invalidate the single-use token
  // We do this asynchronously, to let all concurrent requests
  // still find the token.
  setTimeout(function () {
    _tokenMgr.deleteToken(token, function (err: Error) { });
  }, 5000);
  return _tokenMgr.getToken(token, fn);
}

function saveRememberMeToken(token: string, uid: User, fn: (err?: Error) => void) {
  return _tokenMgr.setToken(token, uid.id, function (err: Error) {
    return fn();
  });
}

function issueToken(user: User, done: (err: Error, token?: string) => void) {
  logger.debug('issuing token!');
  var token = _tokenMgr.createToken();
  saveRememberMeToken(token, user, function (err) {
    if (err) { return done(err); }
    return done(null, token);
  });
}

export function socketIoAuthorize(): (socket: socketio.Socket, next: (err?: any) => void) => void {
  return (socket, next) => {
    console.log('socketIoAuthorize')
    //console.log('data=', socket.request)

    let req = socket.request as express.Request;
    let response: express.Response;

    passport.initialize()(req, response, (err?: any) => {
      authenticateBasicAndApiKey(req, response, (err?) => {
        if (req.isAuthenticated()) return next();
        return passportSocketIo.authorize({
          secret: getSecrets(),
          store: _store,
        })(socket, next);
      });
    });
  }
}

// the secrets passed to express-session
let secrets: string[] = [];

const SECRETS_FILE = './sessions/secrets';

function rollSecrets() {
  // generate a uuid
  const newsecret = uuidv4();

  // get existing secrets
  const now = new Date;
  const limitDate = new Date(
    now.getFullYear() - 5, now.getMonth(), now.getDate(),
    now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()
  );

  const existingSecrets: { date: Date, id: string }[] = fs.existsSync(SECRETS_FILE) ? fs.readFileSync(SECRETS_FILE).toString().split('\n').map(line => {
    return {
      date: new Date(line.substr(0, 24)),
      id: line.replace(/\r$/, '').substr(25)
    }
  }).filter( // filter to keep only 5 year old max sessions
    v => v.date > limitDate
  ) : [];

  // write secrets file
  fs.writeFileSync(SECRETS_FILE, (new Date()).toISOString() + " " + newsecret + "\n"
    + existingSecrets.map(v => v.date.toISOString() + " " + v.id + "\n").join(''));
  fs.chmodSync(SECRETS_FILE, '600'); // rw-------
}

function loadSecrets() {
  secrets.length = 0;

  // format: 2021-11-14T19:43:01.050Z <uid>
  fs.readFileSync(SECRETS_FILE).toString().split('\n').forEach(line => {
    const secret = line.replace(/\r$/, '').substr(25);
    if (secret !== '') secrets.push(secret);
  });
}

let rollNewSecretJob: NodeJS.Timeout;

function getSecrets() {
  if (secrets.length === 0) {
    rollSecrets();
    loadSecrets();
  }
  if (!rollNewSecretJob) {
    // roll a new secret every month
    rollNewSecretJob = setInterval(() => {
      rollSecrets();
      loadSecrets();
    }, 30 * 24 * 60 * 1000);
  }
  return secrets;
}

function authenticateBasicAndApiKey(req: express.Request, res: express.Response, next: (err?: any) => void) {
  passport.authenticate('basic', { session: false }, function (err, user, info) {
    // test with:
    // curl 'http://192.168.0.10:4001/devices/aquarium.pompes' -u hb:hbpassword01 -H 'Accept: application/json, text/plain, */*' -H 'Referer: http://raspberrypi:8100/' -H 'Origin: http://raspberrypi:8100' --compressed 
    logger.debug('Authentication with basic', err, user, info);
    if (!err && user) {
      logger.debug('Authenticated with basic');
      return req.logIn(user, next);
    }

    passport.authenticate('headerapikey', function (err, user, info) {
      // test with:
      // curl 'http://192.168.0.10:4001/devices/aquarium.pompes' -H "Authorization: Api-Key qdpofiqdlfkj" -H 'Accept: application/json, text/plain, */*' -H 'Referer: http://raspberrypi:8100/' -H 'Origin: http://raspberrypi:8100' --compressed 
      logger.debug('Authentication with api key', err, user, info);
      if (!err && user) {
        logger.debug('Authenticated with api key');
        return req.logIn(user, next);
      }

      logger.debug('Not authenticated yet');
      return next();
    })(req, res, next);
  })(req, res, next);
}