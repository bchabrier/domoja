/*
import rewire = require('rewire');
import * as ToMock from '../core/sources/source'
let RewireToMock = rewire('../core/sources/source')
const sourceModule: typeof ToMock & typeof RewireToMock = <any>RewireToMock
type Source = ToMock.Source;
*/

var assert = require("assert");
import { Source, Parameters, ConfigLoader, InitObject, GenericDevice } from '..';
import { device } from '../core/devices/device';

describe('Module sources', function () {
  describe('class Source', function () {

    class derivedSource extends Source {
      createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): Source {
        return new derivedSource();
      }
      getParameters(): Parameters {
        return {
          param1: 'REQUIRED'
        };
      }
      setAttribute(device: GenericDevice, attribute: string, value: string, callback: (err: Error) => void): void {
        // do nothing
        callback(null);
      }
      specificMethod() { }
    }

    describe('#createInstance', function () {
      it('should be "static"', function () {
        let source: Source = derivedSource.prototype.createInstance(null, null, null);
        assert(source);
        source.release();
      });

      it('should return a derived source', function () {
        let source: Source = derivedSource.prototype.createInstance(null, null, null);
        assert(source);
        (source as derivedSource).specificMethod(); // should not generate an error
        source.release();
      });
    });

    describe('#release', function () {
      it('should release the object', function () {
        let source: Source = derivedSource.prototype.createInstance(null, null, null);
        assert(source);
        assert.deepEqual(source['devices'], []);
        source.release();
        assert.deepEqual(source['devices'], null);
        Object.keys(source).forEach(element => {
          assert.equal((source as any)[element], null);
        });
      });
    });

    describe('#getParameters', function () {
      it('should return the parameters of the derived source', function () {
        let source: Source = derivedSource.prototype.createInstance(null, null, null);
        assert(source);
        let parameters = source.getParameters();
        assert.deepEqual(parameters, { param1: 'REQUIRED' });
        source.release();
      });
    });

    describe('#setAttribute', function () {
      it('should call the callback at the end', function (done) {
        let source: Source = derivedSource.prototype.createInstance(null, null, null);
        assert(source);
        source.setAttribute(null, null, null, done)
        source.release();
      });
    });

    describe('#releaseDevice', function () {
      it('should release a device', function () {
        let source: Source = derivedSource.prototype.createInstance(null, null, null);
        assert(source);

        let dev1 = new device(source, 'Device 1', null, null);
        let dev2 = new device(source, 'Device 2', null, null);
        let dev3 = new device(source, 'Device 3', null, null);
        let dev4 = new device(source, 'Device 4', null, null);
        assert.deepEqual(source['devices'], [dev1, dev2, dev3, dev4]);
        source.releaseDevice(dev2);
        assert.deepEqual(source['devices'], [dev1, dev3, dev4]);
        source.release();
      });
    });

    describe('#setDeviceState', function () {
      it('should set the state of a device', function () {
        let source: Source = derivedSource.prototype.createInstance(null, null, null);
        assert(source);

        let dev = new device(source, 'Device', null, null);
        source.setDeviceState('Device', 'a state');

        source.release();
      });
    });
  });
});


