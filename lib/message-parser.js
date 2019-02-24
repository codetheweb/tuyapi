const debug = require('debug')('TuyAPI:MessageParser');

const HEADER_SIZE = 16;

/**
* Class for decoding and encoding payloads.
* @class
* @private
*/
class MessageParser {
  constructor() {
    this._parsed = false;
    this._buff = Buffer.alloc(0);
    this._commandByte = undefined;
    this._payloadSize = undefined;
    this._returnCode = undefined;
    this._data = undefined;
    this._crc = undefined;
    this._leftOver = undefined;
  }

  /**
  * Append data to current buffer.
  * @param {Buffer} buff data to append
  * @private
  */
  _append(buff) {
    this._buff = Buffer.concat([this._buff, buff]);
  }

  /**
  * Parse current buffer stored in instance.
  * @returns {Boolean} true if successfully parsed
  * @private
  */
  _parse() {
    if (this._parsed) {
      return true;
    }

    // Check for length
    // At minimum requires: prefix (4), sequence (4), command (4), length (4),
    // CRC (4), and suffix (4) for 24 total bytes
    // Messages from the device also include return code (4), for 28 total bytes
    if (this._buff.length < 24) {
      throw new Error('Packet too small. Length: ' + this._buff.length);
    }

    // Check for prefix
    const prefix = this._buff.readUInt32BE(0);

    if (prefix !== 0x000055AA) {
      throw new Error('Magic prefix mismatch: ' + this._buff.toString('hex'));
    }

    // Get the command type
    this._commandByte = this._buff.readUInt32BE(8);

    // Get payload size
    this._payloadSize = this._buff.readUInt32BE(12);

    // Check for payload
    if (this._buff.length < HEADER_SIZE + this._payloadSize) {
      throw new Error('Packet missing payload: ' + this._buff.toString('hex'));
    }

    // Get the return code, 0 = success
    // This field is only present in messages from the devices
    // Absent in messages sent to device
    this._returnCode = this._buff.readUInt32BE(16);

    // Get the payload
    // Adjust for messages lacking a return code
    if (this._returnCode & 0xFFFFFF00) {
      this._data = this._buff.slice(HEADER_SIZE, HEADER_SIZE + this._payloadSize - 8);
    } else {
      this._data = this._buff.slice(HEADER_SIZE + 4, HEADER_SIZE + this._payloadSize - 8);
    }

    // Get the CRC
    this._crc = this._buff.readUInt32BE(HEADER_SIZE + this._payloadSize - 8);

    // Check for suffix
    const suffix = this._buff.readUInt32BE(HEADER_SIZE + this._payloadSize - 4);

    if (suffix !== 0x0000AA55) {
      throw new Error('Magic suffix mismatch: ' + this._buff.toString('hex'));
    }

    // Check for leftovers
    if (this._buff.length > HEADER_SIZE + this._payloadSize) {
      debug(this._buff.length - HEADER_SIZE - this._payloadSize, 'bytes left over');
      this._leftOver = this._buff.slice(HEADER_SIZE + this._payloadSize);
    }

    return true;
  }

  /**
  * Attempt to parse data to JSON.
  * @returns {Object} result
  * @returns {String|Buffer|Object} result.data decoded data, if available in response
  * @returns {Number} result.commandByte command byte from decoded data
  * @private
  */
  _decode() {
    const result = {
      commandByte: this._commandByte
    };
    // It's possible for packets to be valid
    // and yet contain no data.
    if (this._data.length === 0) {
      return result;
    }

    // Try to parse data as JSON.
    // If error, return as string.
    try {
      result.data = JSON.parse(this._data);
    } catch (error) { // Data is encrypted
      result.data = this._data.toString('ascii');
    }

    return result;
  }

  /**
  * Encode data (usually an object) into
  * a protocol-compliant form that a device
  * can understand.
  * @param {Object} options
  * @param {String|Buffer|Object} options.data data to encode
  * @param {Number} options.commandByte command byte
  * @returns {Buffer} binary payload
  * @private
  */
  _encode(options) {
    // Ensure data is a Buffer
    let payload;

    if (options.data instanceof Buffer) {
      payload = options.data;
    } else {
      if (typeof options.data === 'string') {
        payload = options.data;
      } else {
        payload = JSON.stringify(options.data);
      }

      payload = Buffer.from(payload);
    }

    // Ensure commandByte is a Number
    if (typeof options.commandByte === 'string') {
      options.commandByte = parseInt(options.commandByte, 16);
    }

    // Allocate buffer with room for payload + 24 bytes for
    // prefix, sequence, command, length, crc, and suffix
    const buffer = Buffer.alloc(payload.length + 24);

    // Add prefix, command, and length
    // Skip sequence number, currently not used
    buffer.writeUInt32BE(0x000055AA, 0);
    buffer.writeUInt32BE(options.commandByte, 8);
    buffer.writeUInt32BE(payload.length + 8, 12);

    // Add payload and suffix
    // As devices don't seem to care,
    // just use an empty CRC for now.
    payload.copy(buffer, 16);
    buffer.writeUInt32BE(0x0000AA55, payload.length + 20);

    return buffer;
  }
}

/**
* Static wrapper for lower-level MessageParser
* functions to easily parse packets.
* @param {Buffer} data packet to parse
* @returns {Object} result
* @returns {String|Buffer|Object} result.data decoded data, if available in response
* @returns {Number} result.commandByte command byte from decoded data
*/
function parse(data) {
  const p = new MessageParser();
  p._append(data);
  p._parse();
  return p._decode();
}

/**
* Static wrapper for lower-level MessageParser
* functions to easily encode packets
* @param {Object} options
* @param {String|Buffer|Object} options.data data to encode
* @param {Number} options.commandByte command byte
* @returns {Buffer} binary payload
*/
function encode(options) {
  const p = new MessageParser();
  return p._encode({data: options.data, commandByte: options.commandByte});
}

module.exports = {parse, encode};
