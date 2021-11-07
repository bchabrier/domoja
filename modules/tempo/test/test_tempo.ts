/*
import rewire = require('rewire');
import * as ToMock from '../core/sources/source'
let RewireToMock = rewire('../core/sources/source')
const sourceModule: typeof ToMock & typeof RewireToMock = <any>RewireToMock
type Source = ToMock.Source;
*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { tempo } from '../sources/tempo';

describe('Module tempo', function () {
  describe('class tempo', function () {

    this.timeout(10000);
    
    describe('#doSetAttribute', function () {
      it('should return an error', function (done) {
        let a = new tempo('Path');
        a.doSetAttribute('an id', 'an attribute', 'a value', (err) => {
          assert.notEqual(err, null);
          assert.equal(err.message, 'Device "an id" does not support attribute/value "an attribute/a value"');
          done();
        });
      });
    });

    describe('#Update', function () {
      it('should update without error', function (done) {
        if (process.env.GITHUB_ACTIONS === "true") {
          this.skip();
        }

        let idTab: string[] = [];
        let a = new tempo('Path');
        let origUpdateAttribute = a.updateAttribute;
        a.updateAttribute = (id: string, attribute: string, value: string, lastUpdateDate?: Date) => {
          origUpdateAttribute.call(a, id, attribute, value, lastUpdateDate);
          if (idTab.indexOf(id) == -1) idTab.push(id);
          assert.equal(attribute, "state");
          if (id == "couleurDuJour") {
            assert.notEqual(['Bleu', 'Blanc', 'Rouge'].indexOf(value), -1, 'Expected value: Bleu | Rouge | Blanc');
          }
        }
        a.Update((err) => {
          assert.equal(err, null);
          assert.deepEqual(idTab.sort(), ['couleurDeDemain', 'couleurDuJour', 'lastUpdateDate']
          );
          done();
        });
      });
      it('should provide undetermined colors if in the future', function (done) {
        if (process.env.GITHUB_ACTIONS === "true") {
          this.skip();
        }
        let clock = sinon.useFakeTimers(Date.now() + 10 * 24 * 60 * 60 * 1000); // now + 10 days
        let idTab: string[] = [];
        let a = new tempo('Path');
        let origUpdateAttribute = a.updateAttribute;
        a.updateAttribute = (id: string, attribute: string, value: string, lastUpdateDate?: Date) => {
          origUpdateAttribute.call(a, id, attribute, value, lastUpdateDate);
          if (idTab.indexOf(id) == -1) idTab.push(id);
          if (attribute != "state") clock.restore();
          assert.equal(attribute, "state");
          if (id == "couleurDuJour" && value != "Indéterminé") clock.restore();
          if (id == "couleurDuJour") assert.equal(value, "Indéterminé")
          if (id == "couleurDeDemain" && value != "Indéterminé") clock.restore();
          if (id == "couleurDeDemain") assert.equal(value, "Indéterminé")
        }
        a.Update((err) => {
          clock.restore();
          assert.equal(err, null);
          done();
        });
      });
    });

    describe('#RetryUpdate', function () {
      this.timeout(5000);

      it('should do only one call if no error', function (done) {
        let a = new tempo('Path');
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

        let a = new tempo('Path');
        // tick to 1h + 5 mn to trigger the update of tomorrow colors
        clock.tick(65 * 1000 + 10);
        let countCalls = 0;
        a.Update = function (callback: (err: Error) => void): void {
          countCalls++;
          if (countCalls == 3) {
            callback(null);
          } else {
            realSetTimeout(() => clock.tick(10 * 60 * 1000 + 10), 50);
            callback(new Error('Should retry...'));
          }
        }

        a.RetryUpdate((err) => {
          clock.restore();
          assert.equal(err, null);
          assert.equal(countCalls, 3);
          done();
        });
      });
    });

  });
});


