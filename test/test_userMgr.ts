import rewire = require('rewire');
import * as ToMock from '../managers/userMgr'
let RewireToMock = rewire('../managers/userMgr')
const userMgrModule: typeof ToMock & typeof RewireToMock = <any>RewireToMock
let User = userMgrModule.User;
type User = ToMock.User;
const  userMgr = new userMgrModule.UserMgr;

var assert = require("assert");
var locationMgr = require('../managers/locationMgr');

describe('Module userMgr', function () {
  describe('class user', function () {
    let u: User;
    before(function () {
      u = new User('a name', 'some initials', 'a phone number', 'a phone mac', 'an avatar');
      userMgr.addUser(u);
    });
    describe('#user(name, initials, phone, mac)', function () {
      it('should create a user with name, initials, phone and macaddress', function () {
        assert.equal(u.name, 'a name');
        assert.equal(u.initials, 'some initials');
        assert.equal(u.phone, 'a phone number');
        assert.equal(u.macaddress, 'a phone mac');
        assert.equal(u.avatar, 'an avatar');
      });
    });
    describe('#setPresence(locationId, bool)', function () {
      it('should set the presence for locationId', function () {
        u.setPresence('1', true);
        assert.equal(u.presence['1'], true);
      });
      it('should emit a presencechange event when the presence changes', function (done) {
        u.setPresence('1', true);
        userMgr.on('presencechange', function (evt) {
          assert.deepEqual(evt.user, u);
          assert.equal(evt.locationId, '1');
          assert.equal(evt.newValue, false);
          userMgr.removeAllListeners('presencechange');
          done();
        });
        u.setPresence('1', false);
      });
      it('should not emit a presencechange event when the presence does not change', function (done) {
        u.setPresence('1', true);
        userMgr.on('presencechange', function (evt) {
          if (evt.newValue == true) {
            assert.fail(undefined, undefined, 'presencechanged was emitted');
          } else {
            done();
          }
        });
        u.setPresence('1', true);
        u.setPresence('1', false);
        userMgr.removeAllListeners('presencechange');
      });
    });
    describe('#getPresence(locationId)', function () {
      it('should return the presence for locationId', function () {
        u.setPresence('2', true);
        assert.equal(u.getPresence('2'), true);
        u.setPresence('3', false);
        assert.equal(u.getPresence('3'), false);
      });
      it('should return undefined if not known', function () {
        assert.equal(u.getPresence('9999'), undefined);
      });
      it('should return the list of presences if no location specified', function () {
        u.setPresence('1', true);
        u.setPresence('2', true);
        u.setPresence('3', false);
        u.setPresence('4', true);
        u.setPresence('5', false);
        let presences = u.getPresence();
        assert.equal(presences['1'], true);
        assert.equal(presences['2'], true);
        assert.equal(presences['3'], false);
        assert.equal(presences['4'], true);
        assert.equal(presences['5'], false);
      });
    });
  });
  describe('#getUsers()', function () {
    it('should return the list of users', function () {
      let u = new User("name", "initials", "phone", "macaddress", "avatar");
      u.id = (userMgr.nbUsers()+1).toString();
      userMgr.addUser(u);
      var users = userMgr.getUsers();
      var nbUsers = 0;
      for (let user in users) {
        nbUsers++;
      }
      assert.notEqual(nbUsers, 0);
    });
    it('should return users with name and phone', function () {
      let u = new User("name", "initials", "phone", "macaddress", "avatar");
      u.id = (userMgr.nbUsers()+1).toString();
      userMgr.addUser(u);
      var users = userMgr.getUsers();
      var nbUsers = 0;
      for (let u in users) {
        nbUsers++;
        assert.notEqual(users[u].name, undefined);
        assert.notEqual(users[u].phone, undefined);
      }
      assert.notEqual(nbUsers, 0);
    });
  });
  describe('#getUser(id)', function () {
    it('should return the associated user', function () {
      var users = userMgr.getUsers();
      for (let u in users) {
        var user = users[u];
        assert.deepStrictEqual(user, userMgr.getUser(u));
      }
    });
    it('should return undefined if unknown user id', function () {
      assert.equal(userMgr.getUser('an unknown id'), undefined);
    });
  });
  describe('#nbUsers()', function () {
    it('should return the number of users', function () {

      var users = userMgr.getUsers();

      // count users
      var count = 0;
      for (var u in users) {
        count++;
      };

      assert.equal(userMgr.nbUsers(), count);
    });
  });
  describe('#getPresentUsers(locationId)', function () {
    it('should return the list of users present at locationId', function () {

      let u = new User("name", "initials", "phone", "macaddress", "avatar");
      u.id = (userMgr.nbUsers()+1).toString();
      userMgr.addUser(u);

      // assume we have some users
      assert.notEqual(userMgr.nbUsers(), 0);

      // find a location
      var location;
      for (location in locationMgr.getLocations()) {
        break;
      }

      // assume we have a location
      assert.notEqual(location, undefined);


      //remove them all from first location
      for (let u in userMgr.getUsers()) {
        userMgr.getUser(u).setPresence(location, false);
      };

      assert.deepEqual(userMgr.getPresentUsers(location), {});

      //add one in first location
      for (let u in userMgr.getUsers()) {
        userMgr.getUser(u).setPresence(location, true);
        var presentUsers = {};
        presentUsers[u] = userMgr.getUser(u);
        assert.deepEqual(userMgr.getPresentUsers(location), presentUsers);
        break;
      };

      // put them all in first location
      for (let u in userMgr.getUsers()) {
        userMgr.getUser(u).setPresence(location, true);
      };

      assert.deepEqual(userMgr.getPresentUsers(location), userMgr.getUsers());

    });
  });
  describe('#addUser(user)', function () {
    it('should add a user', function (done) {
      let u = new User("name", "initials", "phone", "macaddress", "avatar");
      u.id = '1';
      let n = userMgr.nbUsers();
      let np1 = (n + 1).toString();
      u.id = np1;
      userMgr.addUser(u, (err, user) => {
        assert.equal(userMgr.nbUsers(), n + 1)
        done(err)
      });
    });
    it('should encode the password', function (done) {
      let u = new User("name", "initials", "phone", "macaddress", "avatar");
      u.password = "clear password"
      let n = userMgr.nbUsers();
      let np1 = (n + 1).toString();
      u.id = np1;
      userMgr.addUser(u, (err, user) => {
        assert.equal(userMgr.getUser(np1).name, "name")
        assert.notEqual(userMgr.getUser(np1).password, "clear password")
        done(err)
      });
    });
  });
});


