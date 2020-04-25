/*
import rewire = require('rewire');
import * as ToMock from '../core/sources/source'
let RewireToMock = rewire('../core/sources/source')
const sourceModule: typeof ToMock & typeof RewireToMock = <any>RewireToMock
type Source = ToMock.Source;
*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { astronomy } from '../sources/astronomy';

describe('Module proxity', function () {
  describe('class astronomy', function () {

    describe('#doSetAttribute', function () {
      it('should return an error', function (done) {
        let a = new astronomy('Path', "06030");
        a.doSetAttribute('an id', 'an attribute', 'a value', (err) => {
          assert.notEqual(err, null);
          assert.equal(err.message, 'Device "an id" does not support attribute/value "an attribute/a value"');
          done();
        });
      });
    });

    describe('#Update', function () {
      it('should not return an error for location 06030', function (done) {
        let a = new astronomy('Path', "06030");
        a.Update((err) => {
          assert.equal(err, null);
          done();
        });
      });
      it('should return an error for location WRONG_LOCATION', function (done) {
        let a = new astronomy('Path', "WRONG_LOCATION");
        a.Update((err) => {
          assert.notEqual(err, null);
          const errMsg = "Couldn't find headers in:";
          assert.equal(err.message.substr(0, errMsg.length), errMsg)
          done();
        });
      });
    });

    describe('#RetryUpdate', function () {
      it('should do only one call if no error', function (done) {
        let a = new astronomy('Path', "06030");
        let countCalls = 0;
        a.Update = function (callback: (err: Error) => void): void {
          countCalls++;
          callback(null);
        }
        a.RetryUpdate((err) => {
          assert.equal(err, null);
          assert.equal(countCalls, 1);
          done();
        });
      });
      it('should do more than one call if error', function (done) {
        let realSetTimeout = setTimeout;
        let clock = sinon.useFakeTimers();

        after(function () {
          clock.restore();
        });

        let a = new astronomy('Path', "06030");
        let countCalls = 0;
        a.Update = function (callback: (err: Error) => void): void {
          countCalls++;
          if (countCalls == 2) {
            callback(null);
          } else {
            realSetTimeout(() => clock.tick(10 * 60 * 1000 + 10), 50);
            callback(new Error('Should retry...'));
          }
        }

        a.RetryUpdate((err) => {
          assert.equal(err, null);
          assert.equal(countCalls, 2);
          done();
        });
      });
    });

  });
});


