import { Source, message, ConfigLoader, InitObject, Parameters, GenericDevice } from 'domoja-core';
import * as https from 'https';
import * as CryptoJS from 'crypto-js';

var logger = require("tracer").colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

type JSONobject = { [x: string]: string | boolean | number | JSONobject | Array<string | boolean | number | JSONobject> };

function shortString(o: any): string {
    const max = 256;
    let s: string = require('util').inspect(o);
    if (s.length <= max) return s;

    if (s.indexOf('\n') >= 0) {
        let mid = (max - 11) / 2;
        let f = s.indexOf('\n', mid);
        let l = s.lastIndexOf('\n', s.length - mid);
        //console.log("mid=", mid, "f=", f, "l=", l, "length=", s.length)
        //console.log("mid-f=>", s.substring(mid,f))
        //console.log("l-=>", s.substr(l))
        if (f >= l) return s;
        return s.substr(0, f) + '\n...\n' + s.substr(l + 1);
    }
    return s.substr(0, (max - 7) / 2) + '... ...' + s.substr(s.length - (max - 7) / 2);
}

export class Freebox extends Source {

    private readonly app_id = "domoja";
    //private readonly app_id = "freeboxOS";
    private readonly app_name = "Freebox Module";
    private readonly app_version = "0.0.1";
    private readonly device_name = "Domoja";
    private host: string;
    private api_version: string;
    private api_base_url: string;
    private challenge: string;
    private session_token: string;
    private pendingLogin = false;
    private loginCallbacks: ((err: Error, res: JSONobject) => void)[] = [];
    private cache: { [k: string]: string } = {};
    private pollIntervals: {
        [api: string]: {
            interval: number,
            timeout: NodeJS.Timeout
        }
    } = {};
    private polling = false;

    constructor(path: string, private URL: string, private app_token: string, initObject: InitObject, callback?: (err: Error) => void) {
        super(path, initObject);
        this.host = this.URL.replace(/http(s?):\/\/([^\/]+)\/?/, "$2");
        // make a request, to connect and initiate polling
        this.requestFromFreebox('/call/log/', null, (err, res) => {
            if (err) logger.error(err, res);
        });
        callback && callback(null);
    }

    addDevice(device: GenericDevice): void {
        if (!this.pollIntervals[device.id]) {
            let interval = 0;
            switch (device.id) {
                case '/lan/browser/pub/':
                    interval = 60 * 1000;
                    break;
                case '/call/log/':
                    interval = 1000;
                    break;
            }
            this.pollIntervals[device.id] = {
                timeout: undefined,
                interval: interval
            };
        }
        super.addDevice(device);
    }

    releaseDevice(device: GenericDevice): void {
        if (this.pollIntervals[device.id]) {
            delete this.pollIntervals[device.id];
        }
        super.releaseDevice(device);
    }

    public startPolling() {
        if (this.polling) return;

        this.polling = true;
        let poll = (api: string, interval: number) => {
            this.requestFromFreebox(api, null, (err, res) => {
                if (err) logger.error(`Error in freebox '${this.path}' while requesting '${api}':`, err, res);
                else if (!res) logger.error('res is null', res);
                else if (typeof res != 'object') logger.error(`res is not an object: ${res}`, res);
                else if (res.success != true) logger.error('Success is not true', res);
                else if (typeof res.result != 'object') logger.error(`res.result is not an object: ${res.result}`, res);
                else {
                    let result = JSON.stringify(res.result);
                    if (result != this.cache[api]) {
                        this.updateAttribute(api, 'state', result, new Date);
                        this.cache[api] = result;
                    }
                }
                if (this.pollIntervals[api]) this.pollIntervals[api].timeout = setTimeout(() => poll(api, interval), interval);
            });
        }

        Object.keys(this.pollIntervals).forEach(api => {
            if (this.pollIntervals[api].interval) poll(api, this.pollIntervals[api].interval);
        });

    }

    public stopPolling() {
        Object.keys(this.pollIntervals).forEach(api => {
            this.pollIntervals[api].timeout && clearTimeout(this.pollIntervals[api].timeout);
            this.pollIntervals[api].timeout = null;
        });
        this.polling = false;
    }

    public requestAuthorization(callback: (err: Error, response: JSONobject) => void) {
        this.requestFromFreebox('/login/authorize/', {
            "app_id": this.app_id,
            "app_name": this.app_name,
            "app_version": this.app_version,
            "device_name": this.device_name
        }, (err, res) => {
            if (err) return callback(err, res);
            if (!res) return callback(new Error('res is null'), res);
            if (typeof res != 'object') return callback(new Error(`res is not an object: ${res}`), res);
            if (typeof res.result != 'object') return callback(new Error(`res.result is not an object: ${res.result}`), res);
            if (Array.isArray(res.result)) return callback(new Error(`res.result is an array: ${res.result}`), res);
            if (res.success != true) return callback(null, res);

            let app_token = res.result.app_token;
            let track_id = res.result.track_id;

            logger.warn(`app_token = "${app_token}". Go to your Freebox and validate.`);

            // do the monitoring of the authorization
            let waitNonPendingStatus = (callback: (err: Error, response: JSONobject) => void) => {
                this.requestFromFreebox('login/authorize/' + track_id, null, (err, res) => {
                    if (err) return callback(err, res);
                    if (!res) return callback(new Error('res is null'), res);
                    if (typeof res != 'object') return callback(new Error(`res is not an object: ${res}`), res);
                    if (typeof res.result != 'object') return callback(new Error(`res.result is not an object: ${res.result}`), res);
                    if (Array.isArray(res.result)) return callback(new Error(`res.result is an array: ${res.result}`), res);
                    if (res.success != true) return callback(null, res);

                    let status = res.result.status;

                    if (status == 'pending') {
                        setTimeout(() => {
                            waitNonPendingStatus(callback);
                        });
                    } else {
                        callback(null, res);
                    }
                });
            }

            waitNonPendingStatus(callback);
        });
    }

    private login(callback: (err: Error, response: JSONobject) => void) {
        if (this.pendingLogin) {
            this.loginCallbacks.push(callback);
            return;
        }

        this.pendingLogin = true;

        let version = parseInt(this.api_version);
        let loginapi = this.api_base_url + '/v' + version + '/login/session';
        loginapi = loginapi.replace(/\/+/g, '/');

        //logger.warn('app_token', this.app_token);
        //logger.warn('challenge', this.challenge);

        let password = CryptoJS.HmacSHA1(this.challenge, this.app_token).toString(CryptoJS.enc.Hex);

        let loginData = {
            app_id: this.app_id,
            password: password
        };

        return this._requestFromFreebox(loginapi, loginData, (err, res) => {
            if (!err && res && typeof res == 'object' && res.success && typeof res.result == 'object' && !Array.isArray(res.result) && typeof res.result.session_token == 'string') {
                this.session_token = res.result.session_token;
                this.startPolling();
            }

            callback(err, res);
            this.pendingLogin = false;
            this.loginCallbacks.forEach(cb => {
                cb(err, res);
            });
            this.loginCallbacks = [];
        });
    }

    public logout(callback: (err: Error, response: JSONobject) => void) {
        let version = parseInt(this.api_version);
        let logoutapi = this.api_base_url + '/v' + version + '/login/logout';
        logoutapi = logoutapi.replace(/\/+/g, '/');

        this.stopPolling();
        this._requestFromFreebox(logoutapi, {}, callback);
    }

    public requestFromFreebox(api: string, postData: JSONobject, callback: (err: Error, response: JSONobject) => void) {
        if (!this.api_version) {
            logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'No api_version, requesting it...');
            return this._requestFromFreebox('/api_version', null, (err, res) => {
                logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'Requested api_version, checking errors...');
                if (err) return callback(err, res);
                if (!res) return callback(new Error('res is null'), res);
                if (typeof res != 'object') return callback(new Error(`res is not an object: ${res}`), res);
                if (typeof res.api_version != 'string') return callback(new Error(`res.api_version is not a string: ${res.api_version}`), res);
                this.api_version = res.api_version;
                if (typeof res.api_base_url != 'string') return callback(new Error(`res.api_base_url is not a string: ${res.api_base_url}`), res);
                this.api_base_url = res.api_base_url;

                logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'Got api_version:', this.api_version);
                logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'Continuing with payload request...');
                this.requestFromFreebox(api, postData, callback);
            });
        }
        let version = parseInt(this.api_version);
        let versioned_api = this.api_base_url + '/v' + version + '/' + api;
        versioned_api = versioned_api.replace(/\/+/g, '/');
        logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'requesting', versioned_api);
        this._requestFromFreebox(versioned_api, postData, (err, res) => {
            logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'requested', versioned_api, 'checking for errors...');
            if (err) return callback(err, res);
            if (!res) return callback(new Error('res is null'), res);
            if (typeof res != 'object') return callback(new Error(`res is not an object: ${res}`), res);
            if (typeof res.result != 'object') return callback(new Error(`res.result is not an object: ${res.result}`), res);

            logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'no error, res:', shortString(res));

            if (res.success == false && res.error_code == 'auth_required') {
                logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'authentication is needed, checking challenge for errors');
                // authentication is needed
                if (Array.isArray(res.result)) return callback(new Error(`res.result is an array: ${res.result}`), res);
                if (typeof res.result.challenge != 'string') return callback(new Error(`res.result.challenge is not a string: ${res.result.challenge}`), res);
                this.challenge = res.result.challenge;

                logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'authentication is needed, no error, doing login');

                this.login((err, res) => {
                    logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'login done, processing with request...');
                    return this._requestFromFreebox(versioned_api, postData, callback);
                });
            } else {
                logger.debug(`In freebox '${this.path}' while requesting '${api}':`, 'no error, got success, calling callback');
                callback(null, res);
            }
        });
    }

    private _requestFromFreebox(api: string, postData: JSONobject, callback: (err: Error, response: JSONobject) => void) {
        while (api.startsWith('/')) api = api.substr(1);
        let response = '';
        logger.debug('Sending request to Freebox "%s":', this.path, this.URL + '/' + api);
        let options: https.RequestOptions = {
            ca: `
##
## CA Root Certificates for Freebox
##
## http://mafreebox.freebox.fr/doc/index.html
##

Freebox ECC Root CA

-----BEGIN CERTIFICATE-----
MIICWTCCAd+gAwIBAgIJAMaRcLnIgyukMAoGCCqGSM49BAMCMGExCzAJBgNVBAYT
AkZSMQ8wDQYDVQQIDAZGcmFuY2UxDjAMBgNVBAcMBVBhcmlzMRMwEQYDVQQKDApG
cmVlYm94IFNBMRwwGgYDVQQDDBNGcmVlYm94IEVDQyBSb290IENBMB4XDTE1MDkw
MTE4MDIwN1oXDTM1MDgyNzE4MDIwN1owYTELMAkGA1UEBhMCRlIxDzANBgNVBAgM
BkZyYW5jZTEOMAwGA1UEBwwFUGFyaXMxEzARBgNVBAoMCkZyZWVib3ggU0ExHDAa
BgNVBAMME0ZyZWVib3ggRUNDIFJvb3QgQ0EwdjAQBgcqhkjOPQIBBgUrgQQAIgNi
AASCjD6ZKn5ko6cU5Vxh8GA1KqRi6p2GQzndxHtuUmwY8RvBbhZ0GIL7bQ4f08ae
JOv0ycWjEW0fyOnAw6AYdsN6y1eNvH2DVfoXQyGoCSvXQNAUxla+sJuLGICRYiZz
mnijYzBhMB0GA1UdDgQWBBTIB3c2GlbV6EIh2ErEMJvFxMz/QTAfBgNVHSMEGDAW
gBTIB3c2GlbV6EIh2ErEMJvFxMz/QTAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB
/wQEAwIBhjAKBggqhkjOPQQDAgNoADBlAjA8tzEMRVX8vrFuOGDhvZr7OSJjbBr8
gl2I70LeVNGEXZsAThUkqj5Rg9bV8xw3aSMCMQCDjB5CgsLH8EdZmiksdBRRKM2r
vxo6c0dSSNrr7dDN+m2/dRvgoIpGL2GauOGqDFY=
-----END CERTIFICATE-----

Freebox Root CA

-----BEGIN CERTIFICATE-----
MIIFmjCCA4KgAwIBAgIJAKLyz15lYOrYMA0GCSqGSIb3DQEBCwUAMFoxCzAJBgNV
BAYTAkZSMQ8wDQYDVQQIDAZGcmFuY2UxDjAMBgNVBAcMBVBhcmlzMRAwDgYDVQQK
DAdGcmVlYm94MRgwFgYDVQQDDA9GcmVlYm94IFJvb3QgQ0EwHhcNMTUwNzMwMTUw
OTIwWhcNMzUwNzI1MTUwOTIwWjBaMQswCQYDVQQGEwJGUjEPMA0GA1UECAwGRnJh
bmNlMQ4wDAYDVQQHDAVQYXJpczEQMA4GA1UECgwHRnJlZWJveDEYMBYGA1UEAwwP
RnJlZWJveCBSb290IENBMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA
xqYIvq8538SH6BJ99jDlOPoyDBrlwKEp879oYplicTC2/p0X66R/ft0en1uSQadC
sL/JTyfgyJAgI1Dq2Y5EYVT/7G6GBtVH6Bxa713mM+I/v0JlTGFalgMqamMuIRDQ
tdyvqEIs8DcfGB/1l2A8UhKOFbHQsMcigxOe9ZodMhtVNn0mUyG+9Zgu1e/YMhsS
iG4Kqap6TGtk80yruS1mMWVSgLOq9F5BGD4rlNlWLo0C3R10mFCpqvsFU+g4kYoA
dTxaIpi1pgng3CGLE0FXgwstJz8RBaZObYEslEYKDzmer5zrU1pVHiwkjsgwbnuy
WtM1Xry3Jxc7N/i1rxFmN/4l/Tcb1F7x4yVZmrzbQVptKSmyTEvPvpzqzdxVWuYi
qIFSe/njl8dX9v5hjbMo4CeLuXIRE4nSq2A7GBm4j9Zb6/l2WIBpnCKtwUVlroKw
NBgB6zHg5WI9nWGuy3ozpP4zyxqXhaTgrQcDDIG/SQS1GOXKGdkCcSa+VkJ0jTf5
od7PxBn9/TuN0yYdgQK3YDjD9F9+CLp8QZK1bnPdVGywPfL1iztngF9J6JohTyL/
VMvpWfS/X6R4Y3p8/eSio4BNuPvm9r0xp6IMpW92V8SYL0N6TQQxzZYgkLV7TbQI
Hw6v64yMbbF0YS9VjS0sFpZcFERVQiodRu7nYNC1jy8CAwEAAaNjMGEwHQYDVR0O
BBYEFD2erMkECujilR0BuER09FdsYIebMB8GA1UdIwQYMBaAFD2erMkECujilR0B
uER09FdsYIebMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMA0GCSqG
SIb3DQEBCwUAA4ICAQAZ2Nx8mWIWckNY8X2t/ymmCbcKxGw8Hn3BfTDcUWQ7GLRf
MGzTqxGSLBQ5tENaclbtTpNrqPv2k6LY0VjfrKoTSS8JfXkm6+FUtyXpsGK8MrLL
hZ/YdADTfbbWOjjD0VaPUoglvo2N4n7rOuRxVYIij11fL/wl3OUZ7GHLgL3qXSz0
+RGW+1oZo8HQ7pb6RwLfv42Gf+2gyNBckM7VVh9R19UkLCsHFqhFBbUmqwJgNA2/
3twgV6Y26qlyHXXODUfV3arLCwFoNB+IIrde1E/JoOry9oKvF8DZTo/Qm6o2KsdZ
dxs/YcIUsCvKX8WCKtH6la/kFCUcXIb8f1u+Y4pjj3PBmKI/1+Rs9GqB0kt1otyx
Q6bqxqBSgsrkuhCfRxwjbfBgmXjIZ/a4muY5uMI0gbl9zbMFEJHDojhH6TUB5qd0
JJlI61gldaT5Ci1aLbvVcJtdeGhElf7pOE9JrXINpP3NOJJaUSueAvxyj/WWoo0v
4KO7njox8F6jCHALNDLdTsX0FTGmUZ/s/QfJry3VNwyjCyWDy1ra4KWoqt6U7SzM
d5jENIZChM8TnDXJzqc+mu00cI3icn9bV9flYCXLTIsprB21wVSMh0XeBGylKxeB
S27oDfFq04XSox7JM9HdTt2hLK96x1T7FpFrBTnALzb7vHv9MhXqAT90fPR/8A==
-----END CERTIFICATE-----
            `
        }
        if (postData) {
            options.method = 'POST';
            options.headers = {
                'Content-Type': 'application/json'
            }
        }
        if (this.session_token) {
            options.headers = {
                "Host": this.host,
                "X-Fbx-App-Auth": this.session_token
            }
        }
        let req = https.request(this.URL + '/' + api, options, (res) => {
            res.on('data', (chunk) => { response += chunk });
            res.on('end', () => {
                logger.debug('Got response from Freebox "%s":\nRequest: %s %s\nResponse:', this.path, this.URL + '/' + api, postData ? require('util').inspect(postData) : "", shortString(response));

                let jsonResponse: JSONobject;
                try {
                    jsonResponse = JSON.parse(response);
                } catch (e) {
                    callback(e, { response: response });
                    return;
                }
                callback(null, jsonResponse);
            });
        }).on('error', (err) => {
            logger.error(err);
            callback(err, null);
        });
        postData && req.write(JSON.stringify(postData));
        req.end();
    }

    createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
        return new Freebox(path, initObject.URL, initObject.app_token, initObject);
    }

    getParameters(): Parameters {
        return {
            URL: 'REQUIRED',
            app_token: 'REQUIRED'
        }
    }

    doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
        if (attribute == 'state') {
            if (value == 'OFF') {
                // do the right stuff
                return callback(null);
            }
            if (value == 'ON') {
                // do the right stuff
                return callback(null);
            }
        }
        return callback(new Error('Unsupported attribute/value: ' + attribute + '/' + value))
    }

    release(): void {
        this.logout((err, res) => {
            if (err) logger.error(err, res);
            if (!res) logger.error('res is null');
            if (res.success != true) logger.error('Could not logout from freebox', this.path);
        });
        super.release();
    }

    static registerDeviceTypes(): void {
        Source.registerDeviceType(this, 'sensor', {
            source: 'REQUIRED',
            id: 'REQUIRED',
            transform: 'OPTIONAL',
        });
    }
}


