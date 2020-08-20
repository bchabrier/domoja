[![NPM](https://nodei.co/npm/domoja.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/domoja/)


domoja-freebox
==============

Connect a Freebox to Domoja.

# Usage

```
imports:
  - module: freebox
    source: Freebox

sources:
  - freebox: {
    type: Freebox,
    URL: "http://mafreebox.freebox.fr",
    app_token: "app_token"
  }

devices:
    - last-call: { type: sensor, widget: text, tags: 'calls', source: freebox, id: '/call/log/', transform: !!js/function 'function (value) { 
      if (!value) return value; 
      let tab = JSON.parse(value);
      if (tab.length>0)
        return tab[0].number==""?"Inconnu":tab[0].number;
      else
        return "";
    }', name: "Last call" }

```

# Application registration

It is mandatory to register Domoja as a Freebox application. For this, run the following command on the same network as the Freebox, and accept the request on the LCD of the Freebox:
```
$ curl http://mafreebox.freebox.fr/api/v1/login/authorize -d '{"app_id":"domoja","app_name":"Freebox Module","app_version":"0.0.1","device_name":"Domoja"}'
```
Keep track of the `app_token` and of the `track_id`.

To finalize the approval, you must acknowledge through by visiting the following URL (use the provided `track_id`):
```
http://mafreebox.freebox.fr/api/v8/login/authorize/{track_id}
```

You can then insert `app_token` in your configuration file.

The list of available api can be found here: [http://mafreebox.freebox.fr/doc/index.html](http://mafreebox.freebox.fr/doc/index.html)