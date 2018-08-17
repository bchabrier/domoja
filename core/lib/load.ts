
import { DomoModule, InitObject, Parameters } from '..';
import * as domoja from '..'
import { Source, DEFAULT_SOURCE } from '..';
import { GenericDevice, DeviceType } from '..';
import { Scenario, ConditionFunction, ActionFunction } from '../scenarios/scenario'
import * as triggers from '../scenarios/trigger';
import { Condition } from '../scenarios/condition'
import { Action } from '../scenarios/action'
import * as path from "path";
import * as fs from 'fs';
import Module = require('module');
import async = require('async');
import * as userMgr from '../managers/userMgr'
type User = userMgr.User;
import * as events from 'events';

const { VM, VMScript } = require('vm2');

import Parser = require("shitty-peg/dist/Parser");
var logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

interface Map<T> {
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

type value = string | Function | string[];

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

/*
type user = {
    login: string,
    password: string,
    email: string,
    phone: string,
    [k: string]: string
}
*/
export class ConfigLoader extends events.EventEmitter {
    secrets: Map<string> = {};
    imports: Map<importItem> = {};
    sources: Map<sourceItem> = {};
    devices: Map<deviceItem> = {};
    scenarios: Map<Scenario> = {};
    userMgr = new userMgr.UserMgr;
    comments: string[] = [];

    rootModule: Module;

    private sandbox: {
        console: typeof console,
        assert: typeof assert,
        setTimeout: typeof setTimeout,
        clearTimeout: typeof clearTimeout,
        setInterval: typeof setInterval,
        clearInterval: typeof clearInterval,
        args: { args: any },
        getDevice: Function,
        getSource: Function,
        setDeviceState: Function,
        msg: {
            oldValue: string,
            newValue: string
        }
    } = {
            console: console,
            assert: assert,
            setTimeout: setTimeout,
            clearTimeout: clearTimeout,
            setInterval: setInterval,
            clearInterval: clearInterval,
            getDevice: getDevice,
            getSource: getSource,
            setDeviceState: setDeviceState,
            msg: <{ oldValue: string, newValue: string }>new Object(), // new Object needed to access outside of the sandbox
            args: <{ args: any[] }>new Object(), // new Object needed to access outside of the sandbox
        }



    constructor(file: string) {
        super();
    }

    public release(): void {
        logger.info('Releasing %d scenario(s)...', Object.keys(this.scenarios).length)
        Object.keys(this.scenarios).forEach(e => {
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

    parse(file: string) {
        this.rootModule = new Module("sandbox module");
        this.comments = []

        let secretsFile = path.dirname(file) + '/secrets.yml';

        if (fs.existsSync(secretsFile)) {
            logger.info("Loading secrets file '%s'...", secretsFile)
            this.parseSingleFile(secretsFile, secretsSection)
        }
        logger.info("Loading config file '%s'...", file)
        this.parseSingleFile(file, configDoc);
    }

    private parseSingleFile(file: string, parser: (c: Parser.Parse) => void) {
        let str = fs.readFileSync(file, "utf8");

        str = str.replace(/\r\n/g, '\n')

        let document = this;
        try {
            let res = Parser.parse(new Parser.Source(str, file), function (c: Parser.Parse) {
                c.setContext({
                    doc: document
                });
                parser(c)
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
            logger.error('Failed to instanciate \'%s\'', instanceFullname, (new Error).stack);
            return null;
        }
    }

    public getDevice(d: string): GenericDevice {
        return this.devices[d].device
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
        try {
            let p = moduleName.match(/^[/.]/) ? path.resolve(__dirname, '../..', moduleName) : "domoja-" + moduleName
            let id = require.resolve(p);
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

        fct = fct.replace(/^ *function *\(/, "function unnamed (");

        let self = this;
        let script = this.compiledScripts[fct];

        if (!script) {
            try {
                script = new VMScript("(" + fct + ")(...args.args)");
                //script = new VMScript(fct);
                script.compile();
                this.compiledScripts[fct] = script;
            } catch (err) {
                logger.error("Failed to compile script '%s':", fct, err);
                return () => { }
            }
        }
        return function (...args: any[]) {


            if (!self.vm) {
                self.vm = new VM({
                    timeout: 1000,
                    sandbox: self.sandbox
                });
            }

            self.sandbox.args.args = args;

            try {
                /*
                (<any>self.sandbox.args).titi = 0;
                (<any>self.sandbox.msg).tutu = 0;

                self.vm.run('console.log("avant", args, msg)');
                (<any>self.sandbox.args).titi = 1;
                (<any>self.sandbox.msg).tutu = 1;
                self.vm.run('console.log("apres", args, msg)');
                */
                return self.vm.run(script);
            } catch (err) {
                logger.error("%s: %s while executing script '%s'.", err.name, err.message, fct);

                // find the error location
                let location = /.*[ :]([0-9]+):([0-9]+)/.exec(err.stack)
                if (location) {
                    let linePos = parseInt(location[1]);
                    let charPos = parseInt(location[2]);
                    err.message = err.message + "\n\n" + errorContext(fct, linePos, charPos);
                }
                logger.error(err.message);
            }
        }
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
            (<any>this.sandbox.msg)[p] = msg[p];
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
                initObject[k] = document.sources[object.source].source;
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

let STRING = Parser.token(/^([^ "'#},\n]+)|("[^"\n]*")|('[^'\n]*')/, 'String');
let ID = Parser.token(/^[^\n:]+/, 'String');
let COMMENT = Parser.token(/^ *(#[^\n]*|)/);
let BLANKLINE = Parser.token(/^ +/);

let IMPORTS = Parser.token(/^imports: */, '"imports:"');
let MODULE = Parser.token(/^module: */, '"module:"');
let SOURCE = Parser.token(/^source: */, '"source:"');
let DEVICE = Parser.token(/^device: */, '"device:"');

let SOURCES = Parser.token(/^sources: */, '"sources:"');
let DEVICES = Parser.token(/^devices: */, '"devices:"');
let SECRETS = Parser.token(/^secrets: */, '"secrets:"');
let USERS = Parser.token(/^users: */, '"users:"');

let SCENARIOS = Parser.token(/^scenarios: */, '"scenarios:"');
let TRIGGER = Parser.token(/^trigger: */, '"trigger:"');
let AT = Parser.token(/^at: */, '"at:"');
let STATE = Parser.token(/^state: */, '"state:"');
let CONDITION = Parser.token(/^condition: */, '"condition:"');
let ACTION = Parser.token(/^action: */, '"action:"');

let SECRETS_EXT = Parser.token(/^!secrets +/, '"!secrets"');
let FUNCTION_EXT = Parser.token(/^!!js\/function +'[^']*' */, '"!secrets"');



function configDoc(c: Parser.Parse): void {

    eatCommentsBlock(c);
    let imports = c.optional(importsSection);
    logger.debug('imports done')
    eatCommentsBlock(c);
    let sources = c.optional(sourcesSection);
    logger.debug('sources done')
    eatCommentsBlock(c);
    let devices = c.optional(devicesSection);
    logger.debug('devices done')
    eatCommentsBlock(c);
    let scenarios = c.optional(scenariosSection);
    logger.debug('scenarios done')
    eatCommentsBlock(c);
    let users = c.optional(usersSection);
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
        logger.debug("Done add %d user(s).", users.users.length)
    }
    if (imports) {
        //document.importsComment = imports.comment;
        document.imports = imports.imports;
    }
    if (sources) {
        //document.sourcesComment = sources.comment;
        document.sources = sources.sources;
    }
    if (devices) {
        //document.devicesComment = devices.comment;
        document.devices = devices.devices;

        // instanciate all devices
        logger.debug("Starting instanciating all devices...")
        let N = Object.keys(document.devices).length;
        let n = 0;
        Object.keys(document.devices).forEach(e => {
            n++;
            process.stdout.write(n + "/" + N + "\r");
            let device = document.devices[e];
            //console.log(device.object)


            // create the initObject
            let initObject: InitObject = objectToInitObject(document, device.object);

            let instance = document.createInstance(device.name,
                document.imports['devices.' + device.object.type].class,
                initObject);
            if (instance instanceof GenericDevice)
                device.device = instance;
            else {
                logger.error('Instanciating %s did not create a GenericDevice:', device.name, instance);
            }
        })
        logger.debug("Done instanciating all %d devices.", N)

    }
    if (scenarios) {
        let N = Object.keys(scenarios.scenarios).length;
        logger.debug("Starting activating all %s scenarios...", N)
        let n = 0;
        Object.keys(scenarios.scenarios).forEach(e => {
            n++;
            process.stdout.write(n + "/" + N + "\r");
            let scenario = scenarios.scenarios[e].scenario;
            document.scenarios[e] = scenario
            //console.log(scenario)
            scenario.activate();
        })
        logger.debug("Done activating all %d scenarios.", N)
    }

}

function secretsSection(c: Parser.Parse): void {
    c.skip(SECRETS);
    c.indent();
    let secrets: { [k: string]: string } = {};

    c.any(
        (c: Parser.Parse) => {
            let key = trim(c.one(ID));
            c.one(/^ *: */);
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
    c.context().imports = res.imports;
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

    logger.debug('<=imports')
    return res;
}

function importItem(c: Parser.Parse): importItem {
    let document = <ConfigLoader>c.context().doc;

    let res: importItem;

    let imports: Map<importItem> = c.context().imports;
    logger.debug('in importItem')
    c.skip(/^- */);
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
    c.context().sources = res;
    c.many((c: Parser.Parse) => {
        c.skip(/^- */);
        let i = c.one(sourceItem);
        res[i.name] = i;
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

function devicesSection(c: Parser.Parse): { comment: string, devices: Map<deviceItem> } {

    let res: { comment: string, devices: Map<deviceItem> } = {
        comment: eatCommentsBlock(c),
        devices: {}
    }

    let imports: Map<importItem> = c.context().imports
    c.context().allowedTypeValues = []
    Object.keys(imports).forEach(key => imports[key].device && c.context().allowedTypeValues.push(imports[key].device));

    let devices: Map<deviceItem> = {};
    c.context().devices = devices;

    c.skip(DEVICES);
    c.optional((c: Parser.Parse) => {
        c.indent()
        res.devices = c.one(deviceTreeArray);
        c.dedent();
    })

    return res;
}

function trim(s: string): string {
    return s.replace(/ *([^ ]*).*/, "$1")
}

function deviceTreeArray(c: Parser.Parse): Map<deviceItem> {
    let res: Map<deviceItem> = c.context().devices;

    c.many((c: Parser.Parse) => {
        c.skip(/^- */);
        c.oneOf(
            (c: Parser.Parse) => {
                logger.debug('trying subtree')
                let id = trim(c.one(ID));
                logger.debug('found id', id)
                c.skip(/^ *: */);
                logger.debug('found :')
                c.indent();
                c.pushContext({
                    doc: <ConfigLoader>c.context().doc,
                    imports: c.context().imports,
                    devices: c.context().devices,
                    sources: c.context().sources,
                    path: (c.context().path ? c.context().path + '.' : '') + id,
                    allowedTypeValues: c.context().allowedTypeValues
                });
                let subtree = c.one(deviceTreeArray)
                c.popContext();
                c.dedent();
            },
            (c: Parser.Parse) => {
                logger.debug('trying deviceItem')
                let leaf = c.one(deviceItem);
                let fullname: string = ''
                if (c.context().path) {
                    fullname = c.context().path + '.';
                }
                fullname = fullname + leaf.name;
                logger.debug('fullname=', fullname)
                res[fullname] = leaf;
                logger.debug('found deviceItem')

            },
        )

        // eat comments
        while (c.isNext(/^\n *#.*/)) {
            c.skip(/^\n *#.*/);
        }

    }, (c: Parser.Parse) => c.newline());
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
    res.scenarios = c.one(scenariosArray);
    c.dedent();

    return res;
}

function scenariosArray(c: Parser.Parse): Map<scenarioItem> {
    let res: Map<scenarioItem> = {};
    c.context().scenarios = res;
    c.many((c: Parser.Parse) => {
        let i = c.one(scenarioItem);
        res[i.name] = i;
    }, (c: Parser.Parse) => c.newline());
    return res;
}

function scenarioItem(c: Parser.Parse): scenarioItem {
    let document = <ConfigLoader>c.context().doc;
    c.skip(/^- */);
    let i = trim(c.one(ID));
    c.skip(/^ *: */);
    c.indent()

    let scenario = c.one(trigger);
    let cond = c.optional(condition);
    logger.debug('condition = ', cond)
    if (cond) scenario.setCondition(cond)
    let act = c.one(action);
    scenario.setAction(act);
    c.dedent()

    return { name: i, scenario: scenario }
}

function trigger(c: Parser.Parse): Scenario {
    c.skip(TRIGGER); eatComments(c);
    c.indent()

    let document = <domoja.ConfigLoader>c.context().doc;
    let scenario = new Scenario(document);

    c.many((c: Parser.Parse) => {
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
                new triggers.StateTrigger(document, scenario, c.context().devices[device].name);
            },
            (c: Parser.Parse) => {
                c.skip(AT); eatComments(c);
                let when = c.oneOf('startup', STRING);
                new triggers.AtTrigger(document, scenario, when);
            }
        );
        eatComments(c);
    }, (c: Parser.Parse) => { c.newline() });
    c.dedent()
    c.newline();
    return scenario;
}

function condition(c: Parser.Parse): ConditionFunction {
    c.skip(CONDITION);
    return c.one(conditionArray);
}

type NamedCondition = { name: string, fct: ConditionFunction };

function conditionArray(c: Parser.Parse): ConditionFunction {
    c.indent();
    let conditions: NamedCondition[] = <any>c.many(
        (c: Parser.Parse) => {
            eatCommentsBlock(c);
            c.skip(/^- */);
            return c.one(singleCondition)
        },
        (c: Parser.Parse) => { c.newline() });

    let conditionArrayFunction = function (cb: (err: Error, cond: boolean) => void) {
        let self = this;
        let n = 1;
        let N = conditions.length;
        async.everySeries(conditions, function (condition, callback) {
            logger.debug("Calling condition '%s' (%s/%s)...", condition.name, n, N);
            n++;
            condition.fct.call(self, function (err: Error, cond: boolean) {
                logger.debug("Result is", cond, ", err:", err);
                callback(err, cond);
            });
        }, function (err: Error, result: boolean) {
            logger.debug('Done calling %s conditions in series with result', N, result)
            cb(err, result)
        });
    };
    c.dedent();
    c.newline();
    return conditionArrayFunction;
}

function unnamedCondition(c: Parser.Parse): NamedCondition {
    let document = <ConfigLoader>c.context().doc;
    let fct: ConditionFunction = <ConditionFunction><any>c.oneOf(
        (c: Parser.Parse) => {
            return document.sandboxedExtFunction(c.one(FUNCTION_EXT));
        },
        binaryCondition
    );
    eatComments(c);
    return { name: "<noname>", fct: fct };
}

function singleCondition(c: Parser.Parse): NamedCondition {
    logger.debug("trying singleCondition")
    let res: { name: string, fct: ConditionFunction } = <any>c.oneOf(
        namedCondition,
        unnamedCondition
    )
    eatComments(c);
    logger.debug("found singleCondition")
    return res;
}


function namedCondition(c: Parser.Parse): NamedCondition {
    logger.debug("trying namedAction")
    let name = trim(c.one(ID));
    c.skip(/^ *: */);

    let f = c.one(unnamedCondition).fct;
    logger.debug("found namedAction")

    return { name: name, fct: f };
}

function binaryCondition(c: Parser.Parse): ConditionFunction {
    let document = <ConfigLoader>c.context().doc;

    c.skip(/^{ */)
    c.skip(/^operator: */)
    let operator = c.oneOf("=");
    c.skip(/^, */)
    c.skip(/^left: */)
    let left = c.one(expression)
    c.skip(/^, */)
    c.skip(/^right: */)
    let right = c.one(expression)
    c.skip(/^ *} */)

    let binaryExpression: (left: string, right: string) => boolean;

    switch (operator) {
        case '=': binaryExpression = (left: string, right: string) => { return left == right };
            break;
    }

    return (cb: (err: Error, cond: boolean) => void) => {
        logger.debug("Retrieving args of binaryExpression '%s'", operator)
        async.parallel({
            left: left,
            right: right
        }, function (err, results) {
            let res = binaryExpression(results.left, results.right);
            logger.debug("Computing binaryExpression '%s' '%s' '%s' => %s...", results.left, operator, results.right, res)
            cb(null, res);
        });
    }
}

type ExpressionFunction = (cb: (err: Error, result: string) => void) => void;

function expression(c: Parser.Parse): ExpressionFunction {
    let document = <ConfigLoader>c.context().doc;

    let res = c.oneOf(
        stringValue
    );

    if (typeof res == 'string') {
        if (/^this\./.test(res)) {
            return <ExpressionFunction>document.sandboxedFunction("function (cb) {" +
                //"console.log('this. expression: %s', " + res + ");" +
                "cb(null, " + res + ");" +
                "}")
        }
        return function (cb: (err: Error, result: string) => void) {
            logger.debug("String expression '%s'.", res)
            cb(null, res);
        }
    }
    return res;
}

function action(c: Parser.Parse): ActionFunction {
    logger.debug('trying action:')
    c.skip(ACTION);
    logger.debug('found action:')
    return c.one(actionArray);
}

type NamedAction = { name: string, fct: ActionFunction };

function actionArray(c: Parser.Parse): ActionFunction {
    c.indent();
    let actions: NamedAction[] = <any>c.many(
        (c: Parser.Parse) => {
            c.skip(/^- */);
            return c.one(singleAction);
        },
        (c: Parser.Parse) => { c.newline() });

    let actionArrayFunction = function (cb: (err: Error) => void) {
        let self = this;
        async.eachSeries(actions, function (action, callback) {
            logger.debug("Calling action '%s'...", action.name);
            action.fct.call(self, callback);
        }, function (err: Error) {
            logger.debug('Done calling actions in series.')
        });
    };
    c.dedent();
    return actionArrayFunction;
}

function singleAction(c: Parser.Parse): NamedAction {
    logger.debug("trying singleAction")
    let res: { name: string, fct: ActionFunction } = <any>c.oneOf(
        namedAction,
        unnamedAction
    )
    eatComments(c);
    logger.debug("found singleAction")
    return res;
}

function unnamedAction(c: Parser.Parse): NamedAction {
    logger.debug("trying unnamedAction")
    let document = <ConfigLoader>c.context().doc;
    let fct: ActionFunction = <ActionFunction><any>c.oneOf(
        (c: Parser.Parse) => {
            return document.sandboxedExtFunction(c.one(FUNCTION_EXT));
        },
        stateAction
    );
    eatComments(c);
    logger.debug("found unnamedAction")
    return { name: "<noname>", fct: fct };

}

function namedAction(c: Parser.Parse): NamedAction {
    logger.debug("trying namedAction")
    let name = trim(c.one(ID));
    c.skip(/^ *: */);

    let f = c.one(unnamedAction).fct;
    logger.debug("found namedAction")

    return { name: name, fct: f };
}

function stateAction(c: Parser.Parse): ActionFunction {
    logger.debug("trying stateAction")
    c.skip(/^ *{ */);
    c.skip(/^device: */);

    let document = <ConfigLoader>c.context().doc;
    let devices: string[] = [];
    for (let d in c.context().devices) {
        devices.push(d)
    }

    let device = c.oneOf(...devices);
    c.skip(/^, */);
    c.skip(/^attribute: */);
    let attribute = c.one(stringValue);
    c.skip(/^, */);
    c.skip(/^value: */);
    let value = c.one(stringValue);
    c.skip(/^ *} */);

    logger.debug("found stateAction")

    return function (cb: (err: Error) => void) {
        this.getDevice(device) && this.getDevice(device).setAttribute(attribute, value, cb)
    }
}


function namedObject(c: Parser.Parse): { name: string, object: { [x: string]: value } } {
    logger.debug('=>named object')
    let name = trim(c.one(ID));
    logger.debug('found id', name)
    if (c.context().type == 'source') {
        if (c.context().sources[name])
            c.expected('not "' + name + '" (duplicate source)')
    }

    c.skip(/^ *: */);
    logger.debug('found :')
    let obj = c.one(object);
    logger.debug('found object', obj)
    return { name: name, object: obj };
}

function getDeviceParameters(c: Parser.Parse, type: DeviceType, source: Source, sourcename: string): Parameters {
    let parameters: Parameters = {}
    try {
        parameters = source.getDeviceParameters(type);
    } catch (e) {
        logger.warn("Source '%s' does not support device type '%s' at %s%d:%d\n%s",
            source == DEFAULT_SOURCE ? "DEFAULT_SOURCE" : sourcename,
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
        allowedKeys.push("type", "name", "source", "attribute", "id", "camera", "transform");
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
                source = DEFAULT_SOURCE;
                parameters = getDeviceParameters(c, obj['type'] as DeviceType, source, 'DEFAULT_SOURCE')
                Object.keys(parameters).forEach(key => {
                    if (allowedKeys.indexOf(key) == -1)
                        allowedKeys.push(key)
                });
            }
        }

        logger.debug('allowedKeys:', allowedKeys)
        var key = c.oneOf(...allowedKeys);
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
        obj[key] = val;

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
                            c.expected('a valid source ('  + allowedSources.join(' or ') + '). Did you import it?');
                    } else {
                        source = c.context().sources[obj.source].source;
                    }

                    parameters = getDeviceParameters(c, obj.type as DeviceType, source, obj.source)
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
                    if (allowedKeys.indexOf(key) == -1)
                        allowedKeys.push(key)
                });
            }
            first = false;
            second = true;
        }

        allowedKeys.splice(allowedKeys.indexOf(key), 1);

        if (!isJson) eatComments(c);
    }, isJson ? /^ *, *\n? */ : /^ *\n */);
    logger.debug('found all key/value pairs')
    if (indented) {
        c.dedent();
        isJson && c.newline();
    }
    logger.debug('about to check all required keys have been provided')
    logger.debug('remaining keys:', allowedKeys)
    // check that all required keys have been provided
    allowedKeys.forEach(key => {
        logger.debug('parameters[%s]:', key, parameters[key])
        if (parameters[key] == 'REQUIRED') {
            c.expected('"' + key + '"');
        }
    })
    logger.debug('checked all required keys have been provided')

    isJson && c.skip(/^ *} */);
    logger.debug('<=object')
    return obj;
}

function stringValue(c: Parser.Parse): string {
    let s = c.oneOf(
        STRING,
    );
    if (s && (s.charAt(0) == "'" || s.charAt(0) == '"')) {
        s = s.substr(1, s.length - 2)
    }
    return s;
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
    c.skip(/^- */);
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

function emptyLine(c: Parser.Parse): any {
    console.log('empty line content found')
}

function eatComments(c: Parser.Parse): void {
    c.optional((c) => {
        c.skip(/^ *(#.*)?(\n *#.*)*/)
    });
}
/*let document = <doc>c.context().doc;
 
    let comments = true;
    do {
        if (c.isNext(/^\n/)) {
            logger.debug('empty line')
            document.comments[c.location().line()] = '';
            c.skip('\n')
            //c.newline();
        } else if (c.isNext(BLANKLINE)) {
            logger.debug('blank line')
            document.comments[c.location().line()] = c.one(BLANKLINE);
            c.skip('\n')
            //c.newline();
        } else if (c.isNext(COMMENT)) {
            logger.debug('comment')
            document.comments[c.location().line()] = c.one(COMMENT);
            c.skip('\n')
            //c.newline();
        } else {
            logger.debug('rien')
            comments = false;
        }
    } while (comments);
}
*/
function eatCommentsBlock(c: Parser.Parse): string {
    let comments = true;
    let block = "";
    do {
        if (c.isNext(/^\n/)) {
            logger.debug('empty line')
            block += '\n';
            c.newline();
        } else if (c.isNext(BLANKLINE)) {
            logger.debug('blank line')
            block += c.one(BLANKLINE) + '\n';
            c.newline();
        } else if (c.isNext(COMMENT)) {
            logger.debug('comment')
            block += c.one(COMMENT) + '\n';
            logger.debug('=>', block)
            c.newline();
        } else {
            logger.debug('rien')
            comments = false;
        }
    } while (comments);
    return block;
}


export function loadFileSync(file: string) {

    let document = new ConfigLoader(file);
    document.parse(file);
    //console.log(document)
    //console.log(document.unparse());

    return document;
}

//loadFileSync('./config/config.yml');


export let sources: Map<sourceItem> = {};
//export let deviceTypes: { [x: string]: Function } = {};
export let devices: Map<deviceItem> = {};

export function getDevice(path: string): GenericDevice {
    //logger.debug(devices);
    let d = findByPath(devices, path)
    if (!d) logger.warn("Device '%s' not found, at:\n", path, (new Error("Device not found").stack))
    //    return d.device;
    return d ? d.device : undefined;
}

export function getSource(sourceID: string): Source {
    //logger.debug(sources)
    let s = findByPath(sources, sourceID)
    if (!s) logger.warn("Source '%s' not found in", sourceID, sources, " at:\n", (new Error("Source not found")).stack)
    //    return s.source
    return s ? s.source : undefined;
}

function setDeviceState(path: string, state: string, callback: (err: Error) => void): void {
    try {
        getDevice(path).setState(state, (err) => {
            callback && callback(err);
        });
    } catch (err) {
        callback && callback(err);
    }
}

function getID<T>(list: { [id: string]: T }, ID: string): string {
    logger.debug('Looking for ID %s', ID);
    var len = ID.length + 1;
    for (var d in list) {
        if (d.substr(d.length - len) == '.' + ID) {
            logger.debug('Found ID %s for %s', d, ID);
            return d;
        }
    }
    return undefined;
}

function findByPath<T>(list: { [id: string]: T }, ID: string): T {
    let id = list[ID];

    if (id) return id;

    let d = getID(list, ID);

    if (d) return list[d];

    return undefined;
}

var sandbox; // for test and rewire

var currentConfig: ConfigLoader;

export function getCurrentConfig() {
    return currentConfig;
}

export function reloadConfig(file?: string): void {

    const confFile = './config/config.yml';

    if (!file) file = confFile;

    let doc = loadFileSync(file);
    if (!doc) return;

    sandbox = doc["sandbox"];

    sources = doc.sources;
    //deviceTypes = doc.deviceTypes;
    devices = doc.devices;

    currentConfig && currentConfig.release();
    currentConfig = doc;

    logger.info('ConfigLoader emitted "startup"')
    doc.emit('startup');
}

import { IVerifyOptions } from 'passport-local';

export function checkUser(username: string, password: string, done: (error: any, user?: any, options?: IVerifyOptions) => void) {
    return currentConfig.userMgr.checkUser(username, password, done);
}

export function findUserById(id: string, fn: (err: Error, user: User) => void) {
    return currentConfig.userMgr.findUserById(id, fn);
}
