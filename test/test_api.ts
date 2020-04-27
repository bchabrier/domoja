
import * as assert from 'assert';
import { Source, Parameters, ConfigLoader, InitObject, GenericDevice, reloadConfig, getCurrentConfig } from '../core';
import * as http from 'http';
import * as querystring from 'querystring';

import rewire = require('rewire');
let sampleRewireToMock = rewire('rewire');
import * as ToMock from '../domoja';
assert.notEqual(ToMock, null); // force load of orginal domoja
let RewireToMock: typeof sampleRewireToMock;
let domoja: typeof ToMock & typeof RewireToMock;
let DomojaServer: new (port: Number, prod: boolean, ssl: boolean, listeningCallback?: () => void) => any;

import * as apis from '../api';
import { ServerContainer } from '../node_modules/typescript-rest/dist/server/server-container';
let InternalServer = ServerContainer.get();

import * as core from 'domoja-core'

describe('Module api', function () {
    this.timeout(5000);

    let server: typeof ToMock.DmjServer;

    function _reloadConfig(file: string) {
        reloadConfig(file);
        ToMock.DmjServer.previousFile = ToMock.DmjServer.currentFile;
        domoja.DmjServer.previousFile = domoja.DmjServer.currentFile;
        ToMock.DmjServer.currentFile = file;
        domoja.DmjServer.currentFile = file;
    }

    this.beforeAll(function (done) {
        RewireToMock = rewire('../domoja');
        domoja = <any>RewireToMock;
        DomojaServer = domoja.__get__('DomojaServer');
        server = new DomojaServer(null, false, false, () => {
            core.configure(server.app,
                (user, pwd, done) => { done(null, { id: "test" }) },
                (user, cb) => cb(null, { id: "test" }),
                null,
                '',
                (req, resp) => { },
                null
            );
            domoja.___setDmjServer___(server);
            ToMock.___setDmjServer___(server); // needed for getApp()
            done();
        });
    });

    function doRequest(method: 'GET' | 'POST', path: string, formData: querystring.ParsedUrlQueryInput, onSuccess: (body: string) => void, onError: (err: Error) => void) {

        let data = querystring.stringify(formData);

        let req = http.request('http://test:test@localhost:' + server.app.get('port') + path, {
            method: method,
            headers: method == 'POST' ? {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            } : undefined
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                onSuccess(body);
                getCurrentConfig().release();
            }).on('error', (err) => {
                getCurrentConfig().release();
                onError(err);
            });
        });
        req.write(data);
        req.end();
    }


    beforeEach('Hack to make typescript-rest reload correctly', function () {
        (<any>InternalServer).serverClasses.forEach(classData => {
            if (!classData.isAbstract) {
                // make use of new clases
                Object.keys(apis).forEach(a => {
                    let klass = (<any>apis)[a]
                    if (classData.targetClass.name == klass.name) {
                        classData.targetClass = klass
                    }
                });
                // remove processor duplicates
                classData.methods.forEach(function (method) {
                    let uniqueProcessors: any[] = [];
                    method.processors && method.processors.forEach(p => {
                        let found = false;
                        for (let i = 0; i < uniqueProcessors.length; i++) {
                            if (p.name == uniqueProcessors[i].name) {
                                found = true
                                break;
                            }
                        }
                        if (!found) {
                            uniqueProcessors.push(p);
                        }
                    });
                    method.processors = uniqueProcessors;
                });
            }
        });
    });

    describe('GET /devices', function () {
        it('should return the devices', function (done) {
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('GET', '/devices', null, (body) => {
                //console.log(body);
                let result = JSON.parse(body);
                assert.notEqual(result, null);
                assert.ok(Array.isArray(result));
                assert.equal(result.length, 1)
                assert.equal(result[0].id, 'id');
                assert.equal(result[0].path, 'simple_device');
                done();
            }, done);
        });
    });
    describe('GET /devices/:id', function () {
        it('should return a device', function (done) {
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('GET', '/devices/simple_device', null, (body) => {
                //console.log(body);
                let result = JSON.parse(body);
                assert.notEqual(result, null);
                assert.equal(result.id, 'id');
                assert.equal(result.path, 'simple_device');
                done();
            }, done);
        });
        it('should raise an exception if device not found', function (done) {
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('GET', '/devices/unknown_device', null, (body) => {
                //console.log(body);
                assert.ok(body.match(/device not found/));
                done();
            }, done);
        });
    });
    describe('POST /devices/:id', function () {
        it('should set the state of a device', function (done) {
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('POST', '/devices/simple_device', {
                command: 'ON'
            }, (body) => {
                assert.equal(body, 'OK');
                console.log(getCurrentConfig().getDevice('simple_device'));
                assert.equal(getCurrentConfig().getDevice('simple_device').getState(), 'ON');
                done();
            }, done);
        });
        it('should raise an exception if cannot set the state of a device', function (done) {
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('POST', '/devices/simple_device', {
                command: 'ERROR'
            }, (body) => {
                assert.ok(body.match(/Error: ERROR value received/));
                console.log(getCurrentConfig().getDevice('simple_device'));
                assert.equal(getCurrentConfig().getDevice('simple_device').getState(), undefined);
                done();
            }, done);
        });
        it('should raise an exception if device not found', function (done) {
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('POST', '/devices/unknown_device', {
                command: 'ON'
            }, (body) => {
                //console.log(body);
                assert.ok(body.match(/device not found/));
                done();
            }, done);
        });
    });
    describe('GET /app', function () {
        it('should return the application', function (done) {
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('GET', '/app/', null, (body) => {
                let result = JSON.parse(body);
                assert.notEqual(result, null);
                assert.equal(result.demoMode, 0);
                assert.equal(result.nbWebsockets, 0);
                assert.equal(result.nbWebsocketsHTTP, 0);
                assert.equal(result.nbDevices, 1);
                assert.equal(result.nbSources, 0);
                assert.equal(result.nbScenarios, 0);
                assert.equal(result.nbPages, 0);
                done();
            }, done);
        });
    });
    describe('POST /app/demo-mode', function () {
        it('should switch to demo-mode and vice-versa', function (done) {
            this.timeout(120000);
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('POST', '/app/demo-mode', { value: true }, (body) => {
                console.error(body);
                assert.equal(body, "OK");
                ToMock.DmjServer.reloadConfig(); // force this to make internals consistent (core.getCurrentConfig())
                assert.equal(ToMock.DmjServer.getApp().demoMode, true);
                doRequest('POST', '/app/demo-mode', { value: false }, (body) => {
                    console.error(body);
                    assert.equal(body, "OK");
                    ToMock.DmjServer.reloadConfig(); // force this to make internals consistent (core.getCurrentConfig())
                    assert.equal(ToMock.DmjServer.getApp().demoMode, false);
                    done();
                }, done);
            }, done);
        });
    });
    describe('GET /pages', function () {
        it('should return [] when no page exists', function (done) {
            _reloadConfig('./test/load/devices/device.yml');
            doRequest('GET', '/pages/', null, (body) => {
                let result = JSON.parse(body);
                assert.notEqual(result, null);
                assert.ok(Array.isArray(result));
                assert.equal(result.length, 0);
                done();
            }, done);
        });
        it('should return an array of pages', function (done) {
            _reloadConfig('./test/load/pages.yml');
            doRequest('GET', '/pages/', null, (body) => {
                //console.log(body);
                let result = JSON.parse(body);
                assert.notEqual(result, null);
                assert.ok(Array.isArray(result));
                assert.equal(result.length, 1);
                assert.equal(result[0].name, 'About');
                assert.equal(result[0].menuItem, 'A propos');
                done();
            }, done);
        });
    });
    describe('/api-docs', function () {
        it('should deliver Swagger pages', function (done) {
            doRequest('GET', '/api-docs/', null, (body) => {
                //console.log(body);
                assert.ok(body.match(/swagger/));
                done();
            }, done);
        })
    });

    this.afterAll('Close DmjServer', (done) => {
        server.close(done);
    });
});

