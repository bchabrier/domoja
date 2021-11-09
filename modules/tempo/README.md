[//]: # (badges START)
[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)

[![NPM version](http://img.shields.io/npm/v/domoja.svg)](https://www.npmjs.org/package/domoja) [![Node.js CI](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/node.js.yml) [![CodeQL](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/bchabrier/domoja/actions/workflows/codeql-analysis.yml) [![Coverage Status](https://coveralls.io/repos/github/bchabrier/domoja/badge.svg?branch=master)](https://coveralls.io/github/bchabrier/domoja?branch=master)


[//]: # (badges END)


[//]: # (moduleName START)
domoja-tempo
============
[//]: # (moduleName END)

[//]: # (sourceDoc START)
Cette source récupère les informations de couleur de période auprès de l'EDF, pour le jour courant et le lendemain.

Exemple:
```
sources:
  - tempo: { type: tempo }
 
devices:
  - tempo:
  - couleur_du_jour : { type: device, widget: tempo-color, tags: 'tempo', source: tempo, id: couleurDuJour, name: "Couleur du jour" }
  - couleur_de_demain : { type: device, widget: tempo-color, tags: 'tempo', source: tempo, id: couleurDeDemain, name: "Couleur de demain" }
```

[//]: # (sourceDoc END)



