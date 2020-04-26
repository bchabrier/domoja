process.argv.push("--args")
process.argv.push("unexistent file")

import * as domoja from '../domoja';
import * as assert from 'assert';
import * as child_process from 'child_process';

describe('Module domoja', function () {
  it('should exit', function (done) {
    this.timeout(15000);
    assert.notEqual(domoja, null);
    child_process.exec("./node_modules/ts-node/dist/bin.js domoja.ts unexistent_file", (err, stdout, stderr) => {
      assert.notEqual(stderr.match(/Cannot open configuration 'unexistent_file'. Exiting.../), null, "Does not contain \"Cannot open configuration 'unexistent_file'. Exiting...\"");
      done(err);
    });
  });
});

