// Import packages
const dgram = require('dgram');
const net = require('net');
const {EventEmitter} = require('events');
const pTimeout = require('p-timeout');
const pRetry = require('p-retry');
const debug = require('debug')('TuyAPI');

// Helpers
const Cipher = require('./lib/cipher');
const Parser = require('./lib/message-parser');

/**
 * Represents a Tuya device.
 *
 * You *must* pass either an IP or an ID. If
 * you're experiencing problems when only passing
 * one, try passing both if possible.
 * @class
 * @param {Object} options
 * @param {String} [options.ip] IP of device
 * @param {Number} [options.port=6668] port of device
 * @param {String} [options.id] ID of device (also called `devId`)
 * @param {String} [options.gwID=''] gateway ID (not needed for most devices),
 * if omitted assumed to be the same as `options.id`
 * @param {String} options.key encryption key of device (also called `localKey`)
 * @param {String} [options.productKey] product key of device (currently unused)
 * @param {Number} [options.version=3.1] protocol version
 * @example
 * const tuya = new TuyaDevice({id: 'xxxxxxxxxxxxxxxxxxxx',
 *                              key: 'xxxxxxxxxxxxxxxx'})
 */
class TuyaDevice extends EventEmitter {
  constructor({ip, port = 6668, id, gwID = id, key, productKey, version = 3.1} = {}) {
    super();

    // Set device to user-passed options
    this.device = {ip, port, id, gwID, key, productKey, version};

    // Check arguments
    if (!(this.checkIfValidString(id) ||
          this.checkIfValidString(ip))) {
      throw new TypeError('ID and IP are missing from device.');
    }

    if (!this.checkIfValidString(key) || key.length !== 16) {
      throw new TypeError('Key is missing or incorrect.');
    }

    // Create cipher from key
    this.device.cipher = new Cipher({key, version});

    // Contains array of found devices when calling .find()
    this.foundDevices = [];

    // Private instance variables

    // Socket connected state
    this._connected = false;

    this._responseTimeout = 5; // Seconds
    this._connectTimeout = 5; // Seconds
    this._pingPongPeriod = 10; // Seconds
  }

  /**
   * Gets a device's current status.
   * Defaults to returning only the value of the first DPS index.
   * @param {Object} [options]
   * @param {Boolean} [options.schema]
   * true to return entire list of properties from device
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
   * @returns {Promise<Boolean|Object>}
   * returns boolean if single property is requested, otherwise returns object of results
   */
  get(options = {}) {
    const payload = {
      gwId: this.device.gwID,
      devId: this.device.id
    };

    debug('GET Payload:');
    debug(payload);

    // Create byte buffer
    const buffer = Parser.encode({
      data: payload,
      commandByte: 10 // 0x0a
    });

    // Send request and parse response
    return new Promise((resolve, reject) => {
      try {
        // Send request
        this._send(buffer).then(() => {
          // Runs when data event is emitted
          const resolveGet = data => {
            // Remove self listener
            this.removeListener('data', resolveGet);

            if (options.schema === true) {
              // Return whole response
              resolve(data);
            } else if (options.dps) {
              // Return specific property
              resolve(data.dps[options.dps]);
            } else {
              // Return first property by default
              resolve(data.dps['1']);
            }
          };

          // Add listener
          this.on('data', resolveGet);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Sets a property on a device.
   * @param {Object} options
   * @param {Number} [options.dps=1] DPS index to set
   * @param {*} [options.set] value to set
   * @param {Boolean} [options.multiple=false]
   * Whether or not multiple properties should be set with options.data
   * @param {Object} [options.data={}] Multiple properties to set at once. See above.
   * @example
   * // set default property
   * tuya.set({set: true}).then(() => console.log('device was turned on'))
   * @example
   * // set custom property
   * tuya.set({dps: 2, set: false}).then(() => console.log('device was turned off'))
   * @example
   * // set multiple properties
   * tuya.set({
   *           multiple: true,
   *           data: {
   *             '1': true,
   *             '2': 'white'
   *          }}).then(() => console.log('device was changed'))
   * @returns {Promise<Boolean>} - returns `true` if the command succeeded
   */
  set(options) {
    // Check arguments
    if (options === undefined || Object.entries(options).length === 0) {
      throw new TypeError('No arguments were passed.');
    }

    // Defaults
    let dps = {};

    if (options.multiple === true) {
      dps = options.data;
    } else if (options.dps === undefined) {
      dps = {
        1: options.set
      };
    } else {
      dps = {
        [options.dps.toString()]: options.set
      };
    }

    // Get time
    const timeStamp = parseInt(new Date / 1000);

    // Construct payload
    const payload = {
      devId: this.device.id,
      gwId: this.device.gwID,
      uid: '',
      t: timeStamp,
      dps
    };

    debug('SET Payload:');
    debug(payload);

    // Encrypt data
    const data = this.device.cipher.encrypt({
      data: JSON.stringify(payload)
    });

    // Create MD5 signature
    const md5 = this.device.cipher.md5('data=' + data +
      '||lpv=' + this.device.version +
      '||' + this.device.key);

    // Create byte buffer from hex data
    const thisData = Buffer.from(this.device.version + md5 + data);

    // Encode into packet
    const buffer = Parser.encode({
      data: thisData,
      commandByte: 7 // 0x07
    });

    // Send request and wait for response
    return new Promise((resolve, reject) => {
      try {
        // Send request
        this._send(buffer).then(() => {
          // Runs when data event is emitted
          const resolveSet = _ => {
            // Remove self listener
            this.removeListener('data', resolveSet);

            // Return true
            resolve(true);
          };

          // Add listener to data event
          this.on('data', resolveSet);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Sends a query to a device. Helper function
   * that connects to a device if necessary and
   * wraps the entire operation in a retry.
   * @private
   * @param {Buffer} buffer buffer of data
   * @returns {Promise<Boolean>} `true` if query was successfully sent
   */
  _send(buffer) {
    // Make sure we're connected
    if (!this.isConnected()) {
      throw new Error('No connection has been made to the device.');
    }

    // Check for IP
    if (typeof this.device.ip === 'undefined') {
      throw new TypeError('Device missing IP address.');
    }

    // Retry up to 5 times
    return pRetry(async () => {
      // Send data
      this.client.write(buffer);

      return true;
    }, {retries: 5});
  }

  /**
   * Sends a heartbeat ping to the device
   * @private
   */
  async _sendPing() {
    debug(`Pinging ${this.device.ip}`);

    // Create byte buffer
    const buffer = Parser.encode({
      data: Buffer.allocUnsafe(0),
      commandByte: 9 // 0x09
    });

    // Send ping
    await this._send(buffer);
  }

  /**
   * Connects to the device. Can be called even
   * if device is already connected.
   * @returns {Promise<Boolean>} `true` if connect succeeds
   * @emits TuyaDevice#connected
   * @emits TuyaDevice#disconnected
   * @emits TuyaDevice#data
   * @emits TuyaDevice#error
   */
  connect() {
    if (!this.isConnected()) {
      return new Promise((resolve, reject) => {
        this.client = new net.Socket();

        // Attempt to connect
        debug(`Connecting to ${this.device.ip}...`);
        this.client.connect(this.device.port, this.device.ip);

        // Default connect timeout is ~1 minute,
        // 5 seconds is a more reasonable default
        // since `retry` is used.
        this.client.setTimeout(this._connectTimeout * 1000, () => {
          /**
           * Emitted on socket error, usually a
           * result of a connection timeout.
           * Also emitted on parsing errors.
           * @event TuyaDevice#error
           * @property {Error} error error event
           */
          // this.emit('error', new Error('connection timed out'));
          this.client.destroy();
          reject(new Error('connection timed out'));
        });

        // Add event listeners to socket

        // Parse response data
        this.client.on('data', data => {
          debug('Received response');
          debug(data.toString('hex'));

          // Response was received, so stop waiting
          clearTimeout(this._sendTimeout);

          let dataRes;
          try {
            dataRes = Parser.parse(data);
          } catch (error) {
            debug(error);
            this.emit('error', error);
            return;
          }

          data = dataRes.data;

          if (typeof data === 'object') {
            debug('Parsed response data:');
            debug(data);
          } else if (typeof data === 'undefined') {
            if (dataRes.commandByte === 0x09) { // PONG received
              debug('Pong', this.device.ip);
              return;
            }

            if (dataRes.commandByte === 0x07) { // Set succeeded
              debug('Set succeeded.');
              return;
            }

            debug(`Undefined data with command byte ${dataRes.commandByte}`);
          } else { // Message is encrypted
            data = this.device.cipher.decrypt(data);
            debug('Decrypted response data:');
            debug(data);
          }

          /**
           * Emitted when data is returned from device.
           * @event TuyaDevice#data
           * @property {Object} data received data
           * @property {Number} commandByte
           * commandByte of result
           * (e.g. 7=requested response, 8=proactive update from device)
           */
          this.emit('data', data, dataRes.commandByte);
        });

        // Handle errors
        this.client.on('error', err => {
          debug('Error event from socket.', this.device.ip, err);

          this.emit('error', new Error('Error from socket'));

          this.client.destroy();
        });

        // Handle socket closure
        this.client.on('close', () => {
          debug(`Socket closed: ${this.device.ip}`);

          this._connected = false;

          /**
           * Emitted when a socket is disconnected
           * from device. Not an exclusive event:
           * `error` and `disconnected` may be emitted
           * at the same time if, for example, the device
           * goes off the network.
           * @event TuyaDevice#disconnected
           */
          this.emit('disconnected');
          this.client.destroy();

          if (this.pingpongTimeout) {
            clearTimeout(this.pingpongTimeout);
            this.pingpongTimeout = null;
          }
        });

        this.client.on('connect', async () => {
          debug('Socket connected.');

          this._connected = true;

          // Remove connect timeout
          this.client.setTimeout(0);

          /**
          * Emitted when socket is connected
          * to device. This event may be emitted
          * multiple times within the same script,
          * so don't use this as a trigger for your
          * initialization code.
          * @event TuyaDevice#connected
          */
          this.emit('connected');

          // Periodically send heartbeat ping
          this.pingpongTimeout = setInterval(async () => {
            await this._sendPing();
          }, this._pingPongPeriod * 1000);

          // Automatically ask for current state so we
          // can emit a `data` event as soon as possible
          await this.get();

          // Return
          resolve(true);
        });
      });
    }

    // Return if already connected
    return Promise.resolve(true);
  }

  /**
   * Disconnects from the device, use to
   * close the socket and exit gracefully.
   */
  disconnect() {
    debug('Disconnect');

    this._connected = false;

    // Clear timeouts
    clearTimeout(this._sendTimeout);
    clearTimeout(this._connectTimeout);
    clearTimeout(this._responseTimeout);
    clearTimeout(this.pingpongTimeout);

    if (!this.client) {
      return;
    }

    this.client.destroy();
  }

  /**
   * Returns current connection status to device.
   * @returns {Boolean}
   * (`true` if connected, `false` otherwise.)
   */
  isConnected() {
    return this._connected;
  }

  /**
   * Checks a given input string.
   * @private
   * @param {String} input input string
   * @returns {Boolean}
   * `true` if is string and length != 0, `false` otherwise.
   */
  checkIfValidString(input) {
    return typeof input === 'string' && input.length > 0;
  }

  /**
   * @deprecated since v3.0.0. Will be removed in v4.0.0. Use find() instead.
   */
  resolveId(options) {
    // eslint-disable-next-line max-len
    console.warn('resolveId() is deprecated since v4.0.0. Will be removed in v5.0.0. Use find() instead.');
    return this.find(options);
  }

  /**
   * Finds an ID or IP, depending on what's missing.
   * If you didn't pass an ID or IP to the constructor,
   * you must call this before anything else.
   * @param {Object} [options]
   * @param {Boolean} [options.all]
   * true to return array of all found devices
   * @param {Number} [options.timeout=10]
   * how long, in seconds, to wait for device
   * to be resolved before timeout error is thrown
   * @example
   * tuya.find().then(() => console.log('ready!'))
   * @returns {Promise<Boolean|Array>}
   * true if ID/IP was found and device is ready to be used
   */
  find({timeout = 10, all = false} = {}) {
    if (this.checkIfValidString(this.device.id) &&
        this.checkIfValidString(this.device.ip)) {
      // Don't need to do anything
      debug('IP and ID are already both resolved.');
      return Promise.resolve(true);
    }

    // Create new listener
    const listener = dgram.createSocket({type: 'udp4', reuseAddr: true});
    listener.bind(6666);

    debug(`Finding missing IP ${this.device.ip} or ID ${this.device.id}`);

    // Find IP for device
    return pTimeout(new Promise((resolve, reject) => { // Timeout
      listener.on('message', message => {
        debug('Received UDP message.');

        let dataRes;
        try {
          dataRes = Parser.parse(message);
        } catch (error) {
          debug(error);
          reject(error);
        }

        debug('UDP data:');
        debug(dataRes.data);

        const thisID = dataRes.data.gwId;
        const thisIP = dataRes.data.ip;

        // Add to array if it doesn't exist
        if (!this.foundDevices.some(e => (e.id === thisID && e.ip === thisIP))) {
          this.foundDevices.push({id: thisID, ip: thisIP});
        }

        if (!all &&
            (this.device.id === thisID || this.device.ip === thisIP) &&
            dataRes.data) {
          // Add IP
          this.device.ip = dataRes.data.ip;

          // Add ID and gwID
          this.device.id = this.device.gwID = dataRes.data.gwId;

          // Change product key if neccessary
          this.device.productKey = dataRes.data.productKey;

          // Change protocol version if necessary
          this.device.version = dataRes.data.version;

          // Cleanup
          listener.close();
          listener.removeAllListeners();
          resolve(true);
        }
      });

      listener.on('error', err => {
        reject(err);
      });
    }), timeout * 1000, () => {
      // Have to do this so we exit cleanly
      listener.close();
      listener.removeAllListeners();

      // Return all devices
      if (all) {
        return this.foundDevices;
      }

      // Otherwise throw error
      // eslint-disable-next-line max-len
      throw new Error('find() timed out. Is the device powered on and the ID or IP correct?');
    });
  }

  /**
   * Toggles a boolean property.
   * @param {Number} [property=1] property to toggle
   * @returns {Promise<Boolean>} the resulting state
   */
  async toggle(property = '1') {
    property = property.toString();

    try {
      // Get status
      const status = await this.get({dps: property});

      // Set to opposite
      await this.set({set: !status, dps: property});

      // Return new status
      return await this.get({dps: property});
    } catch (error) {
      throw error;
    }
  }
}

module.exports = TuyaDevice;
