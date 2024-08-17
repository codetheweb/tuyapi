# TuyAPI 🌧 🔌

[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![Build Status](https://travis-ci.com/codetheweb/tuyapi.svg?branch=master)](https://travis-ci.com/codetheweb/tuyapi)
[![Coverage Status](https://coveralls.io/repos/github/codetheweb/tuyapi/badge.svg?branch=master)](https://coveralls.io/github/codetheweb/tuyapi?branch=master)
![Node Version](https://img.shields.io/badge/node-%3E=8-blue.svg)

A library for communicating with devices that use the [Tuya](http://tuya.com) cloud network. These devices are branded under many different names, but if your device works with the TuyaSmart app or port 6668 is open on your device chances are this library will work.

## Installation

  `npm install codetheweb/tuyapi`

## Basic Usage

See the [setup instructions](docs/SETUP.md) for how to find the needed parameters.

These examples should report the current status, set the default property to the opposite of what it currently is, then report the changed status.
They will need to be adapted if your device does not have a boolean property at index 1 (i.e. it doesn't have an on/off property). Index 20 seems to be another somewhat common on/off property.

### Asynchronous (event based, recommended)
```javascript
const TuyAPI = require('tuyapi');

const device = new TuyAPI({
  id: 'xxxxxxxxxxxxxxxxxxxx',
  key: 'xxxxxxxxxxxxxxxx'});

let stateHasChanged = false;

// Find device on network
device.find().then(() => {
  // Connect to device
  device.connect();
});

// Add event listeners
device.on('connected', () => {
  console.log('Connected to device!');
});

device.on('disconnected', () => {
  console.log('Disconnected from device.');
});

device.on('error', error => {
  console.log('Error!', error);
});

device.on('data', data => {
  console.log('Data from device:', data);

  console.log(`Boolean status of default property: ${data.dps['1']}.`);

  // Set default property to opposite
  if (!stateHasChanged) {
    device.set({set: !(data.dps['1'])});

    // Otherwise we'll be stuck in an endless
    // loop of toggling the state.
    stateHasChanged = true;
  }
});

// Disconnect after 10 seconds
setTimeout(() => { device.disconnect(); }, 10000);
```

### Synchronous
```javascript
const TuyAPI = require('tuyapi');

const device = new TuyAPI({
  id: 'xxxxxxxxxxxxxxxxxxxx',
  key: 'xxxxxxxxxxxxxxxx',
  issueGetOnConnect: false});

(async () => {
  await device.find();

  await device.connect();

  let status = await device.get();

  console.log(`Current status: ${status}.`);

  await device.set({set: !status});

  status = await device.get();

  console.log(`New status: ${status}.`);

  device.disconnect();
})();
```

### Data not updating?

Some new devices don't send data updates if the app isn't open.

These devices need to be "forced" to send updates. You can do so by calling `refresh()` (see docs), which will emit a `dp-refresh` event.

```javascript
const TuyAPI = require('tuyapi');

const device = new TuyAPI({
    id: 'xxxxxxxxxxxxxxxxxxxx',
    key: 'xxxxxxxxxxxxxxxx',
    ip: 'xxx.xxx.xxx.xxx',
    version: '3.3',
    issueRefreshOnConnect: true});

// Find device on network
device.find().then(() => {
    // Connect to device
    device.connect();
});

// Add event listeners
device.on('connected', () => {
    console.log('Connected to device!');
});

device.on('disconnected', () => {
    console.log('Disconnected from device.');
});

device.on('error', error => {
    console.log('Error!', error);
});

device.on('dp-refresh', data => {
    console.log('DP_REFRESH data from device: ', data);
});

device.on('data', data => {
    console.log('DATA from device: ', data);

});

// Disconnect after 10 seconds
setTimeout(() => { device.disconnect(); }, 1000);
```


## 📝 Notes
- Only one TCP connection can be in use with a device at once. If using this, do not have the app on your phone open.
- Some devices ship with older firmware that may not work with `tuyapi`.  If you're experiencing issues, please try updating the device's firmware in the official app.
- Newer firmware may use protocol 3.3. If you are not using `find()`, you will need to manually pass `version: 3.3` to the constructor.
- TuyAPI does not support sensors due to the fact that they only connect to the network when their state changes. There are no plans to add support as it's out of scope to intercept network requests.
- The key parameter for devices changes every time a device is removed and re-added to the TuyaSmart app.  If you're getting decrypt errors, try getting the key again - it might have changed.


## 📓 Documentation

See the [docs](https://codetheweb.github.io/tuyapi/index.html).

## Current State & the Future of TuyAPI

The goal of this repository specifically is to provide a bit of a middle ground between implementing everything from scratch and having everything handled for you.

I realize this is a bit wishy-washy and most users would prefer one or the other. I started a new library a while ago to address this and incorporate some of the lessons we've learned over the years: [@tuyapi/driver](https://github.com/TuyaAPI/driver). The intention is that this library would be fairly low-level, and then more user-friendly libraries could be built on top of it to provide common functionality for, say, setting RGB light values (probably named `@tuyapi/devices`).

Unfortunately, not much progress has been made in that regard for a few reasons. First, besides the occasional [coffee](https://www.buymeacoffee.com/maxisom) (thank you 😀) I don't get paid for this. And it's hard to be motivated to work on it when I don't actually use it day-to-day. For lack of a beter explanation, it's just not "fun" anymore. Also: trying to play wack-a-mole with a large corporation is kinda exhausting.

**TL;DR**: all that to say that I personally will not be further developing Tuya-related projects for the foreseeable future besides fixing reproducable bugs. I plan to still respond to support requests and bug reports, but please be patient. 😀

## Contributing

See [CONTRIBUTING](https://github.com/codetheweb/tuyapi/blob/master/CONTRIBUTING.md).

## Contributors

- [codetheweb](https://github.com/codetheweb)
- [blackrozes](https://github.com/blackrozes)
- [clach04](https://github.com/clach04)
- [jepsonrob](https://github.com/jepsonrob)
- [tjfontaine](https://github.com/tjfontaine)
- [NorthernMan54](https://github.com/NorthernMan54)
- [Apollon77](https://github.com/Apollon77)
- [dresende](https://github.com/dresende)
- [kaveet](https://github.com/kaveet)
- [johnyorke](https://github.com/johnyorke)
- [jpillora](https://github.com/jpillora)
- [neojski](https://github.com/neojski)
- [unparagoned](https://github.com/unparagoned)
- [kueblc](https://github.com/kueblc)
- [stevoh6](https://github.com/stevoh6)
- [imbenwolf](https://github.com/imbenwolf)

(If you're not on the above list, open a PR.)

## Related

### Flash alternative firmware
- [tuya-convert](https://github.com/ct-Open-Source/tuya-convert) a project that allows you to flash custom firmware OTA on devices

### Ports
- [TinyTuya](https://github.com/jasonacox/tinytuya) a Python port by [jasonacox](https://github.com/jasonacox) and [uzlonewolf](https://github.com/uzlonewolf)
- [aiotuya](https://github.com/frawau/aiotuya) a Python port by [frawau](https://github.com/frawau)
- [m4rcus.TuyaCore](https://github.com/Marcus-L/m4rcus.TuyaCore) a .NET port by [Marcus-L](https://github.com/Marcus-L)
- [TuyaKit](https://github.com/eppz/.NET.Library.TuyaKit) a .NET port by [eppz](https://github.com/eppz)
- [py60800/tuya](https://github.com/py60800/tuya) a Go port by [py60800](https://github.com/py60800)
- [rust-tuyapi](https://github.com/EmilSodergren/rust-tuyapi) a Rust port by [EmilSodergren](https://github.com/EmilSodergren)
- [GoTuya](https://github.com/Binozo/GoTuya) a Go port by [Binozo](https://github.com/Binozo)

### Clients for Tuya's Cloud
- [cloudtuya](https://github.com/unparagoned/cloudtuya) by [unparagoned](https://github.com/unparagoned/)

### Projects built with TuyAPI
- [tuya-cli](https://github.com/TuyaAPI/cli): a CLI interface for Tuya devices
- [homebridge-tuya](https://github.com/iRayanKhan/homebridge-tuya): a [Homebridge](https://github.com/nfarina/homebridge) plugin for Tuya devices
- [tuyaweb](https://github.com/bmachek/tuyaweb): a web interface for controlling devices by [bmachek](https://github.com/bmachek)
- [homebridge-igenix-air-conditioner](https://github.com/ellneal/homebridge-igenix-air-conditioner): a [Homebridge](https://github.com/nfarina/homebridge) plugin for the Igenix IG9901WIFI air conditioner
- [magichome-led-controller](https://github.com/cajonKA/magichome-led-controller-node): a node to use magichome led RGB controller in [node-red](https://github.com/node-red/node-red)
- [ioBroker.tuya](https://github.com/Apollon77/ioBroker.tuya): an ioBroker (http://iobroker.net/) adapter to get data and control devices incl. schema parsing
- [node-red-contrib-tuya-smart-device](https://github.com/vinodsr/node-red-contrib-tuya-smart-device): A Node-RED node based on TuyAPI to control Tuya devices with tons of options. 
- [node-red-contrib-tuya-smart](https://github.com/hgross/node-red-contrib-tuya-smart): A NodeRED input node utilizing tuyapi to connect the smart home
- [tuyadump](https://github.com/py60800/tuyadump) a Go project to decode device traffic in real time
- [tuya-mqtt](https://github.com/TheAgentK/tuya-mqtt) a simple MQTT interface for TuyAPI
- [smart-home-panel](https://github.com/MadeleineSmith/smart-home-panel-fe) A website for controlling a smart light bulb
- [GoTuya](https://github.com/Binozo/GoTuya) An easy-to-use api to control Tuya devices on the local network
- [luminea2mqtt](https://github.com/dennis9819/luminea2mqtt/tree/master) An expandable luminea2mqtt bridge with HA Autodiscover


To add your project to either of the above lists, please open a pull request.

[![forthebadge](https://forthebadge.com/images/badges/made-with-javascript.svg)](https://forthebadge.com)
[![forthebadge](https://forthebadge.com/images/badges/built-with-love.svg)](https://forthebadge.com)
