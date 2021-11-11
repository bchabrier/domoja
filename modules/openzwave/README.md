[//]: # (badges START)
[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Node.js CI](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml) [![CodeQL](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)

[//]: # (badges END)


[//]: # (moduleName START)
domoja-openzwave
================
[//]: # (moduleName END)

[//]: # (sourceDoc START)
Domoja source to connect to ZWave devices

Example:
```
sources:
  - ZStick: {
      type: Openzwave,
      debug: false,
      driverLogLevel: "silly",
      port: /dev/ttyACM0
  }
devices:
- zwave:
   - controller : { type: device, widget: "multistate:INCLUSION,INCLUSION_NON_SECURE,EXCLUSION,NO_INCLUSION_EXCLUSION:secondary,secondary,danger,primary:Inclure,Inclure non séc.,Exclure,Stop", tags: 'zwave', source: ZStick, id: "1", attribute: "inclusion_mode", name: "Controleur"} 
   - config : { type: device, widget: "zwave-config", tags: 'zwave', source: ZStick, id: "1", attribute: "zwave_config", name: "ZWave config"} 
   - grand: { type: device, widget: text, tags: 'portails', source: ZStick, id: "16-37-2-currentValue", name: "Petit Portail ouvert en grand", camera: camera_exterieure }
```

[//]: # (sourceDoc END)



