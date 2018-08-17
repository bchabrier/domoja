import { Source } from '../sources/source';
import * as events from 'events';
import { IVerifyOptions } from 'passport-local';

const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

type presence = { [location: string]: boolean };

export class User {
  private mgr: UserMgr;

  id: string;
  login: string;
  password: string;
  name: string;
  initials: string;
  phone: string;
  macaddress: string;
  presence: presence;
  avatar: string;

  constructor(name: string, initials: string, phone: string, macaddress: string, avatar: string) {
    this.name = name;
    this.initials = initials;
    this.phone = phone;
    this.macaddress = macaddress;
    this.presence = {};
    this.avatar = avatar;
  }

  setPresence(locationId: string, presence: boolean): void {
    if (this.presence[locationId] != presence) {
      this.presence[locationId] = presence;
      this.mgr || console.log('this.mgr null')
      this.mgr && this.mgr.emit('presencechange', {
        user: this,
        locationId: locationId,
        newValue: presence
      });
    }
  }

  getPresence(locationId?: string): boolean | presence {
    if (locationId) {
      return (this.presence[locationId]);
    } else {
      return this.presence;
    }
  }
}

function transform(s: string, t: (c: string) => string): string {
  if (!s) return s;

  let tab: string[] = []

  for (let i = 0; i < s.length; i++) {
    tab.push(t(s.charAt(i)))
  }
  return tab.join('')
}

function encode(s: string): string {
  return transform(s, function (c: string) {
    return String.fromCharCode((c.charCodeAt(0) + 3) * 2)
  })
}

function decode(s: string): string {
  return transform(s, function (c: string) {
    return String.fromCharCode(c.charCodeAt(0) / 2 - 3)
  })
}

export class UserMgr extends events.EventEmitter {
  users: { [x: string]: User } = {};

  addUser(user: User, done?: (err: Error, user: User) => void) {
    let self = this;
    this.findUserById(user.id, (err, u) => {
      if (u) {
        logger.warn("Cannot add user '%s': user with id '%s' already exists.", user.login, user.id);
        done && done(null, null);
      } else {
        for (let k in user) {
          let val = (<any>user)[k];

          switch (k) {
            case "password":
              val = encode(val);
              (<any>user)[k] = val;
              break;
            default:
          }
        }
        user["mgr"] = self;
        this.users[user.id] = user;
        done && done(null, user);
      }
    });
  }

  getUsers(): { [x: string]: User } {
    return this.users;
  };

  getUser(id: string): User {
    return this.users[id];
  };

  nbUsers(): number {
    return Object.keys(this.users).length
  };

  getPresentUsers(locationId: string): { [x: string]: User } {
    var presentUsers: { [x: string]: User } = {};

    for (var u in this.users) {
      if (this.users[u].getPresence(locationId)) {
        presentUsers[u] = this.users[u];
      }
    }
    return presentUsers;
  };


  checkUser(username: string, password: string, done: (error: any, user?: any, options?: IVerifyOptions) => void) {
    logger.debug('Checking user "%s"...', username);
    for (let k in this.users) {
      let u = this.users[k];
      console.log(k, "=>", u)
      logger.debug('Checking user "%s" vs "%s"...', username, u.login);
      if (username === u.login && encode(password) === u.password) {
        logger.debug('User check passed!');
        return done(null, u);
      }
    }
    logger.debug('No check passed for user "%s"!', username);
    return done(null, false);

  }

  findUserById(id: string, fn: (err: Error, user: User) => void) {
    logger.debug('finding user by id =', id);
    if (this.users[id]) {
      logger.debug('found user', this.users[id].login)
      return fn(null, this.users[id]);
    }
    logger.debug('found no user with id =', id)
    return fn(null, null);
  }

  clearUsers() {
    for (let k in this.users) {
      let u = this.users[k];
      u["mgr"] = undefined;
    }
    this.users = {};
  }
}
