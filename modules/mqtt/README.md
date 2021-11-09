[//]: # (badges START)
[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Node.js CI](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml) [![CodeQL](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)


[//]: # (badges END)


[//]: # (moduleName START)
domoja-mqtt
===========
[//]: # (moduleName END)

Connect Domoja to an MQTT server.

# Usage

```
imports:
  - module: mqtt
    source: Mqtt

sources:
  - robonect: {
      type: Mqtt,
      url: mqtt://192.168.0.10,
      user: !secrets mqtt_user,
      password: !secrets mqtt_password
  }

devices:
    - mode : { type: sensor, source: robonect, widget: text, id: "/Robonect/mower/mode", tags: mower, name: "Mode (code)" }

```














