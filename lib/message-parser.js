const debug = require('debug')('TuyAPI:MessageParser');

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
    if (this._buff.length < 24) {
      debug('Packet too small. Length:', this._buff.length);
      return false;
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
    if (this._buff.length - 16 < this._payloadSize) {
      debug('Packet missing payload.', this._buff.length, this._payloadSize);
      this._data = '';
      return false;
    }

    // Get the return code, 0 = success
    this._returnCode = this._buff.readUInt32BE(16);

    // Get the payload
    this._data = this._buff.slice(20, this._payloadSize + 8);

    // Get the CRC
    this._crc = this._buff.readUInt32BE(this._payloadSize + 8);

    // Check for suffix
    const suffix = this._buff.readUInt32BE(this._payloadSize + 12);

    if (suffix !== 0x0000AA55) {
      throw new Error('Magic suffix mismatch: ' + this._buff.toString('hex'));
    }

    // Check for leftovers
    if (this._buff.length > this._payloadSize + 16) {
      this._leftOver = this._buff.slice(this._payloadSize + 16);
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
      if (typeof options.data !== 'string') {
        options.data = JSON.stringify(options.data);
      }

      payload = Buffer.from(options.data);
    }

    // Generate prefix (including command and length bytes)
    const prefix = Buffer.from('000055aa00000000000000' +
                               (options.commandByte < 16 ? '0' : '') +
                                options.commandByte.toString(16), 'hex');

    // Suffix is static
    const suffix = Buffer.from('0000aa55', 'hex');

    // As devices don't seem to care,
    // just use an empty CRC for now.
    const crc32Buffer = Buffer.from('00000000', 'hex');

    // Calculate length (everything past length byte)
    const len = Buffer.allocUnsafe(4);
    len.writeInt32BE(Buffer.concat([payload, crc32Buffer, suffix]).length, 0);

    // Concat buffers
    const concatBuffer = Buffer.concat([prefix, len, payload, crc32Buffer, suffix]);

    return concatBuffer;
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
