import * as http from "http";
import * as fs from "fs";
import * as assert from "assert";

import * as core from 'domoja-core'

import rewire = require('rewire')
import * as ToMock from '../domoja'
import { fstat } from "fs";
let RewireToMock = rewire('../domoja')
const mockedDomoja: typeof ToMock & typeof RewireToMock = <any>RewireToMock
const DomojaServer: new (port: Number, prod: boolean, ssl: boolean, listeningCallback?: () => void) => any = mockedDomoja.__get__('DomojaServer');

describe('Repository www', function () {
    this.timeout(5000);

    let server: typeof RewireToMock.DmjServer;

    this.beforeAll(function (done) {
        server = new DomojaServer(null, false, false, () => {
            core.configure(server.app,
                (user, pwd, done) => { done(null, { id: "test" }) },
                (user, cb) => cb(null, { id: "test" }),
                null,
                '',
                (req, resp) => { },
                null
            );
            ToMock.___setDmjServer___(server);
            mockedDomoja.___setDmjServer___(server);
            done();
        });
    });

    describe('Routes', function () {

        function readRecursiveDir(path: string, callback: (path: string) => void) {
            fs.readdirSync(path).forEach(function (file) {
                var subpath = path + '/' + file;
                if (fs.lstatSync(subpath).isDirectory()) {
                    readRecursiveDir(subpath, callback);
                } else {
                    callback(path + '/' + file);
                }
            });
        }

        const UIdir = './www';
        const UIdirLength = UIdir.length;
        const alwaysAuthorizedRoutes = [
            "/login.html",
            "/build/main.css",
            "/assets/fonts/.*",
            "/assets/favicon/.*"
        ];

        readRecursiveDir(UIdir, (path) => {
            let route = path.substr(UIdirLength);

            let code: number;
            if (alwaysAuthorizedRoutes.some((r) => { let re = new RegExp(r); return re.test(route); })) {
                code = 200; // OK
            } else if (route == '/index.html') {
                code = 302; // redirect
            } else if (route == '/manifest-auth.json') {
                code = 403; // refused
            } else {
                code = 401; // need authentication
            }

            it(`should return ${code} status for GET ${route}`, function (done) {
                let url = 'http://localhost:' + server.app.get('port');
                http.get(url + route, (res) => {
                    assert.equal(res.statusCode, code);
                    done();
                });
            });
        });

    });

    this.afterAll('Close DmjServer', (done) => {
        server.close(done);
    });

    after(function () {
        //setTimeout(asyncDump, 10000);
    });
});

// the below is for debugging non exiting tests

'use strict';

const { createHook } = require('async_hooks');
const { stackTraceFilter } = require('mocha/lib/utils');
const allResources = new Map();

// this will pull Mocha internals out of the stacks
const filterStack = stackTraceFilter();

const hook = createHook({
    init(asyncId, type, triggerAsyncId) {
        allResources.set(asyncId, { type, triggerAsyncId, stack: (new Error()).stack });
    },
    destroy(asyncId) {
        allResources.delete(asyncId);
    }
}).enable();

function asyncDump() {
    hook.disable();
    console.error(`
STUFF STILL IN THE EVENT LOOP:`)
    allResources.forEach(value => {
        console.error(`Type: ${value.type}`);
        console.error(filterStack(value.stack));
        console.error('\n');
    });
};