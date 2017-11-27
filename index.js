'use strict';

// Import packages
const forge = require('node-forge');
const recon = require('@codetheweb/recon');
const waitUntil = require('wait-until');

// Import requests for devices
const requests = require('./requests.json');

/**
* Represents a Tuya device.
* @constructor
* @param {Object} options - options for constructing a TuyaDevice
* @param {string} [options.type='outlet'] - type of device
* @param {string} options.ip - IP of device
* @param {number} [options.port=6668] - port of device
* @param {string} options.id - ID of device
* @param {string} options.uid - UID of device
* @param {string} options.key - encryption key of device
* @param {number} [options.version=3.1] - protocol version
*/
function TuyaDevice(options) {
  // Init properties
  this.type = options.type || 'outlet';
  this.ip = options.ip;
  this.port = options.port || 6668;
  this.id = options.id;
  this.uid = options.uid;
  this.key = options.key;
  this.version = options.version || 3.1;

  // Create cipher object
  this.cipher = forge.cipher.createCipher('AES-ECB', this.key);

  // Create connection
  // this.client = new connect({host: this.ip, port: this.port});
  this.client = recon(this.ip, this.port, {retryErrors: ['ECONNREFUSED', 'ECONNRESET']});
}

/**
* Gets the device's current status.
* @param {function(error, result)} callback
*/
TuyaDevice.prototype.getStatus = function (callback) {
  // Add data to command
  if ('gwId' in requests[this.type].status.command) {
    requests[this.type].status.command.gwId = this.id;
  }
  if ('devId' in requests[this.type].status.command) {
    requests[this.type].status.command.devId = this.id;
  }

  // Create byte buffer from hex data
  const thisData = Buffer.from(JSON.stringify(requests[this.type].status.command));
  const buffer = Buffer.from(requests[this.type].status.prefix + thisData.toString('hex') + requests[this.type].status.suffix, 'hex');

  this._send(buffer).then(data => {
    // Extract returned JSON
    try {
      data = data.toString();
      data = data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1);
      data = JSON.parse(data);
      return callback(null, data.dps['1']);
    } catch (err) {
      return callback(err, null);
    }
  });
};

/**
* Sets the device's status.
* @param {boolean} on - `true` for on, `false` for off
* @param {function(error, result)} callback - returns `true` if the command succeeded
*/
TuyaDevice.prototype.setStatus = function (on, callback) {
  const thisRequest = requests[this.type][on ? 'on' : 'off'];

  // Add data to command
  const now = new Date();
  if ('gwId' in thisRequest.command) {
    thisRequest.command.gwId = this.id;
  }
  if ('devId' in thisRequest.command) {
    thisRequest.command.devId = this.id;
  }
  if ('uid' in thisRequest.command) {
    thisRequest.command.uid = this.uid;
  }
  if ('t' in thisRequest.command) {
    thisRequest.command.t = (parseInt(now.getTime() / 1000, 10)).toString();
  }

  // Encrypt data
  this.cipher.start({iv: ''});
  this.cipher.update(forge.util.createBuffer(JSON.stringify(thisRequest.command), 'utf8'));
  this.cipher.finish();

  // Encode binary data to Base64
  const data = forge.util.encode64(this.cipher.output.data);

  // Create MD5 signature
  const preMd5String = 'data=' + data + '||lpv=' + this.version + '||' + this.key;
  const md5hash = forge.md.md5.create().update(preMd5String).digest().toHex();
  const md5 = md5hash.toString().toLowerCase().substr(8, 16);

  // Create byte buffer from hex data
  const thisData = Buffer.from(this.version + md5 + data);
  const buffer = Buffer.from(thisRequest.prefix + thisData.toString('hex') + thisRequest.suffix, 'hex');

  // Send request to change status
  this._send(buffer).then(data => {
    return callback(null, true);
  }).catch(err => {
    return callback(err, null);
  });
};

/**
* Sends a query to the device.
* @private
* @param {Buffer} buffer - buffer of data
* @returns {Promise<string>} - returned data
*/
TuyaDevice.prototype._send = function (buffer) {
  const me = this;
  return new Promise((resolve, reject) => {
    // Wait for device to become available
    waitUntil(500, 40, () => {
      return me.client.writable;
    }, result => {
      if (result === false) {
        return reject(new Error('timeout'));
      }
      me.client.write(buffer);
      me.client.on('data', data => {
        return resolve(data);
      });
    });
  });
};

TuyaDevice.prototype._destroy = function () {
  this.client.end();
  this.client.destroy();
  return true;
};

module.exports = TuyaDevice;
