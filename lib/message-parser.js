const Cipher = require('./cipher');
const crc = require('./crc');

const HEADER_SIZE = 16;

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

    // Get payload size
    const payloadSize = buffer.readUInt32BE(12);

    // Get command byte
    const commandByte = buffer.readUInt8(11);

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

    // Slice off CRC and suffix
    // let data = buffer.slice(0, buffer.length - 8);

    // Check CRC
    const expectedCrc = buffer.readInt32BE(HEADER_SIZE + payloadSize - 8);
    const computedCrc = crc(buffer.slice(0, payloadSize + 8));

    if (expectedCrc !== computedCrc) {
      throw new Error('CRC mismatch: ' + buffer.toString('hex'));
    }

    // Slice off begining of packet, remainder is payload
    // data = data.slice(data.length - payloadSize + 8);

    // Remove 0 padding from payload
    // let done = false;
    // while (done === false) {
    //   if (payload[0] === 0) {
    //     data = data.slice(1);
    //   } else {
    //     done = true;
    //   }
    // }

    return {payload, leftover, commandByte, sequenceN};
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

    result.payload = this.getPayload(result.payload);

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

    // Ensure commandByte is a Number
    if (typeof options.commandByte === 'string') {
      options.commandByte = parseInt(options.commandByte, 16);
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
    buffer.writeInt32BE(crc(buffer.slice(0, payload.length + 16)), payload.length + 16);
    buffer.writeUInt32BE(0x0000AA55, payload.length + 20);

    return buffer;
  }

  writeSequenceN(buffer, n) {
    // Add sequence number to buffer
    buffer.writeUInt32BE(n, 4);

    return buffer;
  }
}

module.exports = MessageParser;
