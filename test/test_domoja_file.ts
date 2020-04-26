import * as fs from 'fs';
const configFile = '/tmp/configFile.' + process.pid;

let configFileStream = fs.createWriteStream(configFile);

import * as assert from 'assert';


import rewire = require('rewire');
let sampleRewireToMock = rewire('rewire');
import * as ToMock from '../domoja';
assert.notEqual(ToMock, null); // force load of orginal domoja
let RewireToMock: typeof sampleRewireToMock;
let domoja: typeof ToMock & typeof RewireToMock;
let DomojaServer: new (port: Number, prod: boolean, ssl: boolean, listeningCallback?: () => void) => any;

//import * as domoja from '../domoja';

describe('Module domoja', function () {
  describe('With config file', function () {
    let d: any;

    before(function (done) {
      process.argv.push('--args');
      process.argv.push(configFile);
      RewireToMock = rewire('../domoja');
      domoja = <any>RewireToMock;
      DomojaServer = domoja.__get__('DomojaServer');
      this.timeout(10000);
      d = new DomojaServer(0, false, false, () => {
        // wait a little to make sure fsmonitor activates
        d.loadConfig(configFile);
        done();
      });
    });
    after(function (done) {
      process.argv.pop();
      process.argv.pop();
      d.close(() => {
        fs.unlinkSync(configFile);
        done();
      });
    });
    function planAction(test: Mocha.Context, done: Mocha.Done, action: () => void) {
      domoja.__set__('DomojaServer.prototype.reloadConfig', () => {
        //console.log('reloadConfig called');
        done();
        domoja.__set__('DomojaServer.prototype.reloadConfig', () => { console.warn('reload config called????') });
      });
      setTimeout(() => {
        action();
      }, 1000);
      test.timeout(test.timeout() + 5000 + 2000 + 1000);
    }

    it('should reload config when config file changes', function (done) {
      planAction(this, done, () => configFileStream.end('\n'));
      assert.notEqual(domoja, null);
    });
  });
});

