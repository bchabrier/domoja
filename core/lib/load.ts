import { DomoModule, InitObject, Parameters } from '../lib/module';
import { Source, DefaultSource } from '../sources/source';
import { GenericDevice, DeviceType } from '../devices/genericDevice';
import { Scenario } from '../scenarios/scenario'
import * as async from 'async';
import * as triggers from '../scenarios/trigger';
import * as path from "path";
import * as fs from 'fs';
import Module = require('module');
import * as userMgr from '../managers/userMgr'
type User = userMgr.User;
import * as events from 'events';
import { ConfigLoader as importedConfigLoader, CRONPATTERN } from '..'
import { Console } from 'console';
import { WriteStream } from 'tty';

let depth = 0;

//const { VM, VMScript } = require('vm2');

import { VM, VMScript } from 'vm2';

import * as Parser from "shitty-peg/dist/Parser";

import { currentSource, removeQuotes, eatCommentsBlock, eatComments, trim, sortedDeviceList } from './load_helpers';
import { condition, actions, elseActions } from './load_scenarios';
import * as  colors from 'colors/safe';

var logger = require('tracer').colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export interface Map<T> {
    [index: string]: T
}

type importItem = {
    module: string,
    class: new () => DomoModule,
    comment1: string,
    comment2: string,
    source?: string,
    device?: string
}

type value = string | Function | string[] | { [s: string]: value };

type plainObject = {
    source?: string,
    type?: string,
    [key: string]: value
};

type sourceItem = {
    name: string,
    object: plainObject,
    source: Source
};

type deviceItem = {
    name: string,
    object: plainObject,
    device: GenericDevice
};

type scenarioItem = {
    name: string,
    scenario: Scenario
};

type pageItem = {
    name: string,
    menuItem: string,
    title: string,
    page: string,
    args: Map<string>
};

/*
type user = {
    login: string,
    password: string,
    email: string,
    phone: string,
    [k: string]: string
}
*/

class ExternalFunction {
    private script: any; //  instance of VMScript
    public fct: Function;
    constructor(public readonly file: string, public readonly line: number, private readonly functionString: string, private readonly sandbox: Sandbox) {
        this.script = new VMScript("args.result = (" + this.functionString + ")(...args.args)");
        try {
            this.script.compile();
        } catch (err) {
            logger.error("In file '%s', failed to compile script '%s':\n", this.file, this.functionString, err);
            this.fct = function couldNotCompile(...args: any[]) { };
            return;
        }

        let self = this; // to be used inside the named function
        this.fct = function sandboxedFunc(...args: any[]): void {

            // because of issue https://github.com/patriksimek/vm2/issues/306, we apply the followig workaround:
            // - create the VM before each run
            // - create in the sandbox a new console with a new WriteStream for each sandbox
            let stream = new WriteStream(1);
            self.sandbox.console = new Console(stream);     // workaround
            //if (true || !self.vm) {                                     // workaround
            const timeout = 2000;
            let vm = new VM({
                timeout: 0, // no timeout as it causes problems when VMs are created in cascade and having a timeout
                sandbox: self.sandbox
            });
            //}

            self.sandbox.args.args = args;
            self.sandbox.args.result = undefined;

            let vm_run_didComplete = false; // patch to track failure in vm.run and avoid FATAL ERROR: v8::ToLocalChecked Empty MaybeLocal.
            let start: number;
            try {
                //console.group();
                // console.error('calling vm.run', ++depth, self.file, self.functionString);
                start = (new Date).getTime();
                vm.run(self.script);
                //console.error('out vm.run', depth--);
                vm_run_didComplete = true;
            } catch (err) {
                //console.error('out vm.run en err', depth--);
                //logger.error(`Error while executing script '%s...':%s`, fct.toString().substr(0,20), err.message);

                // find the error location
                logger.warn('=======> err:', err, 'functionString:', self.functionString, 'script:', self.script);
                if (err) {
                    let location = /at .*\(vm.js:([0-9]+):([0-9]+)\)/.exec(err.stack);
                    if (location) {
                        let linePos = parseInt(location[1]);
                        let charPos = parseInt(location[2]);
                        err.message = err.message + "\n\n" + errorContext(self.functionString + '\n', linePos, charPos);
                    }
                    logger.error(`In file '${file}': %s\n`, err.message, err.stack);
                } else {
                    logger.error(`In file '${file}': ` + 'Error "null" raised while executing', self.functionString.substr(0, 128), new Error("here"));
                }

                // call the callback if any
                let lastArg = args && args.length && args[args.length - 1];
                if (typeof lastArg == 'function') {
                    logger.warn('Calling callback');
                    lastArg(err);
                }
            }
            let end = (new Date).getTime();
            if (end - start > timeout) {
                logger.warn(`In file '${file}': function has taken longer than ${timeout} ms (${end - start} ms):`, self.functionString);
            }

            self.sandbox.console = null;
            vm = null;
            stream.destroy();
            //console.groupEnd();
            if (!vm_run_didComplete) {
                console.error('!!!!!!!!!!!!!!!!!!!!===============================================!!!!!! vm run did not complete');
            }
            return sandbox.args.result;
        }
    }
}

export type Sandbox = {
    isReleased(): boolean, // indicates if the sandbox is in released state
    console: typeof console,
    assert: typeof assert,
    require: typeof require,
    setTimeout: typeof setTimeout,
    clearTimeout: typeof clearTimeout,
    setInterval: typeof setInterval,
    clearInterval: typeof clearInterval,
    args: { args: any, result: any },
    getDevice: typeof getDevice,
    getSource: typeof getSource,
    setDeviceState: typeof setDeviceState,
    getDeviceState: typeof getDeviceState,
    getDevicePreviousState: typeof getDevicePreviousState,
    getDeviceLastUpdateDate: typeof getDeviceLastUpdateDate,
    msg: {
        emitter: string,
        oldValue: string,
        newValue: string
    }
};

type Section = 'ALL' | 'IMPORTS' | 'SOURCES' | 'DEVICES' | 'SCENARIOS' | 'PAGES' | 'USERS';

export class ConfigLoader extends events.EventEmitter {
    released: boolean = false;
    secrets: Map<string> = {};
    imports: Map<importItem> = {};
    sources: Map<sourceItem> = {};
    devices: Map<deviceItem> = {};
    scenarios: Map<Scenario> = {};
    pages: Map<pageItem> = {};
    userMgr = new userMgr.UserMgr;
    comments: string[] = [];
    DEFAULT_SOURCE: DefaultSource;

    rootModule: Module;

    currentParsedFile: string;

    private sandbox: Sandbox = {
        isReleased: () => { return this.released },
        console: console,
        require: require,
        assert: assert,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        getDevice: getDevice,
        getSource: getSource,
        setDeviceState: setDeviceState,
        getDeviceState: getDeviceState,
        getDevicePreviousState: getDevicePreviousState,
        getDeviceLastUpdateDate: getDeviceLastUpdateDate,
        msg: <{ emitter: string, oldValue: string, newValue: string }>new Object(), // new Object needed to access outside of the sandbox
        args: <{ args: any[], result: any }>new Object(), // new Object needed to access outside of the sandbox
    }



    constructor() {
        super();
        this.DEFAULT_SOURCE = new DefaultSource;
    }

    public release(): void {
        if (this.released) return;
        this.released = true;

        logger.info('Releasing %d scenario(s)...', Object.keys(this.scenarios).length)
        Object.keys(this.scenarios).forEach(e => {
            this.scenarios[e].stop();
            this.scenarios[e].deactivate();
        })
        this.scenarios = undefined;
        logger.info('Releasing %d device(s)...', Object.keys(this.devices).length)
        Object.keys(this.devices).forEach(e => {
            this.devices[e].device && this.devices[e].device.release();
            this.devices[e].device = null;
        });
        this.devices = undefined;
        logger.info('Releasing %d source(s)...', Object.keys(this.sources).length)
        Object.keys(this.sources).forEach(e => {

            let klass = <new () => Source>this.imports['sources.' + this.sources[e].object.type].class
            Source.deregisterDeviceTypes(klass);
            this.imports['sources.' + this.sources[e].object.type].class = null;

            this.sources[e].source.release();
            this.sources[e].source = null;
        });
        this.sources = undefined;

        this.DEFAULT_SOURCE.release();

        /*
                let id = require.resolve(path.resolve(__dirname, '..', moduleName));
                // remove previous modules from rootModule
                rootModule.children = rootModule.children.filter(m => {
                    if (m.id === id) {
                        // and disconnect them to make sure they are freed in memory
                        for (let i in m.children) {
                            m.children[i].parent = null;
                        }
                        m.children = [];
                    }
                    return m.id !== id
                })
                delete require.cache[id]; // to make sure the file is reloaded*/
        this.rootModule = null;
        this.comments = [];
        this.userMgr.clearUsers();
    }

    parse(fileOrDir: string, done: (err?: Error) => void) {
        try {
            this.rootModule = new Module("sandbox module");
            this.comments = []
            let dir = fileOrDir;
            prevContext = {};

            if (!fs.lstatSync(fileOrDir).isDirectory()) {
                dir = path.dirname(fileOrDir);
            }

            let secretsFile = dir + '/secrets.yml';

            if (fs.existsSync(secretsFile)) {
                logger.info("Loading secrets file '%s'...", secretsFile)
                this.parseSingleFile(secretsFile, secretsSection, 'ALL')
            }

            if (dir === fileOrDir) {
                let files = fs.readdirSync(dir).filter(f => f.match(/^.*\.yml$/) && !f.match(/^(.*\/)*demo\.yml$/));

                let sections: Section[] = [
                    'IMPORTS',
                    'SOURCES',
                    'DEVICES',
                    'SCENARIOS',
                    'PAGES',
                    'USERS',
                ];
                sections.forEach(section => {
                    files.forEach(file => {
                        if (file != 'secrets.yml') {
                            logger.info("Loading %s from config file '%s'...", section, file)
                            this.parseSingleFile(dir + '/' + file, configDoc, section);
                        }
                    });
                });
            } else {
                logger.info("Loading config file '%s'...", fileOrDir)
                this.parseSingleFile(fileOrDir, configDoc, 'ALL');
            }
        } catch (e) {
            logger.error(e);
            return done(e);
        }

        if (this.devices) {
            // instanciate all devices
            logger.debug("Starting instanciating all devices...")
            let N = Object.keys(this.devices).length;
            let n = 0;
            Object.keys(this.devices).forEach(e => {
                n++;
                process.stdout.write(n + "/" + N + "\r");
                let device = this.devices[e];
                //console.log(device.object)


                // create the initObject
                let initObject: InitObject = objectToInitObject(this, device.object);

                let instance = this.createInstance(e,
                    this.imports['devices.' + device.object.type].class,
                    initObject);
                if (instance instanceof GenericDevice)
                    device.device = instance;
                else {
                    logger.error('Instanciating %s did not create a GenericDevice:', e, instance);
                }
            })
            logger.debug("Done instanciating all %d devices.", N)
        }

        if (this.devices) {
            // instanciate all devices
            logger.debug("Starting restoring all devices initial state...")
            async.rejectSeries(Object.keys(this.devices).map(d => this.devices[d].device.path),
                (devicePath, callback) => {
                    this.getDevice(devicePath).restoreStateFromDB((err) => {
                        callback(null, !err);
                    });
                },
                (err, results) => {
                    if (results.length > 0) {
                        logger.debug(`Done restoring devices initial state, ${results.length} failed: ${results.join(", ")}`);
                    } else {
                        logger.debug(`Done restoring all ${Object.keys(this.devices).length} devices initial state.`);
                    }

                    if (this.scenarios) {
                        let N = Object.keys(this.scenarios).length;
                        logger.debug("Starting activating all %s scenarios...", N)
                        let n = 0;
                        Object.keys(this.scenarios).forEach(e => {
                            n++;
                            process.stdout.write(n + "/" + N + "\r");
                            let scenario = this.scenarios[e];
                            //console.log(scenario)
                            scenario.activate();
                        })
                        logger.debug("Done activating all %d scenarios.", N)
                    }
                    return done(err);
                });
        } else {
            return done();
        }
    }

    private parseSingleFile(file: string, parser: (c: Parser.Parse, section: Section) => void, section: Section) {
        let str = fs.readFileSync(file, "utf8");

        str = str.replace(/\r\n/g, '\n');

        this.currentParsedFile = file;

        let document = this;
        try {
            let res = Parser.parse(new Parser.Source(str, file), function (c: Parser.Parse) {
                c.setContext({
                    doc: document
                });
                parser(c, section);
            });
        } catch (err) {
            this.release();

            // find the error location
            let location = /^.*[ :]([0-9]+):([0-9]+)$/.exec(err.message)
            if (location) {
                let linePos = parseInt(location[1]);
                let charPos = parseInt(location[2]);
                err.message = err.message + "\n\n" + errorContext(str, linePos, charPos);
            }
            throw err;
        }
    }

    unparse(): string {
        let tab: string[] = [];

        //tab.push(this.importsComment);
        tab.push("imports:\n");
        Object.keys(this.imports).forEach(e => {
            let element = this.imports[e]
            tab.push("  - module: ", element.module, element.comment1, "\n");
            if (element.source) tab.push("    source: ", element.source, element.comment2, "\n");
            if (element.device) tab.push("    device: ", element.device, element.comment2, "\n");
        });
        //tab.push(this.sourcesComment);
        tab.push("\n");
        tab.push("sources:\n");
        Object.keys(this.sources).forEach(e => {
            let element = this.sources[e]
            tab.push("  - ", element.name, ": {\n");
            let props: string[] = []
            Object.keys(element.object).forEach(prop => {
                props.push("    " + prop + ": " + element.object[prop]);
            });
            tab.push(props.join(",\n"));
            tab.push("\n");
            tab.push("  }\n");
        });
        tab.push("\n");

        return tab.join('');
    }

    createInstance(instanceFullname: string, moduleClass: new () => DomoModule, data: InitObject): DomoModule {
        logger.debug('Instanciating module', require('util').inspect(moduleClass, { showHidden: false, depth: null }), 'with initObject', data);
        // createInstance should be static but cannot
        if (moduleClass && moduleClass.prototype && moduleClass.prototype.createInstance) {
            return moduleClass.prototype.createInstance(this, instanceFullname, data);
        } else {
            logger.error(new Error('Failed to instanciate \'' + instanceFullname + '\'').stack);
            return null;
        }
    }

    public getDevice(path: string): GenericDevice {
        //logger.error(d, this.devices[d]);
        return this.devices[path].device
    }

    public getDevicesFromIds(ids: string[] | string): GenericDevice[] {
        let idTab: string[];
        if (typeof ids == 'string') {
            idTab = [ids]
        } else {
            idTab = ids
        }
        logger.debug('getting devices for:', idTab)
        let devTab: GenericDevice[] = [];
        idTab.forEach(element => {
            devTab.push(this.devices[element].device)
        });
        return devTab;
    }



    private getModuleClass(moduleName: string, className: string): new () => DomoModule {
        const mainDir = path.dirname(require.main.filename);
        let id: string = '';

        try {
            let p = moduleName.match(/^[/.]/) ? path.resolve(mainDir, moduleName) : "domoja-" + moduleName

            // remove ts-mocha part (in case it is run through a ts-mocha test)
            p = p.replace('/node_modules/mocha/bin', '');

            if (/^domoja-[^/]+\//.test(p)) {
                let subpath = p.replace(/^domoja-[^/]+/, '');
                p = p.replace(/^(domoja-[^/]+).*/, '$1');
                id = path.dirname(require.resolve(p)) + subpath;
            } else {
                id = require.resolve(p);
            }
            let newModuleExports = this.rootModule.require(id);
            logger.info('Successfully imported class \'%s\' from \'%s\'.', className, moduleName);
            return newModuleExports[className];
        }
        catch (e) {
            logger.error('Failed to import class \'%s\' from \'%s\'.', className, moduleName, e);
            return null;
        }
    }

    private compiledScripts: { [k: string]: any } = {};
    private vm: any;

    sandboxedFunction(fct: string): Function {
        return new ExternalFunction(this.currentParsedFile, 9999, fct, this.sandbox).fct;
    }

    sandboxedExtFunction(func: string): Function {
        let f = func.replace(/^!!js\/function +'([^']*)' *$/, "$1");
        return this.sandboxedFunction(f);
    }

    setSandboxMsg(msg: { [k: string]: any }): void {
        for (let p in this.sandbox.msg) {
            delete (<any>this.sandbox.msg)[p];
        }
        for (let p in msg) {
            if (p == 'emitter') {
                this.sandbox.msg.emitter = msg.emitter.path;
            } else {
                (<any>this.sandbox.msg)[p] = msg[p];
            }
        }

    }


}



function getParameters(moduleClass: new () => DomoModule): Parameters {
    // getParameters should be static but cannot
    if (moduleClass && moduleClass.prototype && moduleClass.prototype.getParameters) {
        return moduleClass.prototype.getParameters();
    } else {
        logger.error('Cannot getParameters of moduleClass ', moduleClass);
        return {}
    }
}

function errorContext(body: string, linePos: number, charPos: number): string {
    let context = 3; // number of lines of context
    let regexp = new RegExp(
        "^(.*\n){" + Math.max(linePos - context, 0) + "}" +
        "((.*\n){1," + Math.min(context, linePos) + "})(.|\n)*")

    // as string.repeat is not recognized by VSCode (!!???)
    function repeat(str: string, n: number): string {
        let res = "";
        for (var i = 0; i < n; i++)                 res += str;
        return res;
    }

    return body.replace(regexp, "$2") + repeat(" ", charPos - 1) + "^";
}

import assert = require('assert');


function objectToInitObject(document: ConfigLoader, object: plainObject): InitObject {
    let initObject: InitObject = {};

    Object.keys(object).forEach(k => {
        switch (k) {
            case 'source':
                // the source points to the real source
                if (document.sources[object.source]) {
                    initObject[k] = document.sources[object.source].source;
                } else {
                    logger.error(`Unknown source "${object.source}". Is it defined in the "sources:" section?`);
                }
                break;
            default:
                let value = object[k];
                if (typeof value === "string") {
                    let match: RegExpExecArray;
                    if (match = (
                        /^!!js\/function +'([^']*)' *$/.exec(value) ||
                        /^!!js\/function +"([^"]*)" *$/.exec(value))
                    ) {
                        let fct: string = match[1];
                        logger.debug('Found js function:', fct)
                        initObject[k] = document.sandboxedFunction(fct);
                    } else if (match = (
                        /^!secrets +"([^"]*)" *$/.exec(value) ||
                        /^!secrets +'([^']*)' *$/.exec(value) ||
                        /^!secrets +([^'"].*) *$/.exec(value))
                    ) {
                        let secret: string = match[1];
                        //console.log('Found secret:', secret)
                        initObject[k] = document.secrets[secret];
                    } else {
                        initObject[k] = value
                    }
                } else if (typeof value === "function") {
                    initObject[k] = value
                } else if (Array.isArray(value)) {
                    initObject[k] = value
                } else if (typeof (value) == 'object') {
                    initObject[k] = value
                } else {
                    logger.warn("Unsupported type for value:", value)
                    initObject[k] = value
                    let check: never = value
                }
                break;
        }
    });
    return initObject;
}

let STRING = Parser.token(/^([^ "'#},\n]+)|("([^\\"]|\\.)*")|('([^\\']|\\.)*')/, 'string');
//let INTERPRETED_STRING = Parser.token(/^[^ "'#},\n]+/, 'string');
//let INTERPRETED_STRING = Parser.token(/^[^ ,]+/, 'string');
export let IDENTIFIER = Parser.token(/^[^\n:{} ]+/, 'string');
let COMMENT = Parser.token(/^ *(#[^\n]*|)/);
let BLANKLINE = Parser.token(/^ +/);

export let DASH = Parser.token(/^- */, "-");

let IMPORTS = Parser.token(/^imports: */, '"imports:"');
let MODULE = Parser.token(/^module: */, '"module:"');
let SOURCE = Parser.token(/^source: */, '"source:"');
let DEVICE = Parser.token(/^device: */, '"device:"');

let SOURCES = Parser.token(/^sources: */, '"sources:"');
let DEVICES = Parser.token(/^devices: */, '"devices:"');
let SECRETS = Parser.token(/^secrets: */, '"secrets:"');
let USERS = Parser.token(/^users: */, '"users:"');

let SCENARIOS = Parser.token(/^scenarios: */, '"scenarios:"');
let TRIGGERS = Parser.token(/^triggers: */, '"triggers:"');
let AT = Parser.token(/^at: */, '"at:"');
let STATE = Parser.token(/^state: */, '"state:"');

let PAGES = Parser.token(/^pages: */, '"pages:"');
let MENUITEM = Parser.token(/^menu-item: */, '"menu-item:"');
let TITLE = Parser.token(/^title: */, '"title:"');
let PAGE = Parser.token(/^page: */, '"page:"');
let ARGS = Parser.token(/^args: */, '"args:"');

let SECRETS_EXT = Parser.token(/^!secrets +/, '"!secrets"');
export let FUNCTION_EXT = Parser.token(/^!!js\/function +'([^']|\n)*' */, '"!!js/function \'function (...) ...\'"');

let prevContext = {};


function configDoc(c: Parser.Parse, section: Section): void {

    Object.assign(c.context(), prevContext);

    eatCommentsBlock(c);
    let imports;
    if (section == 'ALL' || section == 'IMPORTS')
        imports = c.optional(importsSection);
    else {
        c.optional(c => c.one(Parser.token(/^imports: *\n(([ #].*\n)|\n)*/, '"imports:"')));
    }
    logger.debug('imports done')

    eatCommentsBlock(c);
    let sources;
    if (section == 'ALL' || section == 'SOURCES')
        sources = c.optional(sourcesSection);
    else {
        c.optional(c => c.one(Parser.token(/^sources: *\n(([ #].*\n)|\n)*/, '"sources:"')));
    }
    logger.debug('sources done')

    eatCommentsBlock(c);
    let devices;
    if (section == 'ALL' || section == 'DEVICES')
        devices = c.optional(devicesSection);
    else {
        c.optional(c => c.one(Parser.token(/^devices: *\n(([ #].*\n)|\n)*/, '"devices:"')));
    }
    logger.debug('devices done')

    eatCommentsBlock(c);
    let scenarios: { comment: string, scenarios: Map<scenarioItem> }
    if (section == 'ALL' || section == 'SCENARIOS')
        scenarios = c.optional(scenariosSection);
    else {
        c.optional(c => c.one(Parser.token(/^scenarios: *\n(([ #].*\n)|\n)*/, '"scenarios:"')));
    }
    logger.debug('scenarios done')

    eatCommentsBlock(c);
    let pages;
    if (section == 'ALL' || section == 'PAGES')
        pages = c.optional(pagesSection);
    else {
        c.optional(c => c.one(Parser.token(/^pages: *\n(([ #].*\n)|\n)*/, '"pages:"')));
    }
    logger.debug('pages done')

    eatCommentsBlock(c);
    let users;
    if (section == 'ALL' || section == 'USERS')
        users = c.optional(usersSection);
    else {
        c.optional(c => c.one(Parser.token(/^users: *\n(([ #].*\n)|\n)*/, '"users:"')));
    }
    logger.debug('users done')


    let document = <ConfigLoader>c.context().doc;

    if (users) {
        //document.importsComment = imports.comment;
        logger.debug("Adding %d user(s)...", users.users.length)
        for (let u of users.users) {
            let user = new userMgr.User("", "", "", "", "");
            for (let k in u) {
                (<any>user)[k] = (<any>u)[k]
            }
            document.userMgr.addUser(user);
        }
        logger.debug("Done adding %d user(s).", users.users.length)
    }
    if (imports) {
        //document.importsComment = imports.comment;
        document.imports = { ...document.imports, ...imports.imports };
    }
    if (sources) {
        //document.sourcesComment = sources.comment;
        document.sources = { ...document.sources, ...sources.sources };
    }
    if (devices) {
        //document.devicesComment = devices.comment;
        document.devices = { ...document.devices, ...devices.devices };
    }

    if (scenarios) {
        Object.keys(scenarios.scenarios).forEach(e => {
            let scenario = scenarios.scenarios[e].scenario;
            document.scenarios[e] = scenario;
            //console.log(scenario)
        });
    }

    if (pages) {
        document.pages = { ...document.pages, ...pages.pages };
    }

    prevContext = c.context();
}

function secretsSection(c: Parser.Parse): void {
    c.skip(SECRETS);
    c.indent();
    let secrets: { [k: string]: string } = {};

    c.any(
        (c: Parser.Parse) => {
            let key = trim(c.one(IDENTIFIER));
            c.one(Parser.token(/^ *: */, '":"'));
            let val = c.one(stringValue)
            secrets[key] = val;
        },
        /^\n */
    )

    let document = <ConfigLoader>c.context().doc;
    document.secrets = secrets;
}

function importsSection(c: Parser.Parse): {
    comment: string,
    imports: Map<importItem>
} {
    logger.debug('=>imports')

    let res: { comment: string, imports: Map<importItem> } = {
        comment: eatCommentsBlock(c),
        imports: {},
    }
    logger.debug('passed comment block')
    c.context().imports = c.context().imports || res.imports;
    c.skip(IMPORTS);
    logger.debug('passed "imports:"')
    c.indent();
    c.any(importItem, (c: Parser.Parse) => c.newline()).forEach(
        (element: importItem) => {
            let id: string;
            let name: string;
        });
    logger.debug('passed all import items')
    //eatTrailingBlockComment(c);
    c.dedent();
    logger.debug('passed dedent')

    c.newline();

    logger.debug('=>imports in context', c.context().imports)
    res.imports = c.context().imports;

    logger.debug('<=imports')
    return res;
}

function importItem(c: Parser.Parse): importItem {
    let document = <ConfigLoader>c.context().doc;

    let res: importItem;

    let imports: Map<importItem> = c.context().imports;
    logger.debug('in importItem')
    c.skip(DASH);
    c.skip(MODULE);
    let module = c.one(stringValue)
    let comment1 = c.optional(c => c.one(COMMENT))
    c.indent()
    let type: string;
    let klass: string;
    c.oneOf(
        (c: Parser.Parse) => {
            c.skip(SOURCE);
            klass = c.one(stringValue);
            res = {
                module: module,
                source: klass,
                class: document['getModuleClass'](module, klass),
                comment1: comment1,
                comment2: c.optional(c => c.one(COMMENT))
            };
            type = 'source';
        },
        (c: Parser.Parse) => {
            c.skip(DEVICE);
            klass = c.one(stringValue);
            res = {
                module: module,
                device: klass,
                class: document['getModuleClass'](module, klass),
                comment1: comment1,
                comment2: c.optional(c => c.one(COMMENT))
            };
            type = 'device';
        }
    )
    if (imports[type + 's.' + klass])
        c.expected('not "' + klass + '" (duplicate ' + type + ')');
    imports[type + 's.' + klass] = res;
    c.dedent();
    return res;
}

function sourcesSection(c: Parser.Parse): { comment: string, sources: Map<sourceItem> } {

    let res: { comment: string, sources: Map<sourceItem> } = {
        comment: eatCommentsBlock(c),
        sources: {}
    }

    let imports: Map<importItem> = c.context().imports
    c.context().allowedTypeValues = []
    Object.keys(imports).forEach(key => imports[key].source && c.context().allowedTypeValues.push(imports[key].source));

    c.skip(SOURCES);
    c.optional((c: Parser.Parse) => {
        c.indent()
        res.sources = c.one(sourcesArray);
        c.dedent();
    })
    return res;
}

function sourcesArray(c: Parser.Parse): Map<sourceItem> {
    let res: Map<sourceItem> = {};
    c.context().sources = { ...c.context().sources, ...res };
    c.many((c: Parser.Parse) => {
        c.skip(DASH);
        let i = c.one(sourceItem);
        res[i.name] = i;
        c.context().sources[i.name] = i;;
    }, (c: Parser.Parse) => c.newline());
    return res;
}

function sourceItem(c: Parser.Parse): sourceItem {
    let document = <ConfigLoader>c.context().doc;

    c.pushContext({
        doc: document,
        type: "source",
        imports: c.context().imports,
        sources: c.context().sources,
        allowedTypeValues: c.context().allowedTypeValues
    });
    let obj = c.one(namedObject);
    c.popContext();

    let source: Source;
    let initObject: InitObject = objectToInitObject(document, obj.object);
    let i = c.context().imports['sources.' + obj.object.type];
    if (!i) logger.warn("Cannot find import '%s' in ", 'sources.' + obj.object.type, c.context().imports)
    let klass = i.class;
    let instance = document.createInstance(obj.name, klass, initObject);
    if (instance instanceof Source) {
        source = instance;
        if (klass.registerDeviceTypes) {
            klass.registerDeviceTypes();
        } else {
            logger.info("Source '%s' does not provide method 'registerDeviceType', hence does not support any device type.", obj.object.type)
        }
    } else {
        source = null;
        logger.error('Instanciating %s did not create a Source:', obj.name, source);
    }

    return { name: obj.name, object: obj.object, source: source }
}

function buildTreeArray<ThingItem extends { name: string }>(
    c: Parser.Parse,
    result: Map<ThingItem>,
    thingTreeArray: (c: Parser.Parse) => Map<ThingItem>,
    thingItem: (c: Parser.Parse) => ThingItem): void {

    let used_ids: string[] = [];
    c.many((c: Parser.Parse) => {
        c.oneOf(
            (c: Parser.Parse) => {
                logger.debug('trying subtree with', currentSource(c));
                eatCommentsBlock(c);
                c.skip(DASH);
                let id = trim(c.one(IDENTIFIER));
                logger.debug('found id', id)
                if (used_ids.includes(id)) {
                    c.expected("a different identifier as this one is already used");
                }
                used_ids.push(id);
                c.skip(Parser.token(/^ *: */, '":"'));
                logger.debug('found :')
                eatComments(c);
                c.indent();
                c.pushContext({
                    doc: <ConfigLoader>c.context().doc,
                    imports: c.context().imports,
                    devices: c.context().devices,
                    sources: c.context().sources,
                    scenarios: c.context().scenarios,
                    path: (c.context().path ? c.context().path + '.' : '') + id,
                    allowedTypeValues: c.context().allowedTypeValues
                });
                let subtree = c.one(thingTreeArray);
                c.popContext();
                c.dedent();
            },
            (c: Parser.Parse) => {
                logger.debug('trying thingItem with', currentSource(c));
                let leaf = c.one(thingItem);
                let fullname: string = ''
                if (c.context().path) {
                    fullname = c.context().path + '.';
                }
                fullname = fullname + leaf.name;
                logger.debug('fullname=', fullname)
                result[fullname] = leaf;
                logger.debug('found thingItem')

            },
        )

        // eat comments
        let comments = '';
        let iscomment = true;
        while (iscomment) {
            if (c.isNext(/^\n *\n/)) {
                comments += c.one(/^\n */);
            } else if (c.isNext(/^\n *#.*/)) {
                comments += c.one(/^\n *#.*/);
            } else {
                iscomment = false;
            }
        }
        logger.debug(`comment: '${comments}'`)

    }, (c: Parser.Parse) => c.newline());

}

function devicesSection(c: Parser.Parse): { comment: string, devices: Map<deviceItem> } {
    let res: { comment: string, devices: Map<deviceItem> } = {
        comment: eatCommentsBlock(c),
        devices: {}
    }

    let imports: Map<importItem> = c.context().imports
    c.context().allowedTypeValues = []
    Object.keys(imports).forEach(key => imports[key].device && c.context().allowedTypeValues.push(imports[key].device));

    let devices: Map<deviceItem> = {};
    c.context().devices = c.context().devices || devices;

    c.skip(DEVICES);
    c.optional((c: Parser.Parse) => {
        c.indent()
        res.devices = c.one(deviceTreeArray);
        c.dedent();
    })

    return res;
}

function deviceTreeArray(c: Parser.Parse): Map<deviceItem> {
    let res: Map<deviceItem> = c.context().devices;

    buildTreeArray(c, res, deviceTreeArray, deviceItem);

    return res;
}

function deviceItem(c: Parser.Parse): deviceItem {
    let document = <ConfigLoader>c.context().doc;
    c.pushContext({
        doc: document,
        type: "device",
        imports: c.context().imports,
        devices: c.context().devices,
        sources: c.context().sources,
        path: c.context().path,
        allowedTypeValues: c.context().allowedTypeValues
    });
    eatCommentsBlock(c);
    c.skip(DASH);
    let obj = c.one(namedObject);
    c.popContext();

    return { name: obj.name, object: obj.object, device: undefined }
}

function scenariosSection(c: Parser.Parse): { comment: string, scenarios: Map<scenarioItem> } {

    let res: { comment: string, scenarios: Map<scenarioItem> } = {
        comment: eatCommentsBlock(c),
        scenarios: {}
    }

    c.skip(SCENARIOS);
    c.indent()
    c.context().scenarios = c.context().scenarios || {}
    res.scenarios = c.one(scenarioTreeArray);
    c.dedent();

    return res;
}

function scenarioTreeArray(c: Parser.Parse): Map<scenarioItem> {
    let res: Map<scenarioItem> = c.context().scenarios;

    buildTreeArray(c, res, scenarioTreeArray, scenarioItem);

    return res;
}

function scenarioItem(c: Parser.Parse): scenarioItem {
    let document = <ConfigLoader>c.context().doc;
    eatCommentsBlock(c);
    c.skip(DASH);
    let i = trim(c.one(IDENTIFIER));
    if (c.context().scenarios[c.context().path + '.' + i]) {
        c.expected('not "' + i + '" (duplicate scenario)');
    }
    c.skip(Parser.token(/^ *: */, '":"'));
    eatComments(c);
    c.indent()

    if (c.context().path) {
        c.context().currentScenario = c.context().path + '.';
    } else {
        c.context().currentScenario = '';
    }
    c.context().currentScenario = c.context().currentScenario + i;

    eatCommentsBlock(c);
    let scenario = c.optional(trigger);
    c.context().scenarioUnderConstruction = scenario;
    eatCommentsBlock(c);
    let cond = c.optional(condition);
    logger.debug('condition = ', cond)
    if (cond) scenario.setCondition(cond)
    eatCommentsBlock(c);
    let act = c.one(actions);
    scenario.setAction(act);
    logger.debug('Got actions, continuing with ', currentSource(c));
    if (c.isNext(/^\n *else *:/)) {
        c.newline();
        let elseact = c.optional(elseActions);
        scenario.setElseAction(elseact);
    }
    c.dedent();
    c.context().scenarioUnderConstruction = null;

    return { name: i, scenario: scenario }
}

function trigger(c: Parser.Parse): Scenario {
    let document = <importedConfigLoader>c.context().doc;
    let scenario = new Scenario(document, c.context().currentScenario);

    c.optional(c => {
        c.skip(TRIGGERS); eatComments(c);
        c.indent()

        c.many((c: Parser.Parse) => {
            c.skip(DASH);
            c.oneOf(
                (c: Parser.Parse) => {
                    c.skip(STATE); eatComments(c);

                    let devices: string[] = [];
                    for (let d in c.context().devices) {
                        devices.push(d)
                    }
                    // make sure longer items are first so that they are
                    // catched first by c.oneOf
                    devices.sort((a, b) => { return b.length - a.length });
                    let device = c.oneOf(...devices)
                    new triggers.StateTrigger(document, scenario, device);
                },
                (c: Parser.Parse) => {
                    c.skip(AT); eatComments(c);
                    let when = c.one(STRING);
                    let err = true;
                    if (when == 'startup') {
                        err = false;
                    }
                    sortedDeviceList(c).forEach(d => {
                        if (when == d) err = false;
                    });
                    if (err) {
                        // try to see if a date / time
                        if (!isNaN(triggers.TimeTrigger.dateTime(when))) err = false;
                    }
                    if (err) {
                        c.expected('"startup" or <device> or <time> or <date>');
                    } else {
                        new triggers.TimeTrigger(document, scenario, when);
                    }
                },
                (c: Parser.Parse) => {
                    c.skip(Parser.token(/^cron: */, '"cron:"')); eatComments(c);
                    //let pattern = Parser.token(/^((\*(\/\d+)?)|((\d+(-\d+)?)(,\d+(-\d+)?)*) [*] [*])/, 'a cron pattern, i.e. "*" or "1-3,5" or "*/2"');
                    let pattern = Parser.token(CRONPATTERN, 'a cron pattern, i.e. 5 or 6 times a "*" or "1-3,5" or "*/2" as in https://www.npmjs.com/package/cron');
                    let when = removeQuotes(c.one(pattern));
                    let err = true;
                    if (when == 'startup') {
                        err = false;
                    }
                    sortedDeviceList(c).forEach(d => {
                        if (when == d) err = false;
                    });
                    err = false;
                    if (err) {
                        c.expected('"startup" or <device> or <time> or <date>');
                    } else {
                        new triggers.TimeTrigger(document, scenario, when);
                    }
                }
            );
            eatComments(c);
        }, (c: Parser.Parse) => { c.newline() });
        c.dedent()
        c.newline();
    });
    return scenario;
}

function pagesSection(c: Parser.Parse): { comment: string, pages: Map<pageItem> } {

    let res: { comment: string, pages: Map<pageItem> } = {
        comment: eatCommentsBlock(c),
        pages: {}
    }

    c.skip(PAGES);
    c.indent()
    res.pages = c.one(pagesArray);
    c.dedent();

    return res;
}

function pagesArray(c: Parser.Parse): Map<pageItem> {
    let res: Map<pageItem> = {};
    c.context().pages = c.context().pages || res;
    c.many((c: Parser.Parse) => {
        let i = c.one(pageItem);
        res[i.name] = i;
    }, (c: Parser.Parse) => c.newline());
    return res;
}

function pageItem(c: Parser.Parse): pageItem {
    let document = <ConfigLoader>c.context().doc;
    c.skip(DASH);
    let i = trim(c.one(IDENTIFIER));
    c.skip(Parser.token(/^ *: */, '":"'));
    c.indent();

    let p: pageItem = {
        name: i,
        menuItem: undefined,
        title: undefined,
        page: undefined,
        args: {}
    }
    c.optional(c => {
        c.skip(MENUITEM);
        p.menuItem = c.one(stringValue)
        c.newline();
    });
    c.skip(TITLE)
    p.title = c.one(stringValue);
    c.newline();
    c.skip(PAGE);
    p.page = c.one(stringValue);
    c.optional(c => {
        c.newline();
        c.skip(ARGS);
        c.indent();
        c.many((c: Parser.Parse) => {
            c.skip(DASH);
            let key = c.one(IDENTIFIER);
            c.skip(Parser.token(/^ *: */, '":"'));
            let val = c.oneOf(
                (c: Parser.Parse) => {
                    c.indent();
                    let ar = c.one(argsArray);
                    c.dedent();
                    return ar;
                },
                stringValue,
            );
            p.args[key] = val;
        }, (c: Parser.Parse) => c.newline())
        c.dedent();
    });
    c.dedent();

    return p;
}

function argsArray(c: Parser.Parse): Array<Object> {
    let res: Array<Object> = [];

    c.many((c: Parser.Parse) => {
        c.skip(Parser.token(/^ *- */, '"-"'));
        c.skip(IDENTIFIER); // not used
        c.skip(Parser.token(/^ *: */, '":"'));
        c.indent();
        let o = c.one(plainObject);
        res.push(o);
        c.dedent();
    }, (c: Parser.Parse) => c.newline());

    return res;
}

function plainObject(c: Parser.Parse): Object {
    let o: { [key: string]: any } = {};

    c.many((c: Parser.Parse) => {
        let key = c.one(IDENTIFIER);
        c.skip(Parser.token(/^ *: */, '":"'));
        let val = c.one(value);
        o[key] = val;
        eatComments(c);
    }, (c: Parser.Parse) => c.newline());

    return o;
}





function namedObject(c: Parser.Parse): { name: string, object: { [x: string]: value } } {
    logger.debug('=>named object')
    let name = trim(c.one(IDENTIFIER));
    logger.debug('found id', name)
    if (c.context().type == 'source') {
        if (c.context().sources[name])
            c.expected('not "' + name + '" (duplicate source)')
    }
    if (c.context().type == 'device') {
        if (c.context().devices[c.context().path + '.' + name])
            c.expected('not "' + name + '" (duplicate device)')
    }

    c.skip(Parser.token(/^ *: */, '":"'));
    logger.debug('found :')
    let obj = c.one(object);
    logger.debug('found object', obj)
    return { name: name, object: obj };
}

function getDeviceParameters(c: Parser.Parse, type: string, source: Source, sourcename: string): Parameters {
    let parameters: Parameters = {}
    let document = <ConfigLoader>c.context().doc;
    try {
        parameters = source.getDeviceParameters(type);
    } catch (e) {
        logger.warn("Source '%s' does not support device type '%s' at %s%d:%d\n%s",
            source == document.DEFAULT_SOURCE ? "DEFAULT_SOURCE" : sourcename,
            type,
            c.source.name ? c.source.name + ":" : "", c.location().line(), c.location().column(),
            errorContext(c.source.body, c.location().line(), c.location().column()), e)
    }
    return parameters;
}

function object(c: Parser.Parse): { [x: string]: value } {
    logger.debug('=>object')
    var obj: plainObject = {};

    let document = <ConfigLoader>c.context().doc;
    let parameters: Parameters = {}
    let allowedKeys: string[] = [];
    let allowedTypeValues: string[] = c.context().allowedTypeValues

    if (c.context().type == 'device') {
        allowedKeys.push("type", "name", "source", "attribute", "id", "camera", "widget", "persistence", "tags", "transform");
    }
    if (c.context().type == 'source') {
        allowedKeys.push("type");
    }

    if (c.context().type == 'object') {
        parameters = c.context().parameters;
        Object.keys(parameters).forEach(key => {
            if (allowedKeys.indexOf(key) == -1)
                allowedKeys.push(key)
        });
    }

    let isJson = c.isNext(/^{/);

    isJson && c.skip(/^{ */);
    logger.debug('found {')
    let indented = false;
    if (c.isNext(/^ *\n/)) {
        indented = true;
        c.indent()
    }
    logger.debug('found indent')

    let first: boolean = true;
    let second: boolean = false;
    let need_at_least_one: boolean = false;
    let at_least_one: string;
    let got_at_least_one: boolean = false;
    let hasSource: boolean = false;
    c.many((c: Parser.Parse) => {
        if (c.isNext(/^ *#.*\n/)) {
            c.skip(/^ *#.*/)
            c.newline();
        }
        let source: Source;

        if (second && c.context().type == 'device') {
            // for a device, if source is not the second attribute, 
            // it means we are using the default source
            //if (!c.isNext(/^ *(["'])source\1 *:/)) {
            if (!c.isNext(/^ *['"]?source['"]? *:/)) {
                logger.debug('Second attribute is not "source", using DEFAULT_SOURCE')
                source = document.DEFAULT_SOURCE;
                parameters = getDeviceParameters(c, obj['type'], source, 'DEFAULT_SOURCE')
                Object.keys(parameters).forEach(key => {
                    if (allowedKeys.indexOf(key) == -1)
                        allowedKeys.push(key)
                });
            }
        }

        logger.debug('allowedKeys:', allowedKeys)
        let key: string;
        if (need_at_least_one) {
            key = c.oneOf(...allowedKeys, IDENTIFIER);
            if (allowedKeys.indexOf(key) == -1) {
                got_at_least_one = true;
            }
        } else {
            key = c.oneOf(...allowedKeys);
        }
        logger.debug('found key', key)
        if (first && c.context().type != 'object' && key != 'type') {
            c.expected('"type"');
        }

        if (c.context().type == 'device') {
            if (!second && hasSource && key == 'source') {
                c.expected('"source" as the second attribute');
            }
        }

        c.skip(/^: */);
        var val: value;
        if (key == 'type') {
            logger.debug('allowedTypeValues:', allowedTypeValues)
            if (allowedTypeValues.length === 0) {
                logger.debug('no allowedTypeValues, maybe no device type imported?')
                c.expected('<valid device type> (did you import it?)')
            } else {
                val = c.oneOf(...allowedTypeValues);
            }
        } else {
            val = c.one(value);
        }
        logger.debug('found val:', val)
        if (at_least_one && allowedKeys.indexOf(key) == -1) {
            (obj[at_least_one] as { [s: string]: value })[key] = val;
            logger.debug(`adding ${key}=${val} to at_least_one key "${at_least_one}"`);
        } else {
            obj[key] = val;
        }

        if (second) {
            if (c.context().type == 'device') {
                if (key == 'source') {
                    logger.debug('device has a source, getting allowed parameters from it')
                    hasSource = true;
                    //console.log(c.context().sources, val)

                    if (!c.context().sources[obj.source]) {
                        let allowedSources: string[] = [];
                        Object.keys(c.context().sources).forEach((s: string) => {
                            allowedSources.push(s);
                        });
                        c.expected('a valid source (' + allowedSources.join(' or ') + '). Did you import it?');
                    } else {
                        source = c.context().sources[obj.source].source;
                    }

                    parameters = getDeviceParameters(c, obj.type, source, obj.source)
                    Object.keys(parameters).forEach(key => {
                        if (allowedKeys.indexOf(key) == -1)
                            allowedKeys.push(key)
                    });
                }
            }
            second = false;
        }

        if (first) {
            if (c.context().type == 'source') {
                let type = c.context().type;
                let module = c.context().imports[type + 's.' + val];
                parameters = getParameters(module.class);
                Object.keys(parameters).forEach(key => {
                    if (allowedKeys.indexOf(key) == -1) {
                        if (parameters[key] == 'AT_LEAST_ONE') {
                            need_at_least_one = true;
                            at_least_one = key;
                            obj[at_least_one] = {};
                        } else {
                            allowedKeys.push(key);
                        }
                    }
                });
            }
            first = false;
            second = true;
        }

        if (allowedKeys.indexOf(key) != -1) {
            allowedKeys.splice(allowedKeys.indexOf(key), 1);
        }



        if (!isJson) eatComments(c);
    }, isJson ? /^ *, *\n? */ : /^ *\n */);
    logger.debug('found all key/value pairs');
    if (indented) {
        c.dedent();
        isJson && c.newline();
    }
    logger.debug('about to check all required keys have been provided');
    logger.debug('remaining keys:', allowedKeys);
    // check that all required keys have been provided
    allowedKeys.forEach(key => {
        logger.debug('parameters[%s]:', key, parameters[key]);
        if (parameters[key] == 'REQUIRED') {
            c.expected('"' + key + '"');
        }
    })
    logger.debug('checked all required keys have been provided');
    if (need_at_least_one && !got_at_least_one) {
        logger.debug('at least one additional key should have been provided');
        c.expected("an additional attribute");
    }

    isJson && c.skip(/^ *} */);
    logger.debug('<=object')
    return obj;
}

function stringValue(c: Parser.Parse): string {
    let s = c.oneOf(
        STRING,
    );

    return removeQuotes(s);
}

function array(c: Parser.Parse): Array<string> {
    c.skip(/^ *\[ */);
    let res = <string[]>c.any(value, /^ *, */);
    c.skip(/^ *\] */);
    return res;
}

function value(c: Parser.Parse): value {
    let s = c.oneOf(
        secret,
        FUNCTION_EXT,
        array,
        stringValue,
    );
    return s;
}

function secret(c: Parser.Parse): string {
    let prefix = c.one(SECRETS_EXT);
    let key = c.one(STRING);
    let document = <ConfigLoader>c.context().doc;
    let val = document.secrets[key]
    if (!val) {
        logger.warn("Unknown secret key '%s' at %s%d:%d\n%s",
            key,
            c.source.name ? c.source.name + ":" : "", c.location().line(), c.location().column(),
            errorContext(c.source.body, c.location().line(), c.location().column()))
    }
    return prefix + key;
}

function roomsSection(c: Parser.Parse): any {
    return c;
}
function usersSection(c: Parser.Parse): { comment: string, users: User[] } {
    let res: { comment: string, users: User[] } = {
        comment: eatCommentsBlock(c),
        users: []
    }

    c.skip(USERS);
    c.indent()
    res.users = c.one(usersArray);
    c.dedent();
    return res;
}
function usersArray(c: Parser.Parse): User[] {
    let res: User[] = [];
    c.many((c: Parser.Parse) => {
        res.push(c.one(userItem));
    }, (c: Parser.Parse) => c.newline());
    return res;
}
function userItem(c: Parser.Parse): User {
    c.skip(DASH);
    c.context().type = 'object';
    let params: Parameters = {
        "id": 'REQUIRED',
        "login": 'REQUIRED',
        "password": 'REQUIRED',
        "name": 'OPTIONAL',
        "initials": 'OPTIONAL',
        "macaddress": 'OPTIONAL',
        "email": 'OPTIONAL',
        "phone": 'OPTIONAL',
        "avatar": 'OPTIONAL'
    };
    c.context().parameters = params;

    let o = c.one(object);
    let user = <User>objectToInitObject(c.context().doc, o)

    return user;
}
function scenesSection(c: Parser.Parse): any {
    return c;
}
function actionsSection(c: Parser.Parse): any {
    return c;
}

export function loadFile(file: string, done: (err: Error, doc: ConfigLoader) => void): void {

    let document = new ConfigLoader();
    document.parse(file, (err) => {
        done(err, err ? null : document);
    });
    //console.log(document)
    //console.log(document.unparse());
}

//loadFileSync('./config/config.yml');


export let sources: Map<sourceItem> = {};
//export let deviceTypes: { [x: string]: Function } = {};
export let devices: Map<deviceItem> = {};
export let pages: Map<pageItem> = {};

export function getDevices(): GenericDevice[] {
    let res: GenericDevice[] = []
    for (var d in devices) {
        res.push(devices[d].device)
    }
    return res;
}

export function getDevice(shortPath: string): GenericDevice {
    //logger.debug(devices);
    let d = findByShortPath(devices, shortPath)
    if (!d) logger.warn(new Error("Device " + shortPath + " not found").stack);
    //    return d.device;
    return d ? d.device : undefined;
}

export function getSource(sourceID: string): Source {
    //logger.debug(sources)
    let s = findByShortPath(sources, sourceID)
    if (!s) logger.warn(new Error("Source '" + sourceID + "' not found in" + sources).stack);
    //    return s.source
    return s ? s.source : undefined;
}

function standardErrorHandler(err: Error) {
    err && logger.error(err.message);
}

function setDeviceState(path: string, state: string, callback: (err: Error) => void = standardErrorHandler): void {

    try {
        getDevice(path).setState(state, callback);
    } catch (err) {
        callback(err);
    }
}

function getDeviceState(path: string): string {
    let device = getDevice(path);
    let res: string;
    if (device) {
        res = device.getState();
        if (device.transform) {
            res = device.transform(res);
        }
    }
    return res;
}

function getDevicePreviousState(path: string): string {
    let device = getDevice(path);
    if (device && device.transform) return device.transform(device.getPreviousState());
    else return device && device.getPreviousState();
}


function getDeviceLastUpdateDate(path: string): Date {
    let device = getDevice(path);
    return device && device.lastUpdateDate;
}

function getPath<T>(list: { [path: string]: T }, shortPath: string): string {
    logger.debug('Looking for short path %s', shortPath);
    var len = shortPath.length + 1;
    for (var path in list) {
        if (path.substr(path.length - len) == '.' + shortPath) {
            logger.debug('Found path %s for %s', path, shortPath);
            return path;
        }
    }
    return undefined;
}

function findByShortPath<T>(list: { [path: string]: T }, shortPath: string): T {
    let path = list[shortPath];

    if (path) return path;

    let d = getPath(list, shortPath);

    if (d) return list[d];

    return undefined;
}

var sandbox: Sandbox; // for test and rewire

var currentConfig: ConfigLoader;

export function getCurrentConfig() {
    return currentConfig;
}

type DoneFunction = (err: Error, doc: ConfigLoader) => void;
export function reloadConfig(done: DoneFunction): void;
export function reloadConfig(file: string, done: DoneFunction): void;
export function reloadConfig(arg: string | DoneFunction): void {
    let file: string;
    let done: (err: Error, doc: ConfigLoader) => void;

    if (typeof arg == 'string') {
        file = arg;
        done = arguments[1];
    } else {
        file = null;
        done = arguments[0];
    }

    const confFile = './config/config.yml';

    if (!file) file = confFile;

    loadFile(file, (err, doc) => {
        if (err) {
            logger.error('Got error loading file "%s":', file, err);
            return done(err, null);
        }

        sandbox = doc["sandbox"];

        sources = doc.sources;
        //deviceTypes = doc.deviceTypes;
        devices = doc.devices;
        pages = doc.pages;

        currentConfig && currentConfig.release();
        currentConfig = doc;

        logger.info(`ConfigLoader emitted ${colors.yellow('"startup"')}`)
        doc.emit('startup');
        return done(null, doc);
    });
}

import { IVerifyOptions } from 'passport-local';
import { isUndefined } from 'util';


export function checkUser(username: string, password: string, done: (error: any, user?: any, options?: IVerifyOptions) => void) {
    return currentConfig.userMgr.checkUser(username, password, done);
}

export function findUserById(id: string, fn: (err: Error, user: User) => void) {
    return currentConfig.userMgr.findUserById(id, fn);
}
