const debug = require('debug')('TuyAPI:MessageParser');

/**
* Class for decoding and encoding payloads.
* @class
*/
function MessageParser() {
  this._parsed = false;
  this._buff = Buffer.alloc(0);
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

  // Check for length
  if (this._buff.length < 16) {
    debug('Packet too small. Length:', this._buff.length);
    return false;
  }

  // Check for prefix
  const prefix = this._buff.readUInt32BE(0);

  if (prefix !== 0x000055AA) {
    throw new Error('Magic prefix mismatch: ' + this._buff.toString('hex'));
  }

  // Check for suffix
  const suffix = this._buff.readUInt32BE(this._buff.length - 4);

  if (suffix !== 0x0000AA55) {
    throw new Error('Magic suffix mismatch: ' + this._buff.toString('hex'));
  }

  // Get payload size
  if (!this._payloadSize) {
    this._payloadSize = this._buff.readUInt32BE(12);
  }

  // Check for payload
  if (this._buff.length - 8 < this._payloadSize) {
    debug('Packet missing payload.', this._buff.length, this._payloadSize);
    this._data = '';
    return false;
  }

  // Slice off CRC and suffix
  this._data = this._buff.slice(0, this._buff.length - 8);

  // Slice off begining of packet, remainder is payload
  this._data = this._data.slice(this._data.length - this._payloadSize + 8);

  // Remove 0 padding from payload
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
  // It's possible for packets to be valid
  // and yet contain no data.
  if (this._data.length === 0) {
    return undefined;
  }

  // Try to parse data as JSON.
  // If error, return as string.
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

  // Generate prefix (including command and length bytes)
  const prefix = Buffer.from('000055aa00000000000000' +
                             options.commandByte, 'hex');

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
