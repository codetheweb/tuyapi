const debug = require('debug')('TuyAPI');

const crc = require('crc');

function MessageParser() {
  this._parsed = false;
  this._buff = new Buffer(0);
  this._havePrefix = undefined;
  this._payloadSize = undefined;
  this._data = undefined;
  this._leftOver = undefined;
}

MessageParser.prototype.append = function append(buff) {
  this._buff = Buffer.concat([this._buff, buff]);
}

MessageParser.prototype.parse = function parse() {
  if (this._parsed)
    return true;

  if (this._buff.length < 16) {
    debug('packet too small', this._buff.length);
    return false;
  }

  if (!this._havePrefix) {
    let prefix = this._buff.readUInt32BE(0)

    if (prefix !== 0x000055aa) {
      // should we throw here?
      throw new Error("Magic prefix mismatch: " + this._buff.slice(0, 4).toString('hex'));
    }

    this._havePrefix = true;
  }

  // the next word is generally null?
  // the 3rd word is the message type?

  if (!this._payloadSize) {
    // the 4th word has the payload size
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

  let suffix = this._buff.readUInt32BE(this._buff.length - 4);

  if (suffix !== 0x0000aa55) {
    // should we throw here?
    throw new Error("Magic suffix mismatch: " + this._buff.slice(buff.length - 4).toString('hex'));
  }

  let data = this._buff.slice(0, this._buff.length - 8)

  //let expected = this._buff.slice(this._buff.length - 8, this._buff.length - 4);
  let expected = this._buff.readUInt32BE(this._buff.length - 8);

  //let actual = new Buffer(4);
  //actual.writeUInt32BE(crc.crc32(data));
  let actual = crc.crc32(data)

  if (expected !== actual) {
    throw new Error("Invalid CRC32 expected: " + expected + " got " + actual);
  }

  this._data = data.slice(20);

  return true;
}

MessageParser.prototype.decode = function decode() {
  return JSON.parse(this._data);
}

MessageParser.prototype.leftOver = function leftOver() {
  return this._leftOver;
}

module.exports = MessageParser;
