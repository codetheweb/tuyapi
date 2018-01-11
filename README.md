# TuyAPI 🌧 🔌 [![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

A library for communicating with devices that use the [Tuya](http://tuya.com) cloud network. These devices are branded under many different names, but if port 6668 is open on your device chances are this library will work with it.
Currently only supports smart plugs, but it should be fairly trivial to add other types of devices.

## Installation

  `npm install codetheweb/tuyapi`

## Basic Usage

    const TuyaDevice = require('tuyapi');

    var tuya = new TuyaDevice({
      type: 'outlet',
      ip: 'xxx.yyy.0.zzz',
      id: 'xxxxxxxxxxxxxxxxxxxx',
      key: 'xxxxxxxxxxxxxxxx'});

    tuya.getStatus(function(error, status) {
      if (error) { return console.log(error); }
      console.log('Status: ' + status);

      tuya.setStatus(!status, function(error, result) {
        if (error) { return console.log(error); }
        console.log('Result of setting status to ' + !status + ': ' + result);

        tuya.getStatus(function(error, status) {
          if (error) { return console.log(error); }
          console.log('New status: ' + status);
        });
      });
    });

This should report the current status, set the device to the opposite of what it currently is, then report the changed status.

See the [setup instructions](docs/SETUP.md) for how to find the needed parameters.

## Docs

See the [docs](docs/API.md).
**IMPORTANT**: Only one TCP connection can be in use with a device at once. If testing this, do not have the app on your phone open.

## TODO

1.  ~~Reuse a TCP connection between subsequent commands, instead of creating a new one every time.~~
2.  ~~Figure out what the hex-encoded 'padding' is.~~
3.  Better documentation.
4.  Support arbitrary control schemes for devices as self-reported.
5.  Use Promises for all functions?
6.  Autodiscovery of devices?
7.  Make the JSON parser more reliable.

## Contributors

-   [codetheweb](https://github.com/codetheweb)
-   [blackrozes](https://github.com/blackrozes)
-   [clach04](https://github.com/clach04)
-   [jepsonrob](https://github.com/jepsonrob)

## Related

-   [homebridge-tuya](https://github.com/codetheweb/homebridge-tuya-outlet): a [Homebridge](https://github.com/nfarina/homebridge) plugin for Tuya devices
