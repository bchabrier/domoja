[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)


domoja-voice-google
===================

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

