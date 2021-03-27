// Import packages
const dgram = require('dgram');
const net = require('net');
const {EventEmitter} = require('events');
const pTimeout = require('p-timeout');
const pRetry = require('p-retry');
const {default: PQueue} = require('p-queue');
const debug = require('debug')('TuyAPI');

// Helpers
const {isValidString} = require('./lib/utils');
const {MessageParser, CommandType} = require('./lib/message-parser');
const {UDP_KEY} = require('./lib/config');

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
 * @param {Boolean} [options.nullPayloadOnJSONError=false] if true, emits a data event
 * containing a payload of null values for on-device JSON parsing errors
 * @param {Boolean} [options.issueGetOnConnect=true] if true, sends GET request after
 * connection is established. This should probably be `false` in synchronous usage.
 * @param {Boolean} [options.issueRefreshOnConnect=false] if true, sends DP_REFRESH request after
 * connection is established. This should probably be `false` in synchronous usage.
 * @example
 * const tuya = new TuyaDevice({id: 'xxxxxxxxxxxxxxxxxxxx',
 *                              key: 'xxxxxxxxxxxxxxxx'})
 */
class TuyaDevice extends EventEmitter {
  constructor({
    ip,
    port = 6668,
    id,
    gwID = id,
    key,
    productKey,
    version = 3.1,
    nullPayloadOnJSONError = false,
    issueGetOnConnect = true,
    issueRefreshOnConnect = false
  } = {}) {
    super();
    // Set device to user-passed options
    this.device = {ip, port, id, gwID, key, productKey, version};
    this.globalOptions = {
      issueGetOnConnect,
      issueRefreshOnConnect
    };

    this.nullPayloadOnJSONError = nullPayloadOnJSONError;

    // Check arguments
    if (!(isValidString(id) ||
        isValidString(ip))) {
      throw new TypeError('ID and IP are missing from device.');
    }

    // Check key
    if (!isValidString(this.device.key) || this.device.key.length !== 16) {
      throw new TypeError('Key is missing or incorrect.');
    }

    // Handles encoding/decoding, encrypting/decrypting messages
    this.device.parser = new MessageParser({
      key: this.device.key,
      version: this.device.version
    });

    // Contains array of found devices when calling .find()
    this.foundDevices = [];

    // Private instance variables

    // Socket connected state
    this._connected = false;

    this._responseTimeout = 2; // Seconds
    this._connectTimeout = 5; // Seconds
    this._pingPongPeriod = 10; // Seconds
    this._pingPongTimeout = null;
    this._lastPingAt = new Date();

    this._currentSequenceN = 0;
    this._resolvers = {};
    this._setQueue = new PQueue({
      concurrency: 1
    });

    // List of dps which needed CommandType.DP_REFRESH (command 18) to force refresh their values.
    // Power data - DP 19 on some 3.1/3.3 devices, DP 5 for some 3.1 devices.
    this._dpRefreshIds = [4, 5, 6, 18, 19, 20];
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
      devId: this.device.id,
      t: Math.round(new Date().getTime() / 1000).toString(),
      dps: {},
      uid: this.device.id
    };

    debug('GET Payload:');
    debug(payload);

    // Create byte buffer
    const buffer = this.device.parser.encode({
      data: payload,
      commandByte: CommandType.DP_QUERY,
      sequenceN: ++this._currentSequenceN
    });

    // Send request and parse response
    return new Promise((resolve, reject) => {
      // Send request
      this._send(buffer).then(async data => {
        if (data === 'json obj data unvalid' && options.schema !== true) {
          // Some devices don't respond to DP_QUERY so, for DPS get commands, fall
          // back to using SEND with null value. This appears to always work as
          // long as the DPS key exist on the device.
          // For schema there's currently no fallback options
          const setOptions = {
            dps: options.dps ? options.dps : 1,
            set: null
          };
          data = await this.set(setOptions);
        }

        if (typeof data !== 'object' || options.schema === true) {
          // Return whole response
          resolve(data);
        } else if (options.dps) {
          // Return specific property
          resolve(data.dps[options.dps]);
        } else {
          // Return first property by default
          resolve(data.dps['1']);
        }
      })
        .catch(reject);
    });
  }

  /**
   * Refresh a device's current status.
   * Defaults to returning all values.
   * @param {Object} [options]
   * @param {Boolean} [options.schema]
   * true to return entire list of properties from device
   * @param {Array.<Number>} [options.dps=[4,5,6,18,19,20]]
   * DPS index to return
   * @example
   * // get first, default property from device
   * tuya.refresh().then(status => console.log(status))
   * @example
   * // get second property from device
   * tuya.refresh({dps: [4,5,9,18,19,20]}).then(status => console.log(status))
   * @example
   * // get all available data from device
   * tuya.refresh({schema: true}).then(data => console.log(data))
   * @returns {Promise<Object>}
   * returns object of results
   */
  refresh(options = {}) {
    const payload = {
      gwId: this.device.gwID,
      devId: this.device.id,
      t: Math.round(new Date().getTime() / 1000).toString(),
      dpId: options.dps ? options.dps : this._dpRefreshIds,
      uid: this.device.id
    };

    debug('GET Payload:');
    debug(payload);

    // Create byte buffer
    const buffer = this.device.parser.encode({
      data: payload,
      commandByte: CommandType.DP_REFRESH,
      sequenceN: ++this._currentSequenceN
    });

    // Send request and parse response
    return new Promise((resolve, reject) => {
      // Send request
      this._send(buffer).then(async data => {
        if (data === 'json obj data unvalid' && options.schema !== true) {
          // Some devices don't respond to DP_QUERY so, for DPS get commands, fall
          // back to using SEND with null value. This appears to always work as
          // long as the DPS key exist on the device.
          // For schema there's currently no fallback options
          const setOptions = {
            dps: options.dps ? options.dps : this._dpRefreshIds,
            set: null
          };
          data = await this.set(setOptions);
        }

        if (typeof data !== 'object' || options.schema === true) {
          // Return whole response
          resolve(data);
        } else if (options.dps) {
          // Return specific property
          resolve(data.dps[options.dps]);
        } else {
          // Return all dps by default
          resolve(data.dps);
        }
      })
        .catch(reject);
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
   * @param {Boolean} [options.shouldWaitForResponse=true] see
   * [#420](https://github.com/codetheweb/tuyapi/issues/420) and
   * [#421](https://github.com/codetheweb/tuyapi/pull/421) for details
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
   * @example
   * // set custom property for a specific (virtual) deviceId
   * tuya.set({
   *           dps: 2,
   *           set: false,
   *           devId: '04314116cc50e346566e'
   *          }).then(() => console.log('device was turned off'))
   * @returns {Promise<Object>} - returns response from device
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

    options.shouldWaitForResponse = typeof options.shouldWaitForResponse === 'undefined' ? true : options.shouldWaitForResponse;

    // Get time
    const timeStamp = parseInt(new Date() / 1000, 10);

    // Construct payload
    const payload = {
      devId: options.devId || this.device.id,
      gwId: this.device.gwID,
      uid: '',
      t: timeStamp,
      dps
    };

    debug('SET Payload:');
    debug(payload);

    // Encode into packet
    const buffer = this.device.parser.encode({
      data: payload,
      encrypted: true, // Set commands must be encrypted
      commandByte: CommandType.CONTROL,
      sequenceN: ++this._currentSequenceN
    });

    // Queue this request and limit concurrent set requests to one
    return this._setQueue.add(() => pTimeout(new Promise((resolve, reject) => {
      // Send request and wait for response
      try {
        // Send request
        this._send(buffer);
        if (options.shouldWaitForResponse) {
          this._setResolver = resolve;
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    }), this._responseTimeout * 1000, () => {
      // Only gets here on timeout so clear resolver function and emit error
      this._setResolver = undefined;

      this.emit(
        'error',
        'Timeout waiting for status response from device id: ' + this.device.id
      );
    }));
  }

  /**
   * Sends a query to a device. Helper function
   * that connects to a device if necessary and
   * wraps the entire operation in a retry.
   * @private
   * @param {Buffer} buffer buffer of data
   * @returns {Promise<Any>} returned data for request
   */
  _send(buffer) {
    // Retry up to 5 times
    return pRetry(() => {
      return new Promise((resolve, reject) => {
        // Send data
        this.connect().then(() => {
          try {
            this.client.write(buffer);

            // Add resolver function
            this._resolvers[this._currentSequenceN] = data => resolve(data);
          } catch (error) {
            reject(error);
          }
        })
          .catch(error => reject(error));
      });
    }, {
      onFailedAttempt: error => {
        debug(`Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
      }, retries: 5});
  }

  /**
   * Sends a heartbeat ping to the device
   * @private
   */
  async _sendPing() {
    debug(`Pinging ${this.device.ip}`);

    // Create byte buffer
    const buffer = this.device.parser.encode({
      data: Buffer.allocUnsafe(0),
      commandByte: CommandType.HEART_BEAT,
      sequenceN: ++this._currentSequenceN
    });

    // Check for response
    const now = new Date();

    this._pingPongTimeout = setTimeout(() => {
      if (this._lastPingAt < now) {
        this.disconnect();
      }
    }, this._responseTimeout * 1000);

    // Send ping
    this.client.write(buffer);
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
          debug(`Received data: ${data.toString('hex')}`);

          let packets;

          try {
            packets = this.device.parser.parse(data);

            if (this.nullPayloadOnJSONError) {
              for (const packet of packets) {
                if (packet.payload && packet.payload === 'json obj data unvalid') {
                  this.emit('error', packet.payload);

                  packet.payload = {
                    dps: {
                      1: null,
                      2: null,
                      3: null,
                      101: null,
                      102: null,
                      103: null
                    }
                  };
                }
              }
            }
          } catch (error) {
            debug(error);
            this.emit('error', error);
            return;
          }

          packets.forEach(packet => {
            debug('Parsed:');
            debug(packet);

            this._packetHandler.bind(this)(packet);
          });
        });

        // Handle errors
        this.client.on('error', err => {
          debug('Error event from socket.', this.device.ip, err);

          this.emit('error', new Error('Error from socket: ' + err.message));

          if (!this._connected) {
            reject(err);
          }

          this.client.destroy();
        });

        // Handle socket closure
        this.client.on('close', () => {
          debug(`Socket closed: ${this.device.ip}`);

          this.disconnect();
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
          this._pingPongInterval = setInterval(async () => {
            await this._sendPing();
          }, this._pingPongPeriod * 1000);

          // Automatically ask for dp_refresh so we
          // can emit a `dp_refresh` event as soon as possible
          if (this.globalOptions.issueRefreshOnConnect) {
            this.refresh();
          }

          // Automatically ask for current state so we
          // can emit a `data` event as soon as possible
          if (this.globalOptions.issueGetOnConnect) {
            this.get();
          }

          // Return
          resolve(true);
        });
      });
    }

    // Return if already connected
    return Promise.resolve(true);
  }

  _packetHandler(packet) {
    // Response was received, so stop waiting
    clearTimeout(this._sendTimeout);

    if (packet.commandByte === CommandType.HEART_BEAT) {
      debug(`Pong from ${this.device.ip}`);
      /**
       * Emitted when a heartbeat ping is returned.
       * @event TuyaDevice#heartbeat
       */
      this.emit('heartbeat');

      this._lastPingAt = new Date();

      return;
    }

    if (packet.commandByte === CommandType.CONTROL && packet.payload === false) {
      debug('Got SET ack.');
      return;
    }

    // Returned DP refresh response is always empty. Device respond with command 8 without dps 1 instead.
    if (packet.commandByte === CommandType.DP_REFRESH) {
      debug('Received DP_REFRESH empty response packet.');
      return;
    }

    if (packet.commandByte === CommandType.STATUS && packet.payload && packet.payload.dps && typeof packet.payload.dps[1] === 'undefined') {
      debug('Received DP_REFRESH packet.');
      /**
       * Emitted when dp_refresh data is proactive returned from device, omitting dps 1
       * Only changed dps are returned.
       * @event TuyaDevice#dp-refresh
       * @property {Object} data received data
       * @property {Number} commandByte
       * commandByte of result( 8=proactive update from device)
       * @property {Number} sequenceN the packet sequence number
       */
      this.emit('dp-refresh', packet.payload, packet.commandByte, packet.sequenceN);
    } else {
      debug('Received DATA packet');
      /**
       * Emitted when data is returned from device.
       * @event TuyaDevice#data
       * @property {Object} data received data
       * @property {Number} commandByte
       * commandByte of result
       * (e.g. 7=requested response, 8=proactive update from device)
       * @property {Number} sequenceN the packet sequence number
       */
      this.emit('data', packet.payload, packet.commandByte, packet.sequenceN);
    }

    // Status response to SET command
    if (packet.sequenceN === 0 &&
        packet.commandByte === CommandType.STATUS &&
        typeof this._setResolver === 'function') {
      this._setResolver(packet.payload);

      // Remove resolver
      this._setResolver = undefined;
      return;
    }

    // Call data resolver for sequence number
    if (packet.sequenceN in this._resolvers) {
      this._resolvers[packet.sequenceN](packet.payload);

      // Remove resolver
      delete this._resolvers[packet.sequenceN];
    }
  }

  /**
   * Disconnects from the device, use to
   * close the socket and exit gracefully.
   */
  disconnect() {
    if (!this._connected) {
      return;
    }

    debug('Disconnect');

    this._connected = false;

    // Clear timeouts
    clearTimeout(this._sendTimeout);
    clearTimeout(this._connectTimeout);
    clearTimeout(this._responseTimeout);
    clearInterval(this._pingPongInterval);
    clearTimeout(this._pingPongTimeout);

    if (this.client) {
      this.client.destroy();
    }

    /**
     * Emitted when a socket is disconnected
     * from device. Not an exclusive event:
     * `error` and `disconnected` may be emitted
     * at the same time if, for example, the device
     * goes off the network.
     * @event TuyaDevice#disconnected
     */
    this.emit('disconnected');
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
   * @deprecated since v3.0.0. Will be removed in v4.0.0. Use find() instead.
   */
  resolveId(options) {
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
    if (isValidString(this.device.id) &&
        isValidString(this.device.ip)) {
      // Don't need to do anything
      debug('IP and ID are already both resolved.');
      return Promise.resolve(true);
    }

    // Create new listeners
    const listener = dgram.createSocket({type: 'udp4', reuseAddr: true});
    listener.bind(6666);

    const listenerEncrypted = dgram.createSocket({type: 'udp4', reuseAddr: true});
    listenerEncrypted.bind(6667);

    const broadcastHandler = (resolve, reject) => message => {
      debug('Received UDP message.');

      const parser = new MessageParser({key: UDP_KEY, version: this.device.version});

      let dataRes;
      try {
        dataRes = parser.parse(message)[0];
      } catch (error) {
        debug(error);
        reject(error);
      }

      debug('UDP data:');
      debug(dataRes);

      const thisID = dataRes.payload.gwId;
      const thisIP = dataRes.payload.ip;

      // Try auto determine power data - DP 19 on some 3.1/3.3 devices, DP 5 for some 3.1 devices
      const thisDPS = dataRes.payload.dps;
      if (thisDPS && typeof thisDPS[19] === 'undefined') {
        this._dpRefreshIds = [4, 5, 6];
      } else {
        this._dpRefreshIds = [18, 19, 20];
      }

      // Add to array if it doesn't exist
      if (!this.foundDevices.some(e => (e.id === thisID && e.ip === thisIP))) {
        this.foundDevices.push({id: thisID, ip: thisIP});
      }

      if (!all &&
          (this.device.id === thisID || this.device.ip === thisIP) &&
          dataRes.payload) {
        // Add IP
        this.device.ip = dataRes.payload.ip;

        // Add ID and gwID
        this.device.id = dataRes.payload.gwId;
        this.device.gwID = dataRes.payload.gwId;

        // Change product key if neccessary
        this.device.productKey = dataRes.payload.productKey;

        // Change protocol version if necessary
        if (this.device.version !== dataRes.payload.version) {
          this.device.version = dataRes.payload.version;

          // Update the parser
          this.device.parser = new MessageParser({
            key: this.device.key,
            version: this.device.version});
        }

        // Cleanup
        listener.close();
        listener.removeAllListeners();
        listenerEncrypted.close();
        listenerEncrypted.removeAllListeners();
        resolve(true);
      }
    };

    debug(`Finding missing IP ${this.device.ip} or ID ${this.device.id}`);

    // Find IP for device
    return pTimeout(new Promise((resolve, reject) => { // Timeout
      listener.on('message', broadcastHandler(resolve, reject));

      listener.on('error', err => {
        reject(err);
      });

      listenerEncrypted.on('message', broadcastHandler(resolve, reject));

      listenerEncrypted.on('error', err => {
        reject(err);
      });
    }), timeout * 1000, () => {
      // Have to do this so we exit cleanly
      listener.close();
      listener.removeAllListeners();
      listenerEncrypted.close();
      listenerEncrypted.removeAllListeners();

      // Return all devices
      if (all) {
        return this.foundDevices;
      }

      // Otherwise throw error
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

    // Get status
    const status = await this.get({dps: property});

    // Set to opposite
    await this.set({set: !status, dps: property});

    // Return new status
    return this.get({dps: property});
  }
}

module.exports = TuyaDevice;
