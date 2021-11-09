[//]: # (badges START)
[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Node.js CI](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml) [![CodeQL](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)


[//]: # (badges END)

[//]: # (moduleName START)
domoja-voice-google
===================
[//]: # (moduleName END)

Connect a Freebox to Domoja.

# Usage

```
imports:
  - module: voice-google
    source: VoiceByGoogle

sources:
  - voice: {
      type: VoiceByGoogle,
      language: en,
      volume: 100
  }


devices:
  - say : { type: device, widget: text, source: voice, id: unused, name: "Message parlé"} 

scenarios:
  - greetings:
      - init:
        triggers:
          - at: startup
        actions:
          - {device: say, state: "Hi, starting Domoja" }

```









