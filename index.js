'use strict';

// Import packages
const forge = require('node-forge');
const retryConnect = require('net-retry-connect');

// Import requests for devices
const requests = require('./requests.json');

// Constructor
function TuyaDevice(params) {
  // init properties
  this.type = params.type || 'outlet';
  this.ip = params.ip;
  this.id = params.id;
  this.key = params.localKey;
  this.version = params.version || 3.1;

  // create cipher object
  this.cipher = forge.cipher.createCipher('AES-ECB', this.localKey);
}

TuyaDevice.prototype.status = function(callback) {
  var buffer = Buffer.from(prefixes['status'] + textToHex(JSON.stringify(this.requests['status'])) + suffixes['status'], 'hex');

  retryConnect.to({port: 6668, host: this.ip}, function (error, client) {
    if (error) { callback(error); }

    client.write(buffer);
    client.on('data', function(data) {
      client.destroy();
      data = data.toString();
      data = data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1);
      data = JSON.parse(data);
      var status = data['dps']['1'];

      console.log('Device is ' + status);
      callback(null, status);
    });
  });
}

module.exports = TuyaDevice;
