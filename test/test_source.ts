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
      createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
        return new derivedSource(path);
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
        assert.deepEqual(source['devicesByPath'], {});
        assert.deepEqual(source['devicesByAttribute'], {});
        source.release();
        assert.deepEqual(source['devicesByPath'], null);
        assert.deepEqual(source['devicesByAttribute'], null);
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

        let dev1 = new device(source, 'Device 1', 'id1', 'attrA', null);
        let dev2 = new device(source, 'Device 2', 'id2', 'attrA', null);
        let dev3 = new device(source, 'Device 3', 'id3', 'attrB', null);
        let dev4 = new device(source, 'Device 4', 'id4', 'attrB', null);
        assert.deepEqual(source['devicesByPath'], {
          'Device 1': dev1,
          'Device 2': dev2,
          'Device 3': dev3,
          'Device 4': dev4
        });
        assert.deepEqual(source['devicesByAttribute'], {
          'attrA': {
            'id1': dev1,
            'id2': dev2,
          },
          'attrB': {
            'id3': dev3,
            'id4': dev4,
          },
        });
        source.releaseDevice(dev2);
        assert.deepEqual(source['devicesByPath'], {
          'Device 1': dev1,
          'Device 3': dev3,
          'Device 4': dev4
        });
        assert.deepEqual(source['devicesByAttribute'], {
          'attrA': {
            'id1': dev1,
          },
          'attrB': {
            'id3': dev3,
            'id4': dev4,
          },
        });
        source.release();
      });
    });

    describe('#setDeviceState', function () {
      it('should set the state of a device', function () {
        let source: Source = derivedSource.prototype.createInstance(null, null, null);
        assert(source);

        let dev = new device(source, 'Device', 'id', null, null);
        source.setDeviceState(dev.id, 'a state');
        assert.equal(dev.getState(), 'a state');
        source.release();
      });
    });
  });
});


