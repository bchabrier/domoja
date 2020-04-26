import * as fs from 'fs';
const configFileDir = fs.mkdtempSync('/tmp/ConfigDir.');
const configFile = configFileDir + '/file1';
let configFileStream: fs.WriteStream;

import * as assert from 'assert';

import rewire = require('rewire');
let sampleRewireToMock = rewire('rewire');
import * as ToMock from '../domoja';
assert.notEqual(ToMock, null); // force load of orginal domoja
let RewireToMock: typeof sampleRewireToMock;
let domoja: typeof ToMock & typeof RewireToMock;
let DomojaServer: new (port: Number, prod: boolean, ssl: boolean, listeningCallback?: () => void) => any;


describe('Module domoja', function () {
  describe('With config directory', function () {
    let d: any;

    before(function (done) {
      process.argv.push('--args');
      process.argv.push(configFileDir);
      RewireToMock = rewire('../domoja');
      domoja = <any>RewireToMock;
      DomojaServer = domoja.__get__('DomojaServer');
      this.timeout(10000);
      d = new DomojaServer(0, false, false, () => {
        d.loadConfig(configFileDir);
        done();
      });
    });
    after(function (done) {
      process.argv.pop();
      process.argv.pop();
      d.close(() => {
        if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
        fs.rmdirSync(configFileDir);
        done();
      });
    });
    function planAction(test: Mocha.Context, done: Mocha.Done, action: () => void) {
      domoja.__set__('DomojaServer.prototype.reloadConfig', () => {
        //console.log('reloadConfig called');
        done();
        domoja.__set__('DomojaServer.prototype.reloadConfig', () => { });
      });
      setTimeout(() => {
        action();
      }, 1000);
      test.timeout(test.timeout() + 5000 + 2000 + 1000);
    }
    it('should reload config dir if file added', function (done) {
      planAction(this, done, () => configFileStream = fs.createWriteStream(configFile));

      assert.notEqual(domoja, null);
    });
    it('should reload config dir if file modified', function (done) {
      planAction(this, done, () => configFileStream.end('\n'));

      assert.notEqual(domoja, null);
    });
    it('should reload config dir if file deleted', function (done) {
      planAction(this, done, () => fs.unlinkSync(configFile));

      assert.notEqual(domoja, null);
    });
  });
});
