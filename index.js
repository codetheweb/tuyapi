'use strict';

// Import packages
const dgram = require('dgram');
const forge = require('node-forge');
const retryConnect = require('net-retry-connect');

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
* @param {string} [options.uid=''] - UID of device
* @param {string} options.key - encryption key of device
* @param {number} [options.version=3.1] - protocol version
*/
function TuyaDevice(options) {
  this.devices = [];
  const needIP = [];

  // If argument is [{id: '', key: ''}]
  if (options.constructor === Array) {
    options.forEach(function (device) {
      if (device.ip === undefined) {
        needIP.push(device.id);
      } else {
        this.devices.push(device);
      }
    });

    this.discoverDevices(needIP).then(devices => {
      this.devices.push(devices);
    });
  }
  // If argument is {id: '', key: ''}
  else if (options.constructor === Object) {
    if (options.ip === undefined) {
      this.discoverDevices(options.id).then(device => {
        this.devices.push(device);
      });
    } else {
      this.devices.push({
        type: options.type || 'outlet',
        ip: options.ip,
        port: options.port || 6668,
        key: options.key,
        cipher: forge.cipher.createCipher('AES-ECB', options.key),
        version: options.version || 3.1
      });
    }
  }
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
  const buffer = this._constructBuffer(thisData, 'status');

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
  const buffer = this._constructBuffer(thisData, [on ? 'on' : 'off']);

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
  return new Promise((resolve, reject) => {
    retryConnect.to({port: 6668, host: this.ip, retryOptions: {retries: 5}}, (error, client) => {
      if (error) {
        reject(error);
      }
      client.write(buffer);

      client.on('data', data => {
        client.destroy();
        resolve(data);
      });
      client.on('error', error => {
        reject(error);
      });
    });
  });
};

/**
* Constructs a protocol-complient buffer given data and command.
* @private
* @param {String} data - data to put in buffer
* @param {String} command - command (status, on, off, etc.)
* @returns {Buffer} buffer - buffer of data
*/
TuyaDevice.prototype._constructBuffer = function (data, command) {
  // Construct prefix of packet according to protocol
  const prefixLength = (data.toString('hex').length + requests[this.type].suffix.length) / 2;
  const prefix = requests[this.type].prefix + requests[this.type][command].hexByte + '000000' + prefixLength.toString(16);

  // Create final buffer: prefix + data + suffix
  return Buffer.from(prefix + data.toString('hex') + requests[this.type].suffix, 'hex');
};

/**
* Gets control schema from device.
* @returns {Promise<Object>} schema - object of parsed JSON
*/
TuyaDevice.prototype.getSchema = function () {
  // Create byte buffer from hex data
  const thisData = Buffer.from(JSON.stringify({
    gwId: this.id,
    devId: this.id
  }));
  const buffer = this._constructBuffer(thisData, 'status');

  return new Promise((resolve, reject) => {
    this._send(buffer).then(data => {
      // Extract returned JSON
      try {
        data = data.toString();
        data = data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1);
        data = JSON.parse(data);
        return resolve(data.dps);
      } catch (err) {
        return reject(err);
      }
    });
  });
};

/**
* Attempts to autodiscover devices (i.e. translate device ID to IP).
* @param {Array} IDs - can be a single ID or an array of IDs
* @returns {Promise<object>} devices - discovered devices
*/
TuyaDevice.prototype.discoverDevices = function (ids, callback) {
  // Create new listener if it hasn't already been created
  if (this.listener == undefined) {
    this.listener = dgram.createSocket('udp4');
    this.listener.bind(6666);
  }

  const discoveredDevices = [];

  // If input is '...' change it to ['...'] for ease of use
  if (typeof (ids) === 'string') {
    ids = [ids];
  }

  return new Promise((resolve, reject) => {
    this.listener.on('message', (message, info) => {
      if (discoveredDevices.length < ids.length) {
        if (ids.includes(this._extractJSON(message).gwId)) {
          discoveredDevices.push(this._extractJSON(message));
        }
      } else { // All IDs have been resolved
        resolve(discoveredDevices);
      }
    });
  });
};

/**
* Extracts JSON from a raw buffer and returns it as an object.
* @param {Buffer} buffer of data
* @returns {Object} extracted object
*/
TuyaDevice.prototype._extractJSON = function (data) {
  data = data.toString();
  data = data.slice(data.indexOf('{'), data.lastIndexOf('"}') + 2);
  data = JSON.parse(data);
  return data;
};

module.exports = TuyaDevice;
