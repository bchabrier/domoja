
import * as assert from 'assert';
import { Source, Parameters, ConfigLoader, InitObject, GenericDevice, reloadConfig, getCurrentConfig } from '..';
import * as http from 'http';
import * as express from 'express';
import { AddressInfo } from 'net';
import * as querystring from 'querystring';

import rewire = require('rewire')
import * as ToMock from '../domoja'
let RewireToMock = rewire('../domoja')
const domoja: typeof ToMock & typeof RewireToMock = <any>RewireToMock
const DomojaServer: new (port: Number, prod: boolean, listeningCallback?: () => void) => any = domoja.__get__('DomojaServer');

import * as apis from '../api';
import { InternalServer } from '../node_modules/typescript-rest/dist/server-container';

describe('Module api', function () {
    this.timeout(5000);

    function doRequest(method: 'GET' | 'POST', path: string, formData: querystring.ParsedUrlQueryInput, onSuccess: (body: string) => void, onError: (err: Error) => void) {
        let server = new DomojaServer(null, false, () => {
            let data = querystring.stringify(formData);

            let req = http.request('http://localhost:' + server.app.get('port') + path, {
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
        });
    }


    beforeEach('Hack to make typescript-rest reload correctly', function () {
        InternalServer.serverClasses.forEach(classData => {
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
            reloadConfig('./test/load/devices/device.yml');
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
            reloadConfig('./test/load/devices/device.yml');
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
            reloadConfig('./test/load/devices/device.yml');
            doRequest('GET', '/devices/unknown_device', null, (body) => {
                //console.log(body);
                assert.ok(body.match(/device not found/));
                done();
            }, done);
        });
    }); describe('POST /devices/:id', function () {
        it('should set the state of a device', function (done) {
            reloadConfig('./test/load/devices/device.yml');
            doRequest('POST', '/devices/simple_device', {
                command: 'ON'
            }, (body) => {
                assert.equal(body, 'OK');
                console.log(getCurrentConfig().getDevice('simple_device'));
                assert.equal(getCurrentConfig().getDevice('simple_device').getState(), 'ON');
                done();
            }, done);
        });
        it('should raise an exception if device not found', function (done) {
            reloadConfig('./test/load/devices/device.yml');
            doRequest('POST', '/devices/unknown_device', {
                command: 'ON'
            }, (body) => {
                //console.log(body);
                assert.ok(body.match(/device not found/));
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
});

