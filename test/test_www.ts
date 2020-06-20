import * as http from "http";
import * as fs from "fs";
import * as assert from "assert";

import * as core from 'domoja-core'

import { DomojaServer } from '../server';

describe('Repository www', function () {
    this.timeout(5000);

    let server: DomojaServer;

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
            done();
        });
    });

    after(function (done) {
        server.close(() => {
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

        function runTest(route: string, code: number) {
            it(`should return ${code} status for GET ${route}`, function (done) {
                let url = 'http://localhost:' + server.app.get('port');
                http.get(url + route, (res) => {
                    assert.equal(res.statusCode, code);
                    done();
                });
            });
        }

        const UIdir = './www';
        const UIdirLength = UIdir.length;
        const alwaysAuthorizedRoutes = [
            "/login.html",
            "/build/main.css",
            "/assets/fonts/.*",
            "/assets/favicon/.*",
            "/assets/imgs/LoadingBasketContents.gif"
        ];

        runTest('/', 302);

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

            runTest(route, code);

        });

    });

    this.afterAll('Close DmjServer', (done) => {
        assert.notEqual(server, null);
        assert.notEqual(server, undefined);
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