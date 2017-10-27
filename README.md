TuyAPI [![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
=========

A library for communicating with devices that use the [Tuya](http://tuya.com) cloud network. These devices are branded under many different names, but if port 6668 is open on your device chances are this library will work with it.
Currently only supports smart plugs, but it should be fairly trivial to add other types of devices.

## Installation

  `npm install @codetheweb/tuyapi`

## Usage

    const TuyaDevice = require('tuyapi');

    var tuya = new TuyaDevice({
      type: 'outlet',
      ip: 'xxx.yyy.0.zzz',
      id: 'xxxxxxxxxxxxxxxxxxxx',
      uid: 'xxxxxxxxxxxxxxxxxxxx',
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

  The `id`, `uid`, and `key` must be found by sniffing the app that came with your device. 

## Tests

  `npm test`
  (runs the [xo](https://www.npmjs.com/package/xo) style linter)
  
## TODO
 1. Either reuse a TCP connection between requests, keeping it alive by sending a packet every few seconds, or add a delay between subsequent commands.
 2. Figure out what the hex-encoded 'padding' is.
 3. Autodiscovery of devices?

## Contributors
- [codetheweb](https://github.com/codetheweb)
- [blackrozes](https://github.com/blackrozes)
