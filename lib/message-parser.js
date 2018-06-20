const debug = require('debug')('TuyAPI:MessageParser');

const crc = require('crc');

/**
* Class for decoding and encoding payloads.
* @class
*/
function MessageParser() {
  this._parsed = false;
  this._buff = Buffer.alloc(0);
  this._havePrefix = undefined;
  this._payloadSize = undefined;
  this._data = undefined;
  this._leftOver = undefined;
}

/**
* Append data to current buffer.
* @param {Buffer} buff data to append
* @private
*/
MessageParser.prototype._append = function (buff) {
  this._buff = Buffer.concat([this._buff, buff]);
};

/**
* Parse current buffer stored in instance.
* @returns {Boolean} true if successfully parsed
* @private
*/
MessageParser.prototype._parse = function () {
  if (this._parsed) {
    return true;
  }

  if (this._buff.length < 16) {
    debug('packet too small', this._buff.length);
    return false;
  }

  if (!this._havePrefix) {
    const prefix = this._buff.readUInt32BE(0);

    if (prefix !== 0x000055AA) {
      // Should we throw here?
      throw new Error('Magic prefix mismatch: ' + this._buff.slice(0, 4).toString('hex'));
    }

    this._havePrefix = true;
  }

  // The next word is generally null?
  // the 3rd word is the message type?

  if (!this._payloadSize) {
    // The 4th word has the payload size
    this._payloadSize = this._buff.readUInt32BE(12);
  }

  if (this._buff.length - 8 < this._payloadSize) {
    debug('packet missing payload', this._buff.length, this._payloadSize);
    return false;
  }

  const suffix = this._buff.readUInt32BE(this._buff.length - 4);

  if (suffix !== 0x0000AA55) {
    throw new Error('Magic suffix mismatch: ' + this._buff.toString('hex'));
  }

  const data = this._buff.slice(0, this._buff.length - 8);
  const expected = this._buff.readUInt32BE(this._buff.length - 8);

  const actual = crc.crc32(data);

  if (expected !== actual) {
    throw new Error('Invalid CRC32 expected: ' + expected + ' got ' + actual);
  }

  this._data = data.slice(data.length - this._payloadSize + 8);

  // Remove 0 padding
  let done = false;
  while (done === false) {
    if (this._data[0] === 0) {
      this._data = this._data.slice(1);
    } else {
      done = true;
    }
  }

  return true;
};

/**
* Attempt to parse data to JSON.
* @returns {Undefined|Object|String}
* @private
*/
MessageParser.prototype._decode = function () {
  if (this._data.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(this._data);
  } catch (err) { // Data is encrypted
    return this._data.toString('ascii');
  }
};

/**
* Encode data (usually an object) into
* a protocol-compliant form that a device
* can understand.
* @param {Object} options
* @param {String|Buffer|Object} options.data data to encode
* @param {String} options.commandByte command byte
* @returns {Buffer} binary payload
* @private
*/
MessageParser.prototype._encode = function (options) {
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

  const prefixLength = (payload.toString('hex').length + 16) / 2;
  const prefix = Buffer.from('000055aa00000000000000' +
                             options.commandByte +
                             '000000' +
                             prefixLength.toString(16), 'hex');
  const suffix = Buffer.from('0000aa55', 'hex');

  const crc32 = crc.crc32(Buffer.concat([prefix, payload]));
  const crc32Buffer = Buffer.from(crc32.toString(16), 'hex');

  // Add CRC32
  const concatBuffer = Buffer.concat([prefix, payload, crc32Buffer, suffix]);

  return concatBuffer;
};

/**
* Static wrapper for lower-level MessageParser
* functions to easily parse packets.
* @param {Buffer} data packet to parse
* @returns {Undefined|Object|String}
* An object or string, depending on whether
* data contains an object. Undefined if
* there is no data in packet.
*/
MessageParser.parse = function (data) {
  const p = new MessageParser();
  p._append(data);
  p._parse();
  return p._decode();
};

/**
* Static wrapper for lower-level MessageParser
* functions to easily encode packets
* @param {Object} options
* @param {String|Buffer|Object} options.data data to encode
* @param {String} options.commandByte command byte
* @returns {Buffer} binary payload
*/
MessageParser.encode = function (options) {
  const p = new MessageParser();
  return p._encode({data: options.data, commandByte: options.commandByte});
};

module.exports = {parse: MessageParser.parse, encode: MessageParser.encode};
