[//]: # (badges START)
[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Node.js CI](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml) [![CodeQL](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)

[//]: # (badges END)


[//]: # (moduleName START)
domoja-ipx800
=============
[//]: # (moduleName END)

[//]: # (sourceDoc START)
This source connects to IPX800 devices from GCE Electronics.

Example:
```
sources:
- myIPX800: {
    type: IPX800,
    ip: 192.168.0.17,
    macaddress: 00:04:A3:2D:68:E6,
    update_url: /ipx800/update,
    timeout: 60
}
```

[//]: # (sourceDoc END)



