import * as assert from 'assert';

import * as child_process from 'child_process';

describe('Module domoja', function () {
  describe('With non existent config file', function () {

    before(function () {
      this.timeout(10000);
      // let's simulate an unexistent config file as argument in order to go through the code, for the coverage
      process.argv.push('--args');
      process.argv.push('unexistent_file');
      console.log("Simulated execution (through require):")
      require('../domoja');
    });
    after(function () {
      process.argv.pop();
      process.argv.pop();
    });
    it('should exit', function (done) {
      this.timeout(120000);
      console.log("Real execution (through subprocess):")
      child_process.exec("./node_modules/ts-node/dist/bin.js domoja.ts unexistent_file", (err, stdout, stderr) => {
        console.log(stdout);
        console.error(stderr);
        assert.notEqual(stderr.match(/Cannot open configuration 'unexistent_file'. Exiting.../), null, "Does not contain \"Cannot open configuration 'unexistent_file'. Exiting...\"");
        done(err);
      });
    });
  });
});

