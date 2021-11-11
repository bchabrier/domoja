[//]: # (badges START)
[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Node.js CI](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml) [![CodeQL](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)

[//]: # (badges END)


[//]: # (moduleName START)
domoja-proxiti
==============
[//]: # (moduleName END)

[//]: # (sourceDoc START)
This source provides astronomy information from http://www.proxiti.info/horaires_soleil.php?o=06030

This includes sunset, sunrise, dawn, dusk, zenith times, and day duration, at a specific location.

Parameters:
- location: the code corresponding to your location. Use https://www.proxiti.info/index.php to find it.

Example:
```
sources:
  - astronomy: {
    type: astronomy,
    location: "06030"
  }

devices:
  - sunset: { type: device, widget: text, tags: 'astronomy', source: astronomy, id: sunsetTime, name: "Coucher du soleil" }
```

[//]: # (sourceDoc END)



