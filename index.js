'use strict';

// Import packages
const dgram = require('dgram');
const net = require('net');
const timeout = require('p-timeout');
const retry = require('retry');
const debug = require('debug')('TuyAPI');

// Helpers
const Cipher = require('./lib/cipher');
const Parser = require('./lib/message-parser');

// TODO:
/*
* Check arguments for all functions, throw error if invalid
* Check open issues on Github
* Run style linter / tests
* Parallel resolveIds()?
* Use develop branch
* Update docs on setup
* Update docs for DPS
* Add comments in code
*/

/**
* Represents a Tuya device.
* @class
* @param {Object} options - options for constructing a TuyaDevice
* @param {String} [options.ip] - IP of device
* @param {Number} [options.port=6668] - port of device
* @param {String} options.id - ID of device
* @param {String} options.key - encryption key of device
* @param {Number} [options.version=3.1] - protocol version
* @example
* const tuya = new TuyaDevice({id: 'xxxxxxxxxxxxxxxxxxxx', key: 'xxxxxxxxxxxxxxxx'})
* @example
* const tuya = new TuyaDevice({
* id: 'xxxxxxxxxxxxxxxxxxxx',
* key: 'xxxxxxxxxxxxxxxx',
* ip: 'xxx.xxx.xxx.xxx')
*/
function TuyaDevice(options) {
  this.device = options;

  // Defaults
  if (this.device.id === undefined) {
    throw new Error('ID is missing from device.');
  }
  if (this.device.key === undefined) {
    throw new Error('Encryption key is missing from device.');
  }
  if (this.device.port === undefined) {
    this.device.port = 6668;
  }
  if (this.device.version === undefined) {
    this.device.version = 3.1;
  }

  // Create cipher from key
  this.device.cipher = new Cipher({key: this.device.key, version: this.device.version});

  this._connectTotalTimeout = undefined;
  this._connectRetryAttempts = undefined;

  this._responseTimeout = 10 * 1000;

  debug('Device: ');
  debug(this.device);
}

/**
* Resolves IDs stored in class to IPs. If you didn't pass IPs to the constructor,
* you must call this before doing anything else.
* @param {Object} [options] - options
* @param {Number} [options.timeout=10] - how long, in seconds, to wait for device
* to be resolved before timeout error is thrown
* @returns {Promise<Boolean>} - true if IPs were found and devices are ready to be used
*/
TuyaDevice.prototype.resolveIds = function (options) {
  // Set default options
  options = options ? options : {};

  if (options.timeout === undefined) {
    options.timeout = 10;
  }

  if (this.device.ip !== undefined) {
    debug('No IPs to search for');
    return Promise.resolve(true);
  }

  // Create new listener
  this.listener = dgram.createSocket('udp4');
  this.listener.bind(6666);

  debug('Finding IP for device ' + this.device.id);

  // Find IP for device
  return timeout(new Promise((resolve, reject) => { // Timeout
    this.listener.on('message', message => {
      debug('Received UDP message.');

      const data = Parser.parse(message);

      debug('UDP data:');
      debug(data);

      const thisId = data.gwId;

      if (this.device.id === thisId) {
        // Add IP
        this.device.ip = data.ip;
        // Change protocol version if necessary
        this.device.version = data.version;
        
        // Cleanup
        this.listener.close();
        this.listener.removeAllListeners();
        resolve(true);
      }
    });
  }), options.timeout * 1000, () => {
    // Have to do this so we exit cleanly
    this.listener.close();
    this.listener.removeAllListeners();
    throw new Error('resolveIds() timed out. Is the device ID correct and is the device powered on?');
  });
};

/**
* Gets a device's current status. Defaults to returning only the value of the first result,
* but by setting {schema: true} you can get everything.
* @param {Object} [options] - options for getting data
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
  const payload = {gwId: this.device.id, devId: this.device.id};

  debug('Payload: ', payload);

  // Create byte buffer
  const buffer = Parser.encode({data: payload, commandByte: '0a'});

  return new Promise((resolve, reject) => {
    this._send(this.device.ip, buffer, this._responseTimeout).then(data => {
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
* @param {Boolean} options.set - `true` for on, `false` for off
* @param {Number} [options.dps] - dps index to change
* @example
* // set default property
* tuya.set({set: true}).then(() => console.log('device was changed'))
* @example
* // set custom property
* tuya.set({'dps': 2, set: true}).then(() => console.log('device was changed'))
* @returns {Promise<Boolean>} - returns `true` if the command succeeded
*/
TuyaDevice.prototype.set = function (options) {
  let dps = {};

  if (options.dps === undefined) {
    dps = {1: options.set};
  } else {
    dps = {[options.dps.toString()]: options.set};
  }

  const now = new Date();
  const timeStamp = (parseInt(now.getTime() / 1000, 10)).toString();

  const payload = {
    devId: this.device.id,
    uid: '',
    t: timeStamp,
    dps
  };

  debug('Payload:');
  debug(payload);

  // Encrypt data
  const data = this.device.cipher.encrypt({data: JSON.stringify(payload)});

  // Create MD5 signature
  const md5 = this.device.cipher.md5('data=' + data + '||lpv=' + this.device.version + '||' + this.device.key);

  // Create byte buffer from hex data
  const thisData = Buffer.from(this.device.version + md5 + data);
  const buffer = Parser.encode({data: thisData, commandByte: '07'});

  // Send request to change status
  return new Promise((resolve, reject) => {
    this._send(this.device.ip, buffer, this._responseTimeout).then(() => {
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
* @param {Number} responseTimeout - time to wait for a response in millis
* @returns {Promise<string>} - returned data
*/
TuyaDevice.prototype._send = function (ip, buffer, responseTimeout) {
  debug('Sending this data: ', buffer.toString('hex'));

  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    const connectOperation = retry.operation({
      retries: this._connectRetryAttempts,
      maxRetryTime: this._connectTotalTimeout
    });

    client.on('error', error => {
      if (!connectOperation.retry(error)) {
        reject(error);
      }
    });

    connectOperation.attempt(connectAttempts => {
      client.connect(6668, ip, () => {
        client.write(buffer);

        let timeout = setTimeout(() => {
          error(new Error('Timeout waiting for response'));
          timeout = null;
        }, responseTimeout);

        function error(e) {
          debug('failed to communicate', e);
          e.message = 'Error communicating with device. Make sure nothing else is trying to control it or connected to it.';
          reject(e);
          done();
        }

        function done() {
          clearTimeout(timeout);
          client.destroy();
        }

        client.on('data', data => {
          debug('Received data back:');
          debug(data.toString('hex'));

          done();

          data = Parser.parse(data);

          if (typeof data === 'object' || typeof data === 'undefined') {
            resolve(data);
          }
          else { // message is encrypted
            resolve(this.device.cipher.decrypt(data));
          }
        });

        client.on('error', err => {
          error(err);
        });
      });
    });
  });
};

module.exports = TuyaDevice;
