import * as locationMgr from '../core/managers/locationMgr';
import * as assert from 'assert';

describe('Module locationMgr', function () {
  describe('function getLocations', function () {

    it('should return the locations', function () {
      assert.deepEqual(locationMgr.getLocations(), { '1': 'Maison' })
    });

  });

  describe('function getLocation', function () {

    it('should return the location from an id', function () {
      assert.equal(locationMgr.getLocation('1'), 'Maison');
    });

  });

});


