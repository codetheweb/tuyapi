const Cipher = require('./cipher');
const crc = require('./crc');

const HEADER_SIZE = 16;

/**
 * Human-readable definitions
 * of command bytes.
 * @readonly
 * @private
 */
const CommandType = {
  UDP: 0,
  AP_CONFIG: 1,
  ACTIVE: 2,
  BIND: 3,
  RENAME_GW: 4,
  RENAME_DEVICE: 5,
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
  DP_REFRESH: 18,
  UDP_NEW: 19,
  AP_CONFIG_NEW: 20,
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
 * @param {Object} options
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
   * one complete packet at the begining of the buffer.
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

    if (prefix !== 0x000055AA) {
      throw new TypeError(`Prefix does not match: ${buffer.toString('hex')}`);
    }

    // Check for extra data
    let leftover = false;

    const suffixLocation = buffer.indexOf('0000AA55', 0, 'hex');

    if (suffixLocation !== buffer.length - 4) {
      leftover = buffer.slice(suffixLocation + 4);
      buffer = buffer.slice(0, suffixLocation + 4);
    }

    // Check for suffix
    const suffix = buffer.readUInt32BE(buffer.length - 4);

    if (suffix !== 0x0000AA55) {
      throw new TypeError(`Suffix does not match: ${buffer.toString('hex')}`);
    }

    // Get sequence number
    const sequenceN = buffer.readUInt32BE(4);

    // Get command byte
    const commandByte = buffer.readUInt32BE(8);

    // Get payload size
    const payloadSize = buffer.readUInt32BE(12);

    // Check for payload
    if (buffer.length - 8 < payloadSize) {
      throw new TypeError(`Packet missing payload: payload has length ${payloadSize}.`);
    }

    // Get the return code, 0 = success
    // This field is only present in messages from the devices
    // Absent in messages sent to device
    const returnCode = buffer.readUInt32BE(16);

    // Get the payload
    // Adjust for messages lacking a return code
    let payload;
    if (returnCode & 0xFFFFFF00) {
      payload = buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadSize - 8);
    } else {
      payload = buffer.slice(HEADER_SIZE + 4, HEADER_SIZE + payloadSize - 8);
    }

    // Check CRC
    const expectedCrc = buffer.readInt32BE(HEADER_SIZE + payloadSize - 8);
    const computedCrc = crc(buffer.slice(0, payloadSize + 8));

    if (expectedCrc !== computedCrc) {
      throw new Error(`CRC mismatch: expected ${expectedCrc}, was ${computedCrc}. ${buffer.toString('hex')}`);
    }

    return {payload, leftover, commandByte, sequenceN};
  }

  /**
   * Attempts to decode a given payload into
   * an object or string.
   * @param {Buffer} data to decode
   * @returns {Object|String}
   * object if payload is JSON, otherwise string
   */
  getPayload(data) {
    if (data.length === 0) {
      return false;
    }

    // Try to decrypt data first.
    try {
      if (!this.cipher) {
        throw new Error('Missing key or version in constructor.');
      }

      data = this.cipher.decrypt(data);
    } catch (_) {
      data = data.toString('utf8');
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
   * a series of packets. Perfer using
   * the parse() wrapper over using this
   * directly.
   * @private
   * @param {Buffer} buffer to parse
   * @param {Array} packets that have been parsed
   * @returns {Array.<Packet>} array of parsed packets
   */
  parseRecursive(buffer, packets) {
    const result = this.parsePacket(buffer);

    result.payload = this.getPayload(result.payload);

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
    const packets = this.parseRecursive(buffer, []);

    return packets;
  }

  /**
   * Encodes a payload into a
   * Tuya-protocol-complient packet.
   * @param {Object} options
   * @param {Buffer|String|Object} options.data data to encode
   * @param {Boolean} options.encrypted whether or not to encrypt the data
   * @param {Number} options.commandByte
   * command byte of packet (use CommandType definitions)
   * @param {Number} [options.sequenceN] optional, sequence number
   * @returns {Buffer}
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

    // Construct payload
    let payload = options.data;

    // Protocol 3.3 is always encrypted
    if (this.version === '3.3') {
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
}

module.exports = {MessageParser, CommandType};
