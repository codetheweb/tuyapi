'use strict';

// Import packages
const debug = require('debug')('TuyAPI');
const dgram = require('dgram');
const forge = require('node-forge');
const retryConnect = require('net-retry-connect');
const stringOccurrence = require('string-occurrence');

// Import requests for devices
const requests = require('./requests.json');

/**
* Represents a Tuya device.
* @class
* @param {Object} options - options for constructing a TuyaDevice
* @param {String} [options.type='outlet'] - type of device
* @param {String} [options.ip] - IP of device
* @param {Number} [options.port=6668] - port of device
* @param {String} options.id - ID of device
* @param {String} [options.uid=''] - UID of device
* @param {String} options.key - encryption key of device
* @param {Number} [options.version=3.1] - protocol version
* @example
* const tuya = new TuyaDevice({id: 'xxxxxxxxxxxxxxxxxxxx', key: 'xxxxxxxxxxxxxxxx'})
* @example
* const tuya = new TuyaDevice([
* {id: 'xxxxxxxxxxxxxxxxxxxx', key: 'xxxxxxxxxxxxxxxx'},
* {id: 'xxxxxxxxxxxxxxxxxxxx', key: 'xxxxxxxxxxxxxxxx'}])
*/
function TuyaDevice(options) {
  this.devices = [];

  if (options.constructor === Array) { // If argument is [{id: '', key: ''}]
    this.devices = options;
  } else if (options.constructor === Object) { // If argument is {id: '', key: ''}
    this.devices = [options];
  }

  // Standardize devices array
  for (let i = 0; i < this.devices.length; i++) {
    if (this.devices[i].id === undefined) {
      throw new Error('ID is missing from device.');
    }
    if (this.devices[i].key === undefined) {
      throw new Error('Encryption key is missing from device with ID ' + this.devices[i].id + '.');
    }
    if (this.devices[i].type === undefined) {
      this.devices[i].type = 'outlet';
    }
    if (this.devices[i].uid === undefined) {
      this.devices[i].uid = '';
    }
    if (this.devices[i].port === undefined) {
      this.devices[i].port = 6668;
    }
    if (this.devices[i].version === undefined) {
      this.devices[i].version = 3.1;
    }

    // Create cipher from key
    this.devices[i].cipher = forge.cipher.createCipher('AES-ECB', this.devices[i].key);
  }

  debug('Device(s): ');
  debug(this.devices);
}

/**
* Resolves IDs stored in class to IPs. If you didn't pass IPs to the constructor,
* you must call this before doing anything else.
* @returns {Promise<Boolean>} - true if IPs were found and devices are ready to be used
*/
TuyaDevice.prototype.resolveIds = function () {
  // Create new listener
  this.listener = dgram.createSocket('udp4');
  this.listener.bind(6666);

  // Find devices that need an IP
  const needIP = [];
  for (let i = 0; i < this.devices.length; i++) {
    if (this.devices[i].ip === undefined) {
      needIP.push(this.devices[i].id);
    }
  }

  // Todo: add timeout for when IP cannot be found, then reject(with error)
  // add IPs to devices in array and return true
  return new Promise(resolve => {
    this.listener.on('message', message => {
      debug('Received UDP message.');

      const thisId = this._extractJSON(message).gwId;

      if (needIP.length > 0) {
        if (needIP.includes(thisId)) {
          const deviceIndex = this.devices.findIndex(device => {
            if (device.id === thisId) {
              return true;
            }
            return false;
          });

          this.devices[deviceIndex].ip = this._extractJSON(message).ip;

          needIP.splice(needIP.indexOf(thisId), 1);
        }
      } else { // All devices have been resolved
        this.listener.close();
        this.listener.removeAllListeners();
        resolve(true);
      }
    });
  });
};

/**
* Gets a device's current status. Defaults to returning only the value of the first result,
* but by setting {schema: true} you can get everything.
* @param {Object} [options] - optional options for getting data
* @param {String} [options.id] - ID of device
* @param {Boolean} [options.schema] - true to return entire schema, not just the first result
* @example
* // get status for device with one property
* tuya.get().then(status => console.log(status))
* @example
* // get status for specific device with one property
* tuya.get({id: 'xxxxxxxxxxxxxxxxxxxx'}).then(status => console.log(status))
* @example
* // get all available data from device
* tuya.get({schema: true}).then(data => console.log(data))
* @returns {Promise<Object>} - returns boolean if no options are provided, otherwise returns object of results
*/
TuyaDevice.prototype.get = function (options) {
  let currentDevice;

  // If no ID is provided
  if (options === undefined || options.id === undefined) {
    currentDevice = this.devices[0]; // Use first device in array
  } else { // Otherwise
    // find the device by id in this.devices
    const index = this.devices.findIndex(device => {
      if (device.id === options.id) {
        return true;
      }
      return false;
    });
    currentDevice = this.devices[index];
  }

  // Add data to command
  if ('gwId' in requests[currentDevice.type].status.command) {
    requests[currentDevice.type].status.command.gwId = currentDevice.id;
  }
  if ('devId' in requests[currentDevice.type].status.command) {
    requests[currentDevice.type].status.command.devId = currentDevice.id;
  }

  debug('Payload: ');
  debug(requests[currentDevice.type].status.command);

  // Create byte buffer from hex data
  const thisData = Buffer.from(JSON.stringify(requests[currentDevice.type].status.command));
  const buffer = this._constructBuffer(currentDevice.type, thisData, 'status');

  return new Promise((resolve, reject) => {
    this._send(currentDevice.ip, buffer).then(data => {
      // Extract returned JSON
      data = this._extractJSON(data);

      if (options !== undefined && options.schema === true) {
        resolve(data);
      } else {
        resolve(data.dps['1']);
      }
    }).catch(err => {
      reject(err);
    });
  });
};

/**
* Sets a property on a device.
* @param {Object} options - options for setting properties
* @param {String} [options.id] - ID of device
* @param {Boolean} options.set - `true` for on, `false` for off
* @param {Number} [options.dps] - dps index to change
* @example
* // set default property on default device
* tuya.set({set: true}).then(() => console.log('device was changed'))
* @example
* // set custom property on non-default device
* tuya.set({id: 'xxxxxxxxxxxxxxxxxxxx', 'dps': 2, set: true}).then(() => console.log('device was changed'))
* @returns {Promise<Boolean>} - returns `true` if the command succeeded
*/
TuyaDevice.prototype.set = function (options) {
  let currentDevice;

  // If no ID is provided
  if (options === undefined || options.id === undefined) {
    currentDevice = this.devices[0]; // Use first device in array
  } else { // Otherwise
    // find the device by id in this.devices
    const index = this.devices.findIndex(device => {
      if (device.id === options.id) {
        return true;
      }
      return false;
    });
    currentDevice = this.devices[index];
  }

  const thisRequest = requests[currentDevice.type].set.command;

  // Add data to command
  const now = new Date();
  if ('gwId' in thisRequest) {
    thisRequest.gwId = currentDevice.id;
  }
  if ('devId' in thisRequest) {
    thisRequest.devId = currentDevice.id;
  }
  if ('uid' in thisRequest) {
    thisRequest.uid = currentDevice.uid;
  }
  if ('t' in thisRequest) {
    thisRequest.t = (parseInt(now.getTime() / 1000, 10)).toString();
  }

  if (options.dps === undefined) {
    thisRequest.dps = {1: options.set};
  } else {
    thisRequest.dps[options.dps.toString()] = options.set;
  }

  debug('Payload: ');
  debug(thisRequest);

  // Encrypt data
  currentDevice.cipher.start({iv: ''});
  currentDevice.cipher.update(forge.util.createBuffer(JSON.stringify(thisRequest), 'utf8'));
  currentDevice.cipher.finish();

  // Encode binary data to Base64
  const data = forge.util.encode64(currentDevice.cipher.output.data);

  // Create MD5 signature
  const preMd5String = 'data=' + data + '||lpv=' + currentDevice.version + '||' + currentDevice.key;
  const md5hash = forge.md.md5.create().update(preMd5String).digest().toHex();
  const md5 = md5hash.toString().toLowerCase().substr(8, 16);

  // Create byte buffer from hex data
  const thisData = Buffer.from(currentDevice.version + md5 + data);
  const buffer = this._constructBuffer(currentDevice.type, thisData, 'set');

  // Send request to change status
  return new Promise((resolve, reject) => {
    this._send(currentDevice.ip, buffer).then(() => {
      resolve(true);
    }).catch(err => {
      reject(err);
    });
  });
};

/**
* Sends a query to a device.
* @private
* @param {String} ip - IP of device
* @param {Buffer} buffer - buffer of data
* @returns {Promise<string>} - returned data
*/
TuyaDevice.prototype._send = function (ip, buffer) {
  debug('Sending this data: ', buffer.toString('hex'));

  return new Promise((resolve, reject) => {
    retryConnect.to({port: 6668, host: ip, retryOptions: {retries: 5}}, (error, client) => {
      if (error) {
        reject(error);
      }

      client.write(buffer);

      client.on('data', data => {
        client.destroy();

        debug('Received data back.');

        resolve(data);
      });
      client.on('error', error => {
        error.message = 'Error communicating with device. Make sure nothing else is trying to control it or connected to it.';
        reject(error);
      });
    });
  });
};

/**
* Constructs a protocol-complient buffer given device type, data, and command.
* @private
* @param {String} type - type of device
* @param {String} data - data to put in buffer
* @param {String} command - command (status || set)
* @returns {Buffer} buffer - buffer of data
*/
TuyaDevice.prototype._constructBuffer = function (type, data, command) {
  // Construct prefix of packet according to protocol
  const prefixLength = (data.toString('hex').length + requests[type].suffix.length) / 2;
  const prefix = requests[type].prefix + requests[type][command].hexByte + '000000' + prefixLength.toString(16);

  // Create final buffer: prefix + data + suffix
  return Buffer.from(prefix + data.toString('hex') + requests[type].suffix, 'hex');
};

/**
* Extracts JSON from a raw buffer and returns it as an object.
* @private
* @param {Buffer} data - buffer of data
* @returns {Object} extracted object
*/
TuyaDevice.prototype._extractJSON = function (data) {
  debug('Parsing this data to JSON: ', data.toString('hex'));

  data = data.toString();

  // Find the # of occurrences of '{' and make that # match with the # of occurrences of '}'
  const leftBrackets = stringOccurrence(data, '{');
  let occurrences = 0;
  let currentIndex = 0;

  while (occurrences < leftBrackets) {
    const index = data.indexOf('}', currentIndex + 1);
    if (index !== -1) {
      currentIndex = index;
      occurrences++;
    }
  }

  data = data.slice(data.indexOf('{'), currentIndex + 1);
  data = JSON.parse(data);
  return data;
};

module.exports = TuyaDevice;
