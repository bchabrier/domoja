import 'mocha';
import rewire = require('rewire')
import * as ToMock from '../core/lib/load'

let RewireToMock = rewire('../core/lib/load')
const grammar: typeof ToMock & typeof RewireToMock = <any>RewireToMock

import assert = require('assert');
import async = require('async');
import fs = require('fs');

//import * as zibase from '../sources/zibase';

// hack to get the doc type
let d = false ? grammar.loadFileSync("") : undefined;
type doc = typeof d;

function passToSandbox(done: MochaDone) {
    grammar.__set__('sandbox.done', function <T>(old: T, val: T) {
        done();
    });
}

describe('Module load', function () {
    this.timeout(5000);

    let doc: doc = null;

    afterEach('Release document', function (done) {
        //console.log('aftereach...')
        async.map(doc && doc.sources, (s, callback) => {
            /*
            if (s.source instanceof zibase.Zibase) {
                //console.log("found zibase...")
                let z = <zibase.Zibase>s.source

                z.on("message", function () {
                    //console.log("got message...")
                    callback();
                });
            } else {
                */
            callback();
            /*
        }
        */
        }, () => {
            //console.log("all zibases got messages")
            if (doc) doc.release();
            doc = null;
            done();
        });

    });
    describe('#imports', function () {
        it("should load a source", function () {
            doc = grammar.loadFileSync('./test/load/imports/source.yml');
            assert.notEqual(doc, null);
        });
        it("should load device", function () {
            doc = grammar.loadFileSync('./test/load/imports/device.yml');
            assert.notEqual(doc, null);
        });
        it("should load several devices and sources", function () {
            doc = grammar.loadFileSync('./test/load/imports/several.yml');
            assert.notEqual(doc, null);
        });
        it("should load a commented section", function () {
            doc = grammar.loadFileSync('./test/load/imports/comments.yml');
            assert.notEqual(doc, null);
        });
        it("should reject a duplicate import", function () {
            assert.throws(function () {
                doc = grammar.loadFileSync('./test/load/imports/duplicate.yml');
            }, function (err: Error) {
                assert.ok(/Expected not "fakeSource" \(duplicate source\)/.test(err.message))
                return true;
            });
        });
    });
    describe('#sources', function () {
        it("should load a simple source", function () {
            doc = grammar.loadFileSync('./test/load/sources/simpleSource.yml');
            assert.notEqual(doc, null);
            assert.ok(doc.sources['simpleSource'])
        });
        it("should load two sources", function () {
            doc = grammar.loadFileSync('./test/load/sources/doubleSource.yml');
            assert.notEqual(doc, null);
        });
        it("should reject an unexpected attribute", function () {
            assert.throws(function () {
                doc = grammar.loadFileSync('./test/load/sources/unexpectedAttribute.yml');
            }, Error);
        });
        it("should reject a duplicate source", function () {
            assert.throws(function () {
                doc = grammar.loadFileSync('./test/load/sources/duplicateSource.yml');
            }, Error);
        });
    });
    describe('#secrets', function () {
        it("should load a secret file", function () {
            doc = grammar.loadFileSync('./test/load/secrets/secretSource.yml');
            assert.notEqual(doc, null);
            assert.ok(doc.sources['secretSource'])
            assert.equal(doc.sources['secretSource'].object['secret-parameter'], '!secrets key1');
            assert.equal(doc.sources['secretSource'].object['public-parameter'], 'publicValue');
            assert.equal((<any>doc.sources['secretSource'].source).publicParameter, 'publicValue');
            assert.equal((<any>doc.sources['secretSource'].source).secretParameter, 'secretvalue1');
        });
        it("should warn on an undefined secret key", function () {
            doc = grammar.loadFileSync('./test/load/secrets/undefinedSecret.yml');
            assert.notEqual(doc, null);
            assert.ok(doc.sources['secretSource'])
            assert.equal(doc.sources['secretSource'].object['secret-parameter'], '!secrets undefinedKey');
            assert.equal(doc.sources['secretSource'].object['public-parameter'], 'publicValue');
            assert.equal((<any>doc.sources['secretSource'].source).publicParameter, 'publicValue');
            assert.equal((<any>doc.sources['secretSource'].source).secretParameter, undefined);
        });
    });
    describe('#devices', function () {
        it("should load a device", function () {
            doc = grammar.loadFileSync('./test/load/devices/device.yml');
            assert.notEqual(doc, null);
            assert.ok(doc.devices['simple_device'])
            assert.equal(doc.devices['simple_device'].object['name'], 'A fake device');
            assert.equal(doc.devices['simple_device'].object['parameter1'], 'value1');
        });
        it("should load a one line device", function () {
            doc = grammar.loadFileSync('./test/load/devices/onelineDevice.yml');
            assert.notEqual(doc, null);
            assert.ok(doc.devices['simple_device'])
            assert.equal(doc.devices['simple_device'].object['name'], 'A fake device');
            assert.equal(doc.devices['simple_device'].object['parameter1'], 'value1');
        });
        it("should load a tree of devices", function () {
            doc = grammar.loadFileSync('./test/load/devices/deviceTree.yml');
            assert.notEqual(doc, null);
            assert.ok(doc.devices['level1.level1-1.level1-1-1'])
            assert.equal(doc.devices['level1.level1-1.level1-1-1'].object['name'], 'Device 1-1-1');
            assert.ok(doc.devices['level1.level1-2.level1-2-1'])
            assert.equal(doc.devices['level1.level1-2.level1-2-1'].object['name'], 'Device 1-2-1');
            assert.ok(doc.devices['level1.level1-2.level1-2-2'])
            assert.equal(doc.devices['level1.level1-2.level1-2-2'].object['name'], 'Device 1-2-2');
            assert.ok(doc.devices['level2.level2-1.level2-1-1'])
            assert.equal(doc.devices['level2.level2-1.level2-1-1'].object['name'], 'Device 2-1-1');
        });
    });
    describe('#configFile', function () {
        this.timeout(40000)
        /*
        it('should load the zibase config file', function () {
            doc = grammar.loadFileSync('./test/load/sources/zibase.yml');
            assert.notEqual(doc, null);
        });
        */
        it('should load the current configuration', function () {
            const confFiles = './config/';
            if (!fs.existsSync(confFiles)) {
                this.skip();
            }
            doc = grammar.loadFileSync(confFiles);
            assert.notEqual(doc, null);
        });
        it('should load the demo file', function () {
            const demoFile = './config/demo.yml';
            doc = grammar.loadFileSync(demoFile);
            assert.notEqual(doc, null);
        });
    });
    describe.skip('#release', function () {
        it('should free memory for a simple import', function () {
            for (let i = 0; i < 1000; i++) {
                doc = grammar.loadFileSync('./test/load/imports/source.yml');
                doc.release();
                doc = null;
            }

        })
    })
    describe.skip('#ephemeral', function () {
        it('should load the ephemeral test', function () {
            doc = grammar.loadFileSync('./test/load/ephemeral.yml');
            assert.notEqual(doc, null);
        })
    })

    describe('#load', function () {
        it('should load a valid document', function () {
            doc = grammar.loadFileSync('./test/load/valid.yml');
            assert.notEqual(doc, null);
            assert.deepEqual(doc.imports, {})
            assert.deepEqual(doc.sources, {})
            assert.deepEqual(doc.devices, {})
            assert.deepEqual(doc.scenarios, {})
        });
        it('should not load an invalid document', function () {
            assert.throws(() => {
                doc = grammar.loadFileSync('./test/load/invalid.yml');
            })
            assert.equal(doc, null);
        });
        it('should load a simple source and device', function () {
            doc = grammar.loadFileSync('./test/load/sources/fake_source.yml');
            assert.notEqual(doc, null);
            assert.notEqual(doc, null);
            assert.notEqual(doc.sources, null);
            assert.notEqual(doc.sources.testSource, null);
            assert.equal(doc.sources.testSource.object.type, 'fakeSource');
        });
    });
    describe('#load a config with scenario', function () {
        it('should load a simple source and device', function () {
            grammar.reloadConfig('./test/load/sources/fake_source.yml');
            assert.notEqual(grammar.getSource('testSource'), null);
        });
    });
    describe('#load scenario', function () {
        it('should fire a simple action, no condition', function (done) {
            grammar.reloadConfig('./test/load/scenarios/simple_action.yml');
            passToSandbox(done);
            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
        });
        it('should pass old and new values to condition', function (done) {
            grammar.reloadConfig('./test/load/scenarios/action_condition.yml');
            grammar.__set__('sandbox.argsPassedToCondition', done);
            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
        });
        it('should execute action if condition returns true', function (done) {
            grammar.reloadConfig('./test/load/scenarios/action_condition.yml');

            grammar.__set__('sandbox.setConditionResult', true);
            grammar.__set__('sandbox.argsPassedToCondition', function () { });
            grammar.__set__('sandbox.actionDone', done);

            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
        });
        it('should not execute action if condition returns false', function (done) {
            grammar.reloadConfig('./test/load/scenarios/action_condition.yml');

            grammar.__set__('sandbox.setConditionResult', false);
            grammar.__set__('sandbox.argsPassedToCondition', function () { });
            grammar.__set__('sandbox.actionDone', assert.fail);

            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
            setTimeout(done, 1000);
        });
        it('should execute action if named condition returns true', function (done) {
            grammar.reloadConfig('./test/load/scenarios/action_named_condition.yml');
            grammar.__set__('sandbox.setConditionResult', true);
            grammar.__set__('sandbox.argsPassedToCondition', function () { });
            grammar.__set__('sandbox.actionDone', done);

            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
        });
        it('should not execute action if named condition returns false', function (done) {
            grammar.reloadConfig('./test/load/scenarios/action_named_condition.yml');

            grammar.__set__('sandbox.setConditionResult', false);
            grammar.__set__('sandbox.argsPassedToCondition', function () { });
            grammar.__set__('sandbox.actionDone', assert.fail);

            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
            setTimeout(done, 1000);
        });
        it('should not execute action if only one condition of the set returns true', function (done) {
            grammar.reloadConfig('./test/load/scenarios/action_condition_set.yml');

            grammar.__set__('sandbox.actionDone', assert.fail);

            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
            setTimeout(done, 1000);
        });
        it('should execute action if both conditions of the set return true', function (done) {
            grammar.reloadConfig('./test/load/scenarios/action_condition_set.yml');

            grammar.__set__('sandbox.actionDone', done);

            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 2 });
        });
        it('should fire a named action', function (done) {
            grammar.reloadConfig('./test/load/scenarios/named_action.yml');

            passToSandbox(done);
            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
        });
        it('should execute all actions in the set', function (done) {
            grammar.reloadConfig('./test/load/scenarios/action_set.yml');

            passToSandbox(done);
            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
        });
        it('should support binary conditions', function (done) {
            grammar.reloadConfig('./test/load/scenarios/binary_condition.yml');

            grammar.__set__('sandbox.actionDone', done);

            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
        });
        it('should support binary conditions with this.', function (done) {
            grammar.reloadConfig('./test/load/scenarios/binary_this_condition.yml');

            grammar.__set__('sandbox.actionDone', done);

            grammar.getSource('testSource').emitEvent('change', 'the_device', { oldValue: -1, newValue: 1 });
        });



    });
    describe('#load current configuration', function () {
        this.timeout(60000);

        const confFiles = './config';
        before('check if current configuration file exists', function () {
            if (!fs.existsSync(confFiles)) {
                this.skip();
            }
        });
        it('should load the current configuration file', function () {
            doc = grammar.loadFileSync(confFiles);
            assert.notEqual(doc, null);
            //console.log(require('util').inspect(doc, {showHidden: false, depth: null}));
        });
        it('should instantiate the current configuration file', function () {
            doc = grammar.loadFileSync(confFiles);
            if (!doc) this.skip();
            assert.notEqual(doc.sources, null, 'Instanciation should have created sources');
            for (var s in doc.sources) {
                assert.notEqual(doc.sources[s], null, 'Source should not be null');
            }

            //assert.notEqual(doc.deviceTypes, null, 'Instanciation should have created device types');
            //for (var dt in doc.deviceTypes) {
            //    assert.notEqual(doc.deviceTypes[dt], null, 'Device Type should not be null');
            //}

            assert.notEqual(doc.devices, null, 'Instanciation should have created devices');
            for (var d in doc.devices) {
                assert.notEqual(doc.devices[d], null, 'Device should not be null');
            }


            //console.log(require('util').inspect(doc, {showHidden: false, depth: null}));
        });
    });
    describe('#load users section', function () {
        it('should load users', function (done) {
            grammar.reloadConfig('./test/load/users/users.yml');
            grammar.checkUser('login1', 'password1', function (err, user) {
                assert.equal(user.login, 'login1')
                grammar.checkUser('login2', 'password2', function (err, user) {
                    assert.equal(user.login, 'login2')
                    done(err);
                })
            })
        })
    })
});
