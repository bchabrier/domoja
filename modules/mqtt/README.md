[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)


domoja-mqtt
===========

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

