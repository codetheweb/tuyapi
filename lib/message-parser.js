const Cipher = require('./cipher');

class MessageParser {
  constructor(options) {
    // Defaults
    options = options ? options : {};
    options.version = options.version ? options.version : '3.1';

    if (options.key && options.key.length !== 16) {
      throw new TypeError('Incorrect key format');
    }

    if (options.key && options.version) {
      this.cipher = new Cipher(options);
    }
  }

  parsePacket(buffer) {
    // Check length
    if (buffer.length < 16) {
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

    // Get payload size
    const payloadSize = buffer.readUInt32BE(12);

    // Get command byte
    const commandByte = buffer.readUInt8(11);

    // Check for payload
    if (buffer.length - 8 < payloadSize) {
      throw new TypeError(`Packet missing payload: payload has length ${payloadSize}.`);
    }

    // Slice off CRC and suffix
    let data = buffer.slice(0, buffer.length - 8);

    // Slice off begining of packet, remainder is payload
    data = data.slice(data.length - payloadSize + 8);

    // Remove 0 padding from payload
    let done = false;
    while (done === false) {
      if (data[0] === 0) {
        data = data.slice(1);
      } else {
        done = true;
      }
    }

    return {data, leftover, commandByte, sequenceN};
  }

  getPayload(data) {
    if (data.length === 0) {
      return false;
    }

    // Try to parse data as JSON.
    // If error, return as string.
    try {
      data = JSON.parse(data);
    } catch (error) { // Data is encrypted
      data = data.toString('ascii');

      try {
        if (!this.cipher) {
          throw new Error('Missing key or version in constructor.');
        }

        data = this.cipher.decrypt(data);
      } catch (donothing) {}
    }

    return data;
  }

  parseRecursive(buffer, packets) {
    const result = this.parsePacket(buffer);

    result.data = this.getPayload(result.data);

    packets.push(result);

    if (result.leftover) {
      return this.parseRecursive(result.leftover, packets);
    }

    return packets;
  }

  // Wrapper
  parse(buffer) {
    const packets = this.parseRecursive(buffer, []);

    return packets;
  }

  encode(options) {
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

    if (options.sequenceN) {
      concatBuffer.writeUInt32BE(options.sequenceN, 4);
    }

    return concatBuffer;
  }

  writeSequenceN(buffer, n) {
    // Add sequence number to buffer
    buffer.writeUInt32BE(n, 4);

    return buffer;
  }
}

module.exports = MessageParser;
