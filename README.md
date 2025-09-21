[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Node.js CI](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml) [![CodeQL](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)

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

Installation
------------

```sh
# install domoja and domoja-core
$ yarn add domoja domoja-core 

# install tempo and proxiti modules to run the demo
$ yarn add domoja-tempo domoja-proxiti

# run the demo on http://localhost:8700
$ yarn domoja -p 8700 --dev
```

Concepts
--------

Domoja collects information from and interacts with devices through sources. You can think of sources as sources of information.

### Sources

A source provides information about, and allows controlling a certain set of devices.

To use a source, it is necessary to load its type in Domoja. Some source types are predefined in Domoja, some others can be add by extension modules:
```
$ yarn add domoja-<source-module>
```

Once loaded in Domoja, the module providing the source type needs to be imported in the configuration before a source of this type can be declared and then referenced by a device.

The example below shows how to create the source `myAstronomy` of type `astronomy` from the module `proxity`, to get the sunrise time:
```
$ yarn add domoja-proxiti
```
```
imports:
  - module: proxiti
    source: astronomy

sources:
  - myAstronomy: {
      type: astronomy,
      location: "06030"
  }

devices:
  - sunrise: { type: device, widget: text, tags: 'astronomyTag', source: myAstronomy, id: sunriseTime, name: "Lever du soleil" }

```

[//]: # (sourcesList START)

Source type | Module | Description
----------- | ------ | -----------
astronomy | [proxiti](https://www.npmjs.com/package/domoja-proxiti) | This source provides astronomy information from http://www.proxiti.info/horaires_soleil.php?o=06030<br>This includes sunset, sunrise, dawn, dusk, zenith times, and day duration, at a specific location.<br>Parameters:<ul><li> location: the code corresponding to your location. Use https://www.proxiti.info/index.php to find it.</li><br></ul>Example:<pre><code>sources:</code><br><code>  - astronomy: {</code><br><code>    type: astronomy,</code><br><code>    location: "06030"</code><br><code>  }</code><br><code></code><br><code>devices:</code><br><code>  - sunset: { type: device, widget: text, tags: 'astronomy', source: astronomy, id: sunsetTime, name: "Coucher du soleil" }</code><br><code></code></pre>
command | core/sources/command | Source implemented with shell commands:<ul><li> parameters define the shell commands to execute when a device takes a given value</li>  Example with parameters `ON` and `OFF` :<pre><code>- sources:</code><br><code>  - robonect-command: {</code><br><code>    type: command,</code><br><code>    ON: "bash -c \\"curl 'http://192.168.0.16/xml?cmd=start' -s -K- <<< \\\\\\"--user \$(grep robonectBasicAuth config/secrets.yml \| sed -e 's!^ *[^:][^:]*: *!!' -e 's/[\\r\\n]//g')\\\\\\"\\"",</code><br><code>    OFF: "bash -c \\"curl 'http://192.168.0.16/xml?cmd=stop' -s -K- <<< \\\\\\"--user \$(grep robonectBasicAuth config/secrets.yml \| sed -e 's!^ *[^:][^:]*: *!!' -e 's/[\\r\\n]//g')\\\\\\"\\""</code><br><code>  }</code><br><code></code></pre><li> the optional parameter `pushupdates` is a shell command executed once as a daemon at the creation of the source</li><ul><li>   it allows to emit changes of device state values                      </li><li>   it shoud produce stdout output in the form `{"id": "<device_id>", "attribute": "<attribute>", "value": "<value>"}`, e.g. `{"id": "temp", "attribute": "state", "value": "10 °C"}`</li><li>   the daemon will be killed when the source is released, but to avoid zombie processes to be created, it is good to guard a loop by checking the parent process, for example:</li><pre><code>while [ \$(ps -o ppid= \$\$) != 1 ]; do <commands>; sleep 60; done</code><br><code></code></pre><li>   available variables are:</li><ul><li>     ID: id of the device using the source</li><li>     SOURCE: the path of the source</li><li>     DEBUG: debug mode of the source ('0'\|'1') </li><br></ul></ul></ul>Example: <pre><code>sources:</code><br><code>- disk-usage: {</code><br><code>  type: command,</code><br><code>  push-updates:  "</code><br><code>    while [ \$(ps -o ppid= \$\$) != 1 ]</code><br><code>    do </code><br><code>      df -k \| awk '{</code><br><code>          mount=\$6</code><br><code>          percent=\$5</code><br><code>          str=\\"{ \\\\\\"id\\\\\\": \\\\\\"\\"mount\\"\\\\\\", \\\\\\"attribute\\\\\\": \\\\\\"state\\\\\\", \\\\\\"value\\\\\\": \\\\\\"\\"percent\\"\\\\\\"}\\"</code><br><code>          if ('\$DEBUG') print str > \\"/dev/stderr\\" # debug</code><br><code>          print str</code><br><code>      }'</code><br><code>      sleep 60</code><br><code>    done</code><br><code>  "</code><br><code>}</code><br><code></code></pre>
Freebox | [freebox](https://www.npmjs.com/package/domoja-freebox) | 
IPX800 | [ipx800](https://www.npmjs.com/package/domoja-ipx800) | This source connects to IPX800 devices from GCE Electronics.<br>Example:<pre><code>sources:</code><br><code>- myIPX800: {</code><br><code>    type: IPX800,</code><br><code>    ip: 192.168.0.17,</code><br><code>    macaddress: 00:04:A3:2D:68:E6,</code><br><code>    update_url: /ipx800/update,</code><br><code>    timeout: 60</code><br><code>}</code><br><code></code></pre>
Mqtt | [mqtt](https://www.npmjs.com/package/domoja-mqtt) | 
Openzwave | [openzwave](https://www.npmjs.com/package/domoja-openzwave) | Domoja source to connect to ZWave devices<br>Example:<pre><code>sources:</code><br><code>  - ZStick: {</code><br><code>      type: Openzwave,</code><br><code>      debug: false,</code><br><code>      driverLogLevel: "silly",</code><br><code>      port: /dev/ttyACM0</code><br><code>  }</code><br><code>devices:</code><br><code>- zwave:</code><br><code>   - controller : { type: device, widget: "multistate:INCLUSION,INCLUSION_NON_SECURE,EXCLUSION,NO_INCLUSION_EXCLUSION:secondary,secondary,danger,primary:Inclure,Inclure non séc.,Exclure,Stop", tags: 'zwave', source: ZStick, id: "1", attribute: "inclusion_mode", name: "Controleur"} </code><br><code>   - config : { type: device, widget: "zwave-config", tags: 'zwave', source: ZStick, id: "1", attribute: "zwave_config", name: "ZWave config"} </code><br><code>   - grand: { type: device, widget: text, tags: 'portails', source: ZStick, id: "16-37-2-currentValue", name: "Petit Portail ouvert en grand", camera: camera_exterieure }</code><br><code></code></pre>
Sample | [sample](https://www.npmjs.com/package/domoja-sample) | A source derives from the `Source` class and implements the following methods:<ul><li> `createInstance`: create an instance of the source, taking into account the requested configuration</li><li> `getParameters`: describes the parameters supported by the source</li><li> `doSetAttribute`: implements a requested change of value of an attribute of a device managed by the source</li><li> `release`: releases a source to free any used resource</li><li> `registerDeviceTypes`: a static method to declare which device types are supported by the source</li>
tempo | [tempo](https://www.npmjs.com/package/domoja-tempo) | Cette source récupère les informations de couleur de période auprès de l'EDF, pour le jour courant et le lendemain.<br>Exemple:<pre><code>sources:</code><br><code>  - tempo: { type: tempo }</code><br><code></code><br><code>devices:</code><br><code>  - tempo:</code><br><code>  - couleur_du_jour : { type: device, widget: tempo-color, tags: 'tempo', source: tempo, id: couleurDuJour, name: "Couleur du jour" }</code><br><code>  - couleur_de_demain : { type: device, widget: tempo-color, tags: 'tempo', source: tempo, id: couleurDeDemain, name: "Couleur de demain" }</code><br><code></code></pre>
VoiceByGoogle | [voice-google](https://www.npmjs.com/package/domoja-voice-google) | 
Zibase | [zibase](https://www.npmjs.com/package/domoja-zibase) | This source connects to a Zibase device.<br>Not used anymore as Zodianet company is now dead for years...<br>

[//]: # (sourcesList END)

### Devices

The framework supports a range of devices:
- device: a generic device with attributes which can be set or get.
- relay: a particular switch, for which delays can be configured.
- variable: a special device that contains a value which can be read or written.
- group: a device whose state is computed from other devices state, selected by their tags.



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
- [domoja-mqtt](https://www.npmjs.com/package/domoja-mqtt): The MQTT domoja module
- [domoja-openzwave](https://www.npmjs.com/package/domoja-openzwave): Openzwave source for Domoja
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


API
---

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

Persistence
-----------

Device states can be persisted using MongoDB. By default, all states that are numbers are persisted.

Persisted state data is categorized into several data sets:
- raw: all data is stored as is for each date
- change: only changes are stored (duplicate consecutive values are ignored)
- minute: one value per minute (average, we keep the sum and count of values to compute the average)
- hour: one value per hour (average, we keep the sum and count of values to compute the average)
- day: one value per day (average, we keep the sum and count of values to compute the average)
- week: one value per week (average, we keep the sum and count of values to compute the average)
- month: one value per month (average, we keep the sum and count of values to compute the average)
- year: one value per year (average, we keep the sum and count of values to compute the average)

Persistence can be specified through the `persistence` attribute:

`persistence: "<persistence-module>:<id>:<aggregation mode>:<keep>"`
* `<persistence-module>` is `mongo` by default.
* `<id>` specifies the id of the device to be persisted. If not specified, then the path of the device is used. Specifying the id is useful if you want to be sure to keep the persisted states even if you change the path of the device.
* `<aggregation mode>`: one of `change`, `raw` or  `aggregate`.
  - `change` will keep the `change` data set
  - `raw` will keep the `change` and `none` data sets
  - `aggregate`will keep the `change`, `none`, plus for numerical values, the `minute`, `hour`, `day`, `week`, `month` and `year` data sets
* `<keep>`: One or two comma-separated durations indicating how long to persist the states. In case `aggregate` mode is specified, the field contains 2 durations, the first one applies to raw data, while the second one applies to the aggregated data. Durations can be a number (or calculation) of minutes, or a specification of years, months, weeks, days, hours, minutes. A duration of 0 means that data is kept indefinitely.

  Example of durations:
  - `5 years`
  - `1 month 2 weeks`
  - `(2 * 5 + 3) hours + 10 minutes`
  - `30` 

  By default, raw data is kept 1 year and aggregated data 5 years. 

To access the MongoDB database, you can use MongoDB Compass. 
Note: the RaspberryPi version of MongoDB is supported by old Compass releases only:
- version [1.25.0](https://github.com/mongodb-js/compass/releases/tag/v1.25.0), fully compatible (recommended)
- version [1.28.4](https://github.com/mongodb-js/compass/releases/tag/v1.25.0), missing schema analysis.
- version [1.29.5](https://github.com/mongodb-js/compass/releases/tag/v1.29.5), poor compatibility, e.g. cannot visualize documents.


User Interface
--------------

Domoja comes with a generic user interface based on [Ionic](https://ionicframework.com/). The files are located in the `www` directory, and generated by [domoja-ui](https://github.com/bchabrier/domoja-ui).

HomeKit and Siri integration
----------------------------

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

Development
-----------

To test a new domoja package, create it through `yarn pack` and install it:

```
$ cd domoja
$ yarn pack --filename /tmp/domoja.$RANDOM.tar.gz


$ cd ../domoja-run
yarn add $(ls -t /tmp/domoja.*.tar.gz | head -1)
```


To do
-----

- Ajouter un status general couplé avec Siri: "donne moi le statut de la maison/piscine/tondeuse..."
- support other attribute than 'state' in devices // normalement ca marche (ex tem avec temp piscine). L'utiliser pour le stick etc
- support for dev: reload module when changed
- authentication cookies seem not persisted: when restarting the server, we need to relogin

Issues
------

- on config reload it seems that we get mongodb drain
- sur iOS revenir sur l'app ne fonctionne pas toujours
- lumieres clignotantes a fixer

### Fixed

- en cas de script timeout on n'a plus de logging info ?!?! -> https://github.com/patriksimek/vm2/issues/306


