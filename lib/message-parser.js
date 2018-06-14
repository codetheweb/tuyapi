const debug = require('debug')('TuyAPI');

const crc = require('crc');

function MessageParser() {
  this._parsed = false;
  this._buff = Buffer.alloc(0);
  this._havePrefix = undefined;
  this._payloadSize = undefined;
  this._data = undefined;
  this._leftOver = undefined;
}

MessageParser.prototype.append = function append(buff) {
  this._buff = Buffer.concat([this._buff, buff]);
};

MessageParser.prototype.parse = function parse() {
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

  if (this._buff.length - 16 < this._payloadSize) {
    debug('packet missing payload', this._buff.length, this._payloadSize);
    return false;
  }

  if (this._buff.length - 16 > this._payloadSize) {
    debug('buffer contains more than one message', this._buff.length, this._payloadSize);
    this._leftOver = this._buff.slice(this._payloadSize);
    this._buff = this._buff.slice(0, this._payloadSize);
  }

  const suffix = this._buff.readUInt32BE(this._buff.length - 4);

  if (suffix !== 0x0000AA55) {
    // Should we throw here?
    throw new Error('Magic suffix mismatch: ' + this._buff.slice(buff.length - 4).toString('hex'));
  }

  const data = this._buff.slice(0, this._buff.length - 8);

  // Let expected = this._buff.slice(this._buff.length - 8, this._buff.length - 4);
  const expected = this._buff.readUInt32BE(this._buff.length - 8);

  // Let actual = new Buffer(4);
  // actual.writeUInt32BE(crc.crc32(data));
  const actual = crc.crc32(data);

  if (expected !== actual) {
    throw new Error('Invalid CRC32 expected: ' + expected + ' got ' + actual);
  }

  this._data = data.slice(20);

  return true;
};

MessageParser.prototype.decode = function decode() {
  debug(this._data.length, this._data.toString('hex'));

  if (!this._data.length) {
    return undefined;
  }
  return JSON.parse(this._data);
};

MessageParser.prototype.leftOver = function leftOver() {
  return this._leftOver;
};

// options.data
// options.commandByte
MessageParser.prototype.encode = function (options) {
  // Ensure data is a Buffer
  let payload;
  if (options.data instanceof Buffer) {
    payload = options.data;
  }
  else {
    options.data = typeof options.data === 'string' ? options.data : JSON.stringify(options.data);
    payload = Buffer.from(options.data);
  }

  const prefixLength = (payload.toString('hex').length + 16) / 2;
  const prefix = Buffer.from('000055aa00000000000000' + options.commandByte + '000000' + prefixLength.toString(16), 'hex');
  const suffix = Buffer.from('000000000000aa55', 'hex');

  // Concat final buffer: prefix + data + suffix
  return Buffer.concat([prefix, payload, suffix]);
};

module.exports = MessageParser;
