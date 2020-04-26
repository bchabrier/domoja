import * as assert from 'assert';

import rewire = require('rewire');
let sampleRewireToMock = rewire('rewire');
import * as ToMock from '../domoja';
assert.notEqual(ToMock, null); // force load of orginal domoja
let RewireToMock: typeof sampleRewireToMock;
let domoja: typeof ToMock & typeof RewireToMock;
let DomojaServer: new (port: Number, prod: boolean, ssl: boolean, listeningCallback?: () => void) => any;

import * as child_process from 'child_process';

describe('Module domoja', function () {
  describe('With non existent config file', function () {
    before(function (done) {
      process.argv.push('--args');
      process.argv.push('unexistent_file');
      RewireToMock = rewire('../domoja');
      domoja = <any>RewireToMock;
      DomojaServer = domoja.__get__('DomojaServer');
      assert.notEqual(domoja, null); // force load of domoja 
      let server = new DomojaServer(null, false, false, () => {
        //server.loadConfig('unexistent_file');
        done();
      });
    });
    after(function () {
      process.argv.pop();
      process.argv.pop();
    });
    it('should exit', function (done) {
      this.timeout(30000);
      child_process.exec("./node_modules/ts-node/dist/bin.js domoja.ts unexistent_file", (err, stdout, stderr) => {
        console.log(stdout);
        console.error(stderr);
        assert.notEqual(stderr.match(/Cannot open configuration 'unexistent_file'. Exiting.../), null, "Does not contain \"Cannot open configuration 'unexistent_file'. Exiting...\"");
        done(err);
      });
    });
  });
});

