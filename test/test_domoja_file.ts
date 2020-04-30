import * as fs from 'fs';

import * as assert from 'assert';


import rewire = require('rewire');
import * as ToMock from '../server';

import { DomojaServer } from '../server';

describe('Module domoja', function () {
  describe('With config file', function () {
    const configFile = '/tmp/configFile.' + process.pid;
    let configFileStream = fs.createWriteStream(configFile);

    let d: DomojaServer;

    before(function (done) {
      this.timeout(10000);
      d = new DomojaServer(0, false, false, () => {
        d.loadConfig(configFile);
        done();
      });
    });
    after(function (done) {
      d.close(() => {
        fs.unlinkSync(configFile);
        done();
      });
    });
    function planAction(test: Mocha.Context, done: Mocha.Done, action: () => void) {
      d.reloadConfig = () => {
        done();
        d.reloadConfig = () => { console.warn('reload config called????') };
      };
      setTimeout(() => {
        action();
      }, 1000);
      test.timeout(test.timeout() + 5000 + 2000 + 1000);
    }

    it('should reload config when config file changes', function (done) {
      planAction(this, done, () => configFileStream.end('\n'));
    });
  });
});

