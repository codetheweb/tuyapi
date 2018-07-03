// Import packages
const dgram = require('dgram');
const net = require('net');
const timeout = require('p-timeout');
const retry = require('retry');
const debug = require('debug')('TuyAPI');

// Helpers
const Cipher = require('./lib/cipher');
const Parser = require('./lib/message-parser');

/**
* Represents a Tuya device.
* @class
* @param {Object} options
* @param {String} [options.ip] IP of device
* @param {Number} [options.port=6668] port of device
* @param {String} options.id ID of device
* @param {String} options.key encryption key of device
* @param {Number} [options.version=3.1] protocol version
* @example
* const tuya = new TuyaDevice({id: 'xxxxxxxxxxxxxxxxxxxx', key: 'xxxxxxxxxxxxxxxx'})
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

  this._responseTimeout = 5; // In seconds

  debug('Device: ');
  debug(this.device);
}

/**
* Resolves ID stored in class to IP. If you didn't
* pass an IP to the constructor, you must call
* this before doing anything else.
* @param {Object} [options]
* @param {Number} [options.timeout=10]
* how long, in seconds, to wait for device
* to be resolved before timeout error is thrown
* @example
* tuya.resolveIds().then(() => console.log('ready!'))
* @returns {Promise<Boolean>}
* true if IP was found and device is ready to be used
*/
TuyaDevice.prototype.resolveId = function (options) {
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

    this.listener.on('error', err => reject(err));
  }), options.timeout * 1000, () => {
    // Have to do this so we exit cleanly
    this.listener.close();
    this.listener.removeAllListeners();
    // eslint-disable-next-line max-len
    throw new Error('resolveIds() timed out. Is the device powered on and the ID correct?');
  });
};

/**
* @deprecated since v3.0.0. Will be removed in v4.0.0. Use resolveId() instead.
*/
TuyaDevice.prototype.resolveIds = function (options) {
  // eslint-disable-next-line max-len
  console.warn('resolveIds() is deprecated since v3.0.0. Will be removed in v4.0.0. Use resolveId() instead.');
  return this.resolveId(options);
};

/**
* Gets a device's current status.
* Defaults to returning only the value of the first DPS index.
* @param {Object} [options]
* @param {Boolean} [options.schema]
* true to return entire schema of device
* @param {Number} [options.dps=1]
* DPS index to return
* @example
* // get first, default property from device
* tuya.get().then(status => console.log(status))
* @example
* // get second property from device
* tuya.get({dps: 2}).then(status => console.log(status))
* @example
* // get all available data from device
* tuya.get({schema: true}).then(data => console.log(data))
* @returns {Promise<Object>}
* returns boolean if no options are provided, otherwise returns object of results
*/
TuyaDevice.prototype.get = function (options) {
  // Set empty object as default
  options = options ? options : {};

  const payload = {gwId: this.device.id, devId: this.device.id};

  debug('Payload: ', payload);

  // Create byte buffer
  const buffer = Parser.encode({data: payload, commandByte: '0a'});

  return new Promise((resolve, reject) => {
    this._send(this.device.ip, buffer).then(data => {
      if (options.schema === true) {
        resolve(data);
      } else if (options.dps) {
        resolve(data.dps[options.dps]);
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
* @param {Object} options
* @param {Number} [options.dps=1] DPS index to set
* @param {*} options.set value to set
* @example
* // set default property
* tuya.set({set: true}).then(() => console.log('device was changed'))
* @example
* // set custom property
* tuya.set({dps: 2, set: true}).then(() => console.log('device was changed'))
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
  const md5 = this.device.cipher.md5('data=' + data +
                                     '||lpv=' + this.device.version +
                                     '||' + this.device.key);

  // Create byte buffer from hex data
  const thisData = Buffer.from(this.device.version + md5 + data);
  const buffer = Parser.encode({data: thisData, commandByte: '07'});

  // Send request to change status
  return new Promise((resolve, reject) => {
    this._send(this.device.ip, buffer).then(() => {
      resolve(true);
    }).catch(err => {
      reject(err);
    });
  });
};

/**
* Sends a query to a device. Helper
* function that wraps ._sendUnwrapped()
* in a retry operation.
* @private
* @param {String} ip IP of device
* @param {Buffer} buffer buffer of data
* @returns {Promise<string>} returned data
*/
TuyaDevice.prototype._send = function (ip, buffer) {
  if (typeof ip === 'undefined') {
    throw new TypeError('Device missing IP address.');
  }

  const operation = retry.operation({
    retries: 4,
    factor: 1.5
  });

  return new Promise((resolve, reject) => {
    operation.attempt(currentAttempt => {
      debug('Socket attempt', currentAttempt);

      this._sendUnwrapped(ip, buffer).then(result => {
        resolve(result);
      }).catch(error => {
        if (operation.retry(error)) {
          return;
        }

        reject(operation.mainError());
      });
    });
  });
};

/**
* Sends a query to a device.
* @private
* @param {String} ip IP of device
* @param {Buffer} buffer buffer of data
* @returns {Promise<string>} returned data
*/
TuyaDevice.prototype._sendUnwrapped = function (ip, buffer) {
  debug('Sending this data: ', buffer.toString('hex'));

  const client = new net.Socket();

  return new Promise((resolve, reject) => {
    // Attempt to connect
    client.connect(6668, ip);

    // Default connect timeout is ~1 minute,
    // 10 seconds is a more reasonable default
    // since `retry` is used.
    client.setTimeout(1000, () => {
      client.emit('error', new Error('connection timed out'));
      client.destroy();
    });

    // Send data when connected
    client.on('connect', () => {
      debug('Socket connected.');

      // Remove connect timeout
      client.setTimeout(0);

      // Transmit data
      client.write(buffer);

      this._sendTimeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Timeout waiting for response'));
      }, this._responseTimeout * 1000);
    });

    // Parse response data
    client.on('data', data => {
      debug('Received data back:');
      debug(data.toString('hex'));

      clearTimeout(this._sendTimeout);
      client.destroy();

      data = Parser.parse(data);

      if (typeof data === 'object' || typeof data === 'undefined') {
        resolve(data);
      } else { // Message is encrypted
        resolve(this.device.cipher.decrypt(data));
      }
    });

    // Handle errors
    client.on('error', err => {
      debug('Error event from socket.');

      // eslint-disable-next-line max-len
      err.message = 'Error communicating with device. Make sure nothing else is trying to control it or connected to it.';
      reject(err);
    });
  });
};

module.exports = TuyaDevice;
