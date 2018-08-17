[![Build Status](https://travis-ci.org/bchabrier/domoja.svg?branch=master)](https://travis-ci.org/bchabrier/domoja) [![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Dependency Status](https://david-dm.org/bchabrier/domoja.svg)](https://david-dm.org/bchabrier/domoja) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)

[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

domoja
======

A Typescript framework for home automation

Introduction
------------
This framework allows to create home automation applications.

The server part is written in Typescript, while the GUI uses Angular and Iconic.

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



Modules
-------

Domoja can be extended through modules, to add new sources, devices, etc. They are essentially `npm` modules following particular specifications:
- their name must start with `domoja-`
- they must derive from `domoModule`

### Available modules

The following modules are currently available:

[//]: # (modulesList START)
- [domoja-core](https://www.npmjs.com/package/domoja-core): Core components of Domoja
- [domoja-ipx800](https://www.npmjs.com/package/domoja-ipx800): IPX800 source for Domoja
- [domoja-proxiti](https://www.npmjs.com/package/domoja-proxiti): Astronomy source for Domoja from http://www.proxiti.info/
- [domoja-sample](https://www.npmjs.com/package/domoja-sample): A sample Domoja module skeleton
- [domoja-zibase](https://www.npmjs.com/package/domoja-zibase): ZiBase source for Domoja

[//]: # (modulesList END)
