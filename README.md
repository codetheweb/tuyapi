# tuya-device
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
An easy-to-use API for devices that use Tuya's cloud services (currently only supports smart plugs)

**Note**: currently hitting rate limits if we make and break connections too quickly.  Is it posible to reuse the `client` object between requests?


TuyAPI
=========

A library for communicating with devices that use the [Tuya](http://tuya.com) cloud network. These devices are branded under many different names, but if port 6668 is open on your device chances are this library will work with it.
Currently only supports smart plugs, but it should be fairly trivial to add other types of devices.

## Installation

  `npm install @codetheweb/tuyapi`

## Usage

    const TuyaDevice = require('./index.js');

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

## Contributors
