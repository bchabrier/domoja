[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![Build Status](https://travis-ci.org/bchabrier/domoja.svg?branch=master)](https://travis-ci.org/bchabrier/domoja) [![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Dependency Status](https://david-dm.org/bchabrier/domoja.svg)](https://david-dm.org/bchabrier/domoja) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)

domoja
======

A Typescript framework for home automation

Introduction
------------
This framework allows to create home automation applications.

The server part is written in Typescript, while the GUI uses Angular and Ionic.

Here are some screenshots of the application:

<div>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680587-4df7f310-983e-11e8-97d5-3eb9bd6e2969.png>
<img width=10px>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680588-4e3c3eda-983e-11e8-97de-d9045a0befc4.png>
<img width=10px>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680580-4c615bb8-983e-11e8-8ddc-c8b339eb1e23.png>
<img width=10px>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680581-4c9c2630-983e-11e8-8cc5-76c4d3b4af61.png>
<img width=10px>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680582-4cd0b9f4-983e-11e8-87db-b248e6b9ea78.png>
<img width=10px>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680583-4d0c156c-983e-11e8-96b9-e13bc345808b.png>
<img width=10px>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680584-4d3b5214-983e-11e8-9a75-298a0c7787b6.png>
<img width=10px>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680585-4d78bd5c-983e-11e8-8f76-12f448d86a66.png>
<img width=10px>
<img height=230px src=https://user-images.githubusercontent.com/7472805/43680586-4daf4f20-983e-11e8-8c40-d8206ed57959.png>
</div>

Concepts
--------

Domoja collects information from and interacts with devices through sources. You can think of sources as sources of information.

### Sources


### Devices

The framework supports a range of devices:
- device: a generic device with attributes which can be set or get.
- relay: a particular switch, for which delays can be configured.
- variable: a special device that contains a value which can be read or written.



Modules
-------

Domoja can be extended through modules, to add new sources, devices, etc. They are essentially `npm` modules following particular specifications:
- their name must start with `domoja-`
- they must derive from `domoModule`

### Available modules

The following modules are currently available:

[//]: # (modulesList START)
- [domoja-core](https://www.npmjs.com/package/domoja-core): Core components of Domoja
- [domoja-freebox](https://www.npmjs.com/package/domoja-freebox): The Freebox domoja module
- [domoja-ipx800](https://www.npmjs.com/package/domoja-ipx800): IPX800 source for Domoja
- [domoja-proxiti](https://www.npmjs.com/package/domoja-proxiti): Astronomy source for Domoja from http://www.proxiti.info/
- [domoja-sample](https://www.npmjs.com/package/domoja-sample): A sample Domoja module skeleton
- [domoja-tempo](https://www.npmjs.com/package/domoja-tempo): EDF Tempo information for Domoja from https://particulier.edf.fr/fr/accueil/contrat-et-conso/options/ejp.html
- [domoja-voice-google](https://www.npmjs.com/package/domoja-voice-google): Allows Domoja to speak, thanks to Google
- [domoja-zibase](https://www.npmjs.com/package/domoja-zibase): ZiBase source for Domoja

[//]: # (modulesList END)

### Adding a new module

Before importing a module in the config file, you need to make it available. In the domoja directory, use `yarn add <themodule>`.

If you are developing the module, you might want to add it linked:
```
$ cd <themodule_dir>
$ yarn link
$ cd <domoja_dir>
$ yarn link <themodule>
```

### How to develop a new module

Developers can develop new Domoja modules. For this, proceed this way:
- Copy the `domoja/modules/sample` repository.
- Update `package.json`. Note that the module name must start with `domoja-`
- You can find in `sources/sample.ts` a sample source, 
- Link your module using `cd <yourmodule_dir>; yarn link` and `cd <domoja_dir>; yarn link "domoja-<yourmodule>"`
- You can now import your module from the config file.

It can be convenient to setup a small test file and run it with `nodemon`. This will make it possible to automatically restart the test execution when the module source is modified, and also to debug with Chrome for instance.

Example:
File test_module.ts:
```
import { MyModule } from 'domoja-samplemodule';

let freebox = new MyClass('path', 'some', 'parameters');

```

and run it with:
`nodemon --ext ts --watch test-module.ts --watch <module_dir> --exec node --inspect=0.0.0.0 --require ts-node/register test-module.ts`


## API

Domoja provides a REST/JSON api, which is available through Swagger at [/api-docs](http://localhost/api-docs).

[//]: # (apiList START)
- GET /app: Retrieve the app data
- POST /app/demo-mode: Set the app demo mode
- GET /devices: Retrieves the list of devices
- GET /devices/{id}: Retrieves a device
- POST /devices/{id}: Sends a command to a device
- GET /devices/{id}/snapshot: Get a snapshot from a camera device
- GET /devices/{id}/stream: Get a stream from a camera device
- GET /devices/{id}/history: Get the history of a device
- GET /pages: Retrieves the list of pages

[//]: # (apiList END)

## Persistence

Device states can be persisted using MongoDB. By default, all states that are numbers are persisted.
Persistence can be specified through the `persistence` attribute:
`persistence: "<persistence-module>:<id>:0:<aggregation mode>:<keep>"`
`<persistence-module>` is `mongo` by default.
`<id>` specifies the id of the device to be persisted. If not specified, then the path of the device is used. Specifying the id is useful if you want to be sure to keep the persisted states even if you change the path of the device.
`<aggregation mode>`: one of `year`, `month`, `day`, `hour`, `minute`, `none`
`<keep>`: duration to persist the states, in seconds.

## User Interface

Domoja comes with a generic user interface based on [Ionic](https://ionicframework.com/). The files are located in the `www` directory, and generated by [domoja-ui](https://github.com/bchabrier/domoja-ui).

## HomeKit and Siri integration

Domoja can be easily integrated with HomeKit through the great [homebridge](https://www.npmjs.com/package/homebridge). Once Homebridge is installed, the best is to create an API key. Then you can add accessories in homebridge's `config.json` file.

Example for a switch:
```
{
      "accessory": "HTTP-SWITCH",
      "name": "Lampe préau",
      "switchType": "stateful",
      "pullInterval": 5000,
      "onUrl": {
        "url": "https://XXX/devices/lampes.lampe_preau",
        "method": "POST",
        "body": "command=ON",
        "auth": {
          "username": "XX",
          "password": "XX"
        },
        "headers": {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      },
      "offUrl": {
        "url": "https://XXX/devices/lampes.lampe_preau",
        "method": "POST",
        "body": "command=OFF",
        "auth": {
          "username": "XX",
          "password": "XX"
        },
        "headers": {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      },
      "statusUrl": {
        "url": "https://XXX/devices/lampes.lampe_preau",
        "method": "GET",
        "auth": {
          "username": "XX",
          "password": "XX"
        }
      },
      "statusPattern": "\"ON\""
    }
```

Example for a sensor:
```
    {
      "accessory": "HTTP-TEMPERATURE",
      "name": "Température piscine",
      "debug": 1,
      "getUrl": {
        "url": "https://XXX/devices/piscine.temperature",
        "method": "GET",
        "auth": {
          "username": "XX",
          "password": "XX"
        }
      },
      "statusPattern": ".*\"state\":\"\\+?(-?[0-9]+\\.[0-9]*)\"",
      "patternGroupToExtract": 1
    },
```

Siri is then available on iOS through the Home application.

## To do

- Use KEEP for persistence
- Temperature graphs
    - passer par API pour renvoyer sur login si non connecté
- Siri integration
- implement TRACE in yml files
- MQTT source
- reactiver la voix
- source Freebox

## Issues

- on config reload it seems that we get mongodb drain
- sur iOS revenir sur l'app ne fonctionne pas toujours
- lumieres clignotantes a fixer

### Fixed

- en cas de script timeout on n'a plus de logging info ?!?! -> https://github.com/patriksimek/vm2/issues/306


