import * as fs from 'fs';
const configFileDir = fs.mkdtempSync('/tmp/ConfigDir.');
const configFile = configFileDir + '/file1';
let configFileStream: fs.WriteStream;

import * as assert from 'assert';

import { DomojaServer } from '../server';

describe('Module domoja', function () {
  describe('With config directory', function () {
    let d: DomojaServer;

    before(function (done) {
      this.timeout(10000);
      d = new DomojaServer(0, false, false, () => {
        d.loadConfig(configFileDir, done);
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
      d.reloadConfig = (callback) => {
        done();
        d.reloadConfig = (cb) => { console.warn('reload config called????'); cb(null); };
        callback(null);
      };
      setTimeout(() => {
        action();
      }, 1000);
      test.timeout(test.timeout() + 5000 + 2000 + 1000);
    }
    it('should reload config dir if file added', function (done) {
      planAction(this, done, () => configFileStream = fs.createWriteStream(configFile));
    });
    it('should reload config dir if file modified', function (done) {
      planAction(this, done, () => configFileStream.end('\n'));
    });
    it('should reload config dir if file deleted', function (done) {
      planAction(this, done, () => fs.unlinkSync(configFile));
    });
  });
});
