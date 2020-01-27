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
- [domoja-ipx800](https://www.npmjs.com/package/domoja-ipx800): IPX800 source for Domoja
- [domoja-proxiti](https://www.npmjs.com/package/domoja-proxiti): Astronomy source for Domoja from http://www.proxiti.info/
- [domoja-sample](https://www.npmjs.com/package/domoja-sample): A sample Domoja module skeleton
- [domoja-tempo](https://www.npmjs.com/package/domoja-tempo): EDF Tempo information for Domoja from https://particulier.edf.fr/fr/accueil/contrat-et-conso/options/ejp.html
- [domoja-zibase](https://www.npmjs.com/package/domoja-zibase): ZiBase source for Domoja

[//]: # (modulesList END)

## API

Domoja provides a REST/JSON api, which is available through Swagger at [/api-docs(http://localhost/api-docs)].

[//]: # (apiList START)
- GET /devices: Retrieves the list of devices
- GET /devices/{id}: Retrieves a device
- POST /devices/{id}: Sends a command to a device
- GET /pages: Retrieves the list of pages
- GET /app: Retrieve the app data
- POST /app/demo-mode: Set the app demo mode

[//]: # (apiList END)

## User Interface

Domoja comes with a generic user interface that can be configured through the configuration file. However, custom pages or components can be added easily

### Add a new page

```
# generate the page with Ionic
$ ionic generate page dmj-<pagename>
```

The file `<pagename>.module.ts` can be safely deleted.

Then, add the page in `src/pages/providers/page-components/page-components.ts`. You can then customize and use the page.

### Add a new dashboard component

```
# generate the component with Ionic
$ ionic generate component DmjDashboard<ComponentName>
```

In the file `src/components/dmj-dashboard-<component-name>.ts`, make the class `DmjComponentName` derive from `DmjDashboardComponent`, after importing with:
```typescript
import { Component } from '@angular/core';
import { DmjDashboardComponent } from '../dmj-dashboard-component';


@Component({
  selector: 'dmj-dashboard-<component-name>',
  templateUrl: 'dmj-dashboard-<component-name>.html'
})
export class DmjDashboard<ComponentName> extends DmjDashboardComponent {

  constructor() {
    super();
  }

}

```
