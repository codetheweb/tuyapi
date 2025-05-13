const Cipher = require('./cipher');
const crc = require('./crc');

const HEADER_SIZE = 16;
const HEADER_SIZE_3_5 = 4;

/**
 * Human-readable definitions
 * of command bytes.
 * See also https://github.com/tuya/tuya-iotos-embeded-sdk-wifi-ble-bk7231n/blob/master/sdk/include/lan_protocol.h
 * @readonly
 * @private
 */
const CommandType = {
  UDP: 0,
  AP_CONFIG: 1,
  ACTIVE: 2,
  BIND: 3, // ?? Leave in for backward compatibility
  SESS_KEY_NEG_START: 3, // Negotiate session key
  RENAME_GW: 4, // ?? Leave in for backward compatibility
  SESS_KEY_NEG_RES: 4, // Negotiate session key response
  RENAME_DEVICE: 5, // ?? Leave in for backward compatibility
  SESS_KEY_NEG_FINISH: 5, // Finalize session key negotiation
  UNBIND: 6,
  CONTROL: 7,
  STATUS: 8,
  HEART_BEAT: 9,
  DP_QUERY: 10,
  QUERY_WIFI: 11,
  TOKEN_BIND: 12,
  CONTROL_NEW: 13,
  ENABLE_WIFI: 14,
  DP_QUERY_NEW: 16,
  SCENE_EXECUTE: 17,
  DP_REFRESH: 18, // Request refresh of DPS  UPDATEDPS / LAN_QUERY_DP
  UDP_NEW: 19,
  AP_CONFIG_NEW: 20,
  BOARDCAST_LPV34: 35,
  LAN_EXT_STREAM: 40,
  LAN_GW_ACTIVE: 240,
  LAN_SUB_DEV_REQUEST: 241,
  LAN_DELETE_SUB_DEV: 242,
  LAN_REPORT_SUB_DEV: 243,
  LAN_SCENE: 244,
  LAN_PUBLISH_CLOUD_CONFIG: 245,
  LAN_PUBLISH_APP_CONFIG: 246,
  LAN_EXPORT_APP_CONFIG: 247,
  LAN_PUBLISH_SCENE_PANEL: 248,
  LAN_REMOVE_GW: 249,
  LAN_CHECK_GW_UPDATE: 250,
  LAN_GW_UPDATE: 251,
  LAN_SET_GW_CHANNEL: 252
};

/**
 * A complete packet.
 * @typedef {Object} Packet
 * @property {Buffer|Object|String} payload
 * Buffer if hasn't been decoded, object or
 * string if it has been
 * @property {Buffer} leftover
 * bytes adjacent to the parsed packet
 * @property {Number} commandByte
 * @property {Number} sequenceN
 */

/**
 * Low-level class for parsing packets.
 * @class
 * @param {Object} options Options
 * @param {String} options.key localKey of cipher
 * @param {Number} [options.version=3.1] protocol version
 * @example
 * const parser = new MessageParser({key: 'xxxxxxxxxxxxxxxx', version: 3.1})
 */
class MessageParser {
  constructor({key, version = 3.1} = {}) {
    // Ensure the version is a string
    version = version.toString();
    this.version = version;

    if (key) {
      if (key.length !== 16) {
        throw new TypeError('Incorrect key format');
      }

      // Create a Cipher if we have a valid key
      this.cipher = new Cipher({key, version});

      this.key = key;
    }
  }

  /**
   * Parses a Buffer of data containing at least
   * one complete packet at the beginning of the buffer.
   * Will return multiple packets if necessary.
   * @param {Buffer} buffer of data to parse
   * @returns {Packet} packet of data
   */
  parsePacket(buffer) {
    // Check for length
    // At minimum requires: prefix (4), sequence (4), command (4), length (4),
    // CRC (4), and suffix (4) for 24 total bytes
    // Messages from the device also include return code (4), for 28 total bytes
    if (buffer.length < 24) {
      throw new TypeError(`Packet too short. Length: ${buffer.length}.`);
    }

    // Check for prefix
    const prefix = buffer.readUInt32BE(0);

    // Only for 3.4 and 3.5 packets
    if (prefix !== 0x000055AA && prefix !== 0x00006699) {
      throw new TypeError(`Prefix does not match: ${buffer.toString('hex')}`);
    }

    // Check for extra data
    let leftover = false;

    let suffixLocation = buffer.indexOf('0000AA55', 0, 'hex');
    if (suffixLocation === -1) {// Couldn't find 0000AA55 during parse
      suffixLocation = buffer.indexOf('00009966', 0, 'hex');
    }

    if (suffixLocation !== buffer.length - 4) {
      leftover = buffer.slice(suffixLocation + 4);
      buffer = buffer.slice(0, suffixLocation + 4);
    }

    // Check for suffix
    const suffix = buffer.readUInt32BE(buffer.length - 4);

    if (suffix !== 0x0000AA55 && suffix !== 0x00009966) {
      throw new TypeError(`Suffix does not match: ${buffer.toString('hex')}`);
    }

    let sequenceN;
    let commandByte;
    let payloadSize;
    let overwriteVersion;

    if (suffix === 0x0000AA55) {
      // Get sequence number
      sequenceN = buffer.readUInt32BE(4);

      // Get command byte
      commandByte = buffer.readUInt32BE(8);

      // Get payload size
      payloadSize = buffer.readUInt32BE(12);

      // Check for payload
      if (buffer.length - 8 < payloadSize) {
        throw new TypeError(`Packet missing payload: payload has length ${payloadSize}.`);
      }
    } else if (suffix === 0x00009966) {
      // When this suffix comes in we should have 3.5 version
      overwriteVersion = '3.5';

      // Get sequence number
      sequenceN = buffer.readUInt32BE(6);

      // Get command byte
      commandByte = buffer.readUInt32BE(10);

      // Get payload size
      payloadSize = buffer.readUInt32BE(14) + 14; // Add additional bytes for extras

      // Check for payload
      if (buffer.length - 8 < payloadSize) {
        throw new TypeError(`Packet missing payload: payload has length ${payloadSize}.`);
      }
    } else {
      throw new TypeError(`Suffix does not match: ${buffer.toString('hex')}`); // Should never happen
    }

    const packageFromDiscovery = (
      commandByte === CommandType.UDP ||
      commandByte === CommandType.UDP_NEW ||
      commandByte === CommandType.BOARDCAST_LPV34
    );

    // Get the return code, 0 = success
    // This field is only present in messages from the devices
    // Absent in messages sent to device
    const returnCode = buffer.readUInt32BE(16);

    // Get the payload
    // Adjust for messages lacking a return code
    let payload;
    if (overwriteVersion === '3.5' || this.version === '3.5') {
      payload = buffer.slice(HEADER_SIZE_3_5, HEADER_SIZE_3_5 + payloadSize);
      sequenceN = buffer.slice(6, 10).readUInt32BE();
      commandByte = buffer.slice(10, 14).readUInt32BE();
    } else {
      if (returnCode & 0xFFFFFF00) {
        if (this.version === '3.4' && !packageFromDiscovery) {
          payload = buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadSize - 0x24);
        } else if (this.version === '3.5' && !packageFromDiscovery) {
          payload = buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadSize - 0x24);
        } else {
          payload = buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadSize - 8);
        }
      } else if (this.version === '3.4' && !packageFromDiscovery) {
        payload = buffer.slice(HEADER_SIZE + 4, HEADER_SIZE + payloadSize - 0x24);
      } else if (this.version === '3.5' && !packageFromDiscovery) {
        payload = buffer.slice(HEADER_SIZE + 4, HEADER_SIZE + payloadSize - 0x24);
      } else {
        payload = buffer.slice(HEADER_SIZE + 4, HEADER_SIZE + payloadSize - 8);
      }

      // Check CRC
      if (this.version === '3.4' && !packageFromDiscovery) {
        const expectedCrc = buffer.slice(HEADER_SIZE + payloadSize - 0x24, buffer.length - 4).toString('hex');
        const computedCrc = this.cipher.hmac(buffer.slice(0, HEADER_SIZE + payloadSize - 0x24)).toString('hex');

        if (expectedCrc !== computedCrc) {
          throw new Error(`HMAC mismatch: expected ${expectedCrc}, was ${computedCrc}. ${buffer.toString('hex')}`);
        }
      } else if (this.version !== '3.5') {
        const expectedCrc = buffer.readInt32BE(HEADER_SIZE + payloadSize - 8);
        const computedCrc = crc(buffer.slice(0, payloadSize + 8));

        if (expectedCrc !== computedCrc) {
          throw new Error(`CRC mismatch: expected ${expectedCrc}, was ${computedCrc}. ${buffer.toString('hex')}`);
        }
      }
    }

    return {payload, leftover, commandByte, sequenceN, version: overwriteVersion || this.version};
  }

  /**
   * Attempts to decode a given payload into
   * an object or string.
   * @param {Buffer} data to decode
   * @param {String} version of protocol
   * @returns {Object|String}
   * object if payload is JSON, otherwise string
   */
  getPayload(data, version) {
    if (data.length === 0) {
      return false;
    }

    // Try to decrypt data first.
    try {
      if (!this.cipher) {
        throw new Error('Missing key or version in constructor.');
      }

      data = this.cipher.decrypt(data, version);
    } catch (_) {
      data = data.toString('utf8');
    }

    // Incoming 3.5 data isn't 0 because of iv and tag so check size after
    if (version === '3.5') {
      if (data.length === 0) {
        return false;
      }
    }

    // Try to parse data as JSON.
    // If error, return as string.
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (_) { }
    }

    return data;
  }

  /**
   * Recursive function to parse
   * a series of packets. Prefer using
   * the parse() wrapper over using this
   * directly.
   * @private
   * @param {Buffer} buffer to parse
   * @param {Array} packets that have been parsed
   * @returns {Array.<Packet>} array of parsed packets
   */
  parseRecursive(buffer, packets) {
    const result = this.parsePacket(buffer);

    result.payload = this.getPayload(result.payload, result.version);

    packets.push(result);

    if (result.leftover) {
      return this.parseRecursive(result.leftover, packets);
    }

    return packets;
  }

  /**
   * Given a buffer potentially containing
   * multiple packets, this parses and returns
   * all of them.
   * @param {Buffer} buffer to parse
   * @returns {Array.<Packet>} parsed packets
   */
  parse(buffer) {
    return this.parseRecursive(buffer, []);
  }

  /**
   * Encodes a payload into a Tuya-protocol-compliant packet.
   * @param {Object} options Options for encoding
   * @param {Buffer|String|Object} options.data data to encode
   * @param {Boolean} options.encrypted whether or not to encrypt the data
   * @param {Number} options.commandByte
   * command byte of packet (use CommandType definitions)
   * @param {Number} [options.sequenceN] optional, sequence number
   * @returns {Buffer} Encoded Buffer
   */
  encode(options) {
    // Check command byte
    if (!Object.values(CommandType).includes(options.commandByte)) {
      throw new TypeError('Command byte not defined.');
    }

    // Convert Objects to Strings, Strings to Buffers
    if (!(options.data instanceof Buffer)) {
      if (typeof options.data !== 'string') {
        options.data = JSON.stringify(options.data);
      }

      options.data = Buffer.from(options.data);
    }

    if (this.version === '3.4') {
      return this._encode34(options);
    }

    if (this.version === '3.5') {
      return this._encode35(options);
    }

    return this._encodePre34(options);
  }

  /**
   * Encodes a payload into a Tuya-protocol-compliant packet for protocol version 3.3 and below.
   * @param {Object} options Options for encoding
   * @param {Buffer|String|Object} options.data data to encode
   * @param {Boolean} options.encrypted whether or not to encrypt the data
   * @param {Number} options.commandByte
   * command byte of packet (use CommandType definitions)
   * @param {Number} [options.sequenceN] optional, sequence number
   * @returns {Buffer} Encoded Buffer
   */
  _encodePre34(options) {
    // Construct payload
    let payload = options.data;

    // Protocol 3.3 and 3.2 is always encrypted
    if (this.version === '3.3' || this.version === '3.2') {
      // Encrypt data
      payload = this.cipher.encrypt({
        data: payload,
        base64: false
      });

      // Check if we need an extended header, only for certain CommandTypes
      if (options.commandByte !== CommandType.DP_QUERY &&
          options.commandByte !== CommandType.DP_REFRESH) {
        // Add 3.3 header
        const buffer = Buffer.alloc(payload.length + 15);
        Buffer.from('3.3').copy(buffer, 0);
        payload.copy(buffer, 15);
        payload = buffer;
      }
    } else if (options.encrypted) {
      // Protocol 3.1 and below, only encrypt data if necessary
      payload = this.cipher.encrypt({
        data: payload
      });

      // Create MD5 signature
      const md5 = this.cipher.md5('data=' + payload +
          '||lpv=' + this.version +
          '||' + this.key);

      // Create byte buffer from hex data
      payload = Buffer.from(this.version + md5 + payload);
    }

    // Allocate buffer with room for payload + 24 bytes for
    // prefix, sequence, command, length, crc, and suffix
    const buffer = Buffer.alloc(payload.length + 24);

    // Add prefix, command, and length
    buffer.writeUInt32BE(0x000055AA, 0);
    buffer.writeUInt32BE(options.commandByte, 8);
    buffer.writeUInt32BE(payload.length + 8, 12);

    if (options.sequenceN) {
      buffer.writeUInt32BE(options.sequenceN, 4);
    }

    // Add payload, crc, and suffix
    payload.copy(buffer, 16);
    const calculatedCrc = crc(buffer.slice(0, payload.length + 16)) & 0xFFFFFFFF;

    buffer.writeInt32BE(calculatedCrc, payload.length + 16);
    buffer.writeUInt32BE(0x0000AA55, payload.length + 20);

    return buffer;
  }

  /**
   * Encodes a payload into a Tuya-protocol-complient packet for protocol version 3.4
   * @param {Object} options Options for encoding
   * @param {Buffer|String|Object} options.data data to encode
   * @param {Boolean} options.encrypted whether or not to encrypt the data
   * @param {Number} options.commandByte
   * command byte of packet (use CommandType definitions)
   * @param {Number} [options.sequenceN] optional, sequence number
   * @returns {Buffer} Encoded Buffer
   */
  _encode34(options) {
    let payload = options.data;

    if (options.commandByte !== CommandType.DP_QUERY &&
        options.commandByte !== CommandType.HEART_BEAT &&
        options.commandByte !== CommandType.DP_QUERY_NEW &&
        options.commandByte !== CommandType.SESS_KEY_NEG_START &&
        options.commandByte !== CommandType.SESS_KEY_NEG_FINISH &&
        options.commandByte !== CommandType.DP_REFRESH) {
      // Add 3.4 header
      // check this: mqc_very_pcmcd_mcd(int a1, unsigned int a2)
      const buffer = Buffer.alloc(payload.length + 15);
      Buffer.from('3.4').copy(buffer, 0);
      payload.copy(buffer, 15);
      payload = buffer;
    }

    // ? if (payload.length > 0) { // is null messages need padding - PING work without
    const padding = 0x10 - (payload.length & 0xF);
    const buf34 = Buffer.alloc((payload.length + padding), padding);
    payload.copy(buf34);
    payload = buf34;
    // }

    payload = this.cipher.encrypt({
      data: payload
    });

    payload = Buffer.from(payload);

    // Allocate buffer with room for payload + 24 bytes for
    // prefix, sequence, command, length, crc, and suffix
    const buffer = Buffer.alloc(payload.length + 52);

    // Add prefix, command, and length
    buffer.writeUInt32BE(0x000055AA, 0);
    buffer.writeUInt32BE(options.commandByte, 8);
    buffer.writeUInt32BE(payload.length + 0x24, 12);

    if (options.sequenceN) {
      buffer.writeUInt32BE(options.sequenceN, 4);
    }

    // Add payload, crc, and suffix
    payload.copy(buffer, 16);
    const calculatedCrc = this.cipher.hmac(buffer.slice(0, payload.length + 16));// & 0xFFFFFFFF;
    calculatedCrc.copy(buffer, payload.length + 16);

    buffer.writeUInt32BE(0x0000AA55, payload.length + 48);
    return buffer;
  }

  /**
   * Encodes a payload into a Tuya-protocol-complient packet for protocol version 3.5
   * @param {Object} options Options for encoding
   * @param {Buffer|String|Object} options.data data to encode
   * @param {Boolean} options.encrypted whether or not to encrypt the data
   * @param {Number} options.commandByte
   * command byte of packet (use CommandType definitions)
   * @param {Number} [options.sequenceN] optional, sequence number
   * @returns {Buffer} Encoded Buffer
   */
  _encode35(options) {
    let payload = options.data;

    if (options.commandByte !== CommandType.DP_QUERY &&
        options.commandByte !== CommandType.HEART_BEAT &&
        options.commandByte !== CommandType.DP_QUERY_NEW &&
        options.commandByte !== CommandType.SESS_KEY_NEG_START &&
        options.commandByte !== CommandType.SESS_KEY_NEG_FINISH &&
        options.commandByte !== CommandType.DP_REFRESH) {
      // Add 3.5 header
      const buffer = Buffer.alloc(payload.length + 15);
      Buffer.from('3.5').copy(buffer, 0);
      payload.copy(buffer, 15);
      payload = buffer;
      // OO options.data = '3.5\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' + options.data;
    }

    // Allocate buffer for prefix, unknown, sequence, command, length
    let buffer = Buffer.alloc(18);

    // Add prefix, command, and length
    buffer.writeUInt32BE(0x00006699, 0); // Prefix
    buffer.writeUInt16BE(0x0, 4); // Unknown
    buffer.writeUInt32BE(options.sequenceN, 6); // Sequence
    buffer.writeUInt32BE(options.commandByte, 10); // Command
    buffer.writeUInt32BE(payload.length + 28 /* 0x1c */, 14); // Length

    const encrypted = this.cipher.encrypt({
      data: payload,
      aad: buffer.slice(4, 18)
    });

    buffer = Buffer.concat([buffer, encrypted]);

    return buffer;
  }
}

module.exports = {MessageParser, CommandType};
