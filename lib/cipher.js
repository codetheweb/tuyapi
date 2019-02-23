const crypto = require('crypto');

/**
* Class for encrypting and decrypting payloads.
* @class
* @private
* @param {Object} options
* @param {String} options.key localKey of cipher
* @param {Number} options.version protocol version
* @example
* const cipher = new TuyaCipher({key: 'xxxxxxxxxxxxxxxx', version: 3.1})
*/
class TuyaCipher {
  constructor(options) {
    this.key = options.key;
    this.version = options.version;
  }

  /**
  * Encrypts data.
  * @param {Object} options
  * @param {String} options.data data to encrypt
  * @param {Boolean} [options.base64=true] `true` to return result in Base64
  * @example
  * TuyaCipher.encrypt({data: 'hello world'})
  * @returns {Buffer|String} returns Buffer unless options.base64 is true
  */
  encrypt(options) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, '');

    // Default base64 enable
    const format = options.base64 === false ? 'utf8' : 'base64';

    let encrypted = cipher.update(options.data, 'utf8', format);
    encrypted += cipher.final(format);

    return encrypted;
  }

  /**
  * Decrypts data.
  * @param {String} data to decrypt
  * @returns {Object|String}
  * returns object if data is JSON, else returns string
  */
  decrypt(data) {
    // Incoming data format
    let format = 'buffer';

    if (data.indexOf(this.version.toString()) !== -1) {
      // Data has version number and is encoded in base64

      // Remove prefix of version number and MD5 hash
      data = data.slice(19);

      // Decode incoming data as base64
      format = 'base64';
    }

    // Decrypt data
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, '');
    let result = decipher.update(data, format, 'utf8');
    result += decipher.final('utf8');

    // Try to parse data as JSON,
    // otherwise return as string.
    try {
      return JSON.parse(result);
    } catch (error) {
      return result;
    }
  }

  /**
  * Calculates a MD5 hash.
  * @param {String} data to hash
  * @returns {String} characters 8 through 16 of hash of data
  */
  md5(data) {
    const md5hash = crypto.createHash('md5').update(data, 'utf8').digest('hex');
    return md5hash.substr(8, 16);
  }
}
module.exports = TuyaCipher;
