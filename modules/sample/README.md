[//]: # (badges START)
[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Node.js CI](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml) [![CodeQL](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)

[//]: # (badges END)


[//]: # (moduleName START)
domoja-sample
=============
[//]: # (moduleName END)

This is a skeleton for developing a new [domoja](https://www.npmjs.com/package/domoja) module.

A module extend Domoja functionality, by adding new sources, devices, etc. It is essentially an `npm` module following particular specifications:
- its name must start with `domoja-`
- it must derive from `domoModule`

# Sources
[//]: # (sourceDoc START)
A source derives from the `Source` class and implements the following methods:
- `createInstance`: create an instance of the source, taking into account the requested configuration
- `getParameters`: describes the parameters supported by the source
- `doSetAttribute`: implements a requested change of value of an attribute of a device managed by the source
- `release`: releases a source to free any used resource
- `registerDeviceTypes`: a static method to declare which device types are supported by the source

[//]: # (sourceDoc END)



