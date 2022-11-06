const crypto = require('crypto');
/**
* Low-level class for encrypting and decrypting payloads.
* @class
* @param {Object} options
* @param {String} options.key localKey of cipher
* @param {Number} options.version protocol version
* @example
* const cipher = new TuyaCipher({key: 'xxxxxxxxxxxxxxxx', version: 3.1})
*/
class TuyaCipher {
  constructor(options) {
    this.sessionKey = null;
    this.key = options.key;
    this.version = options.version.toString();
  }

  setSessionKey(sessionKey) {
    this.sessionKey = sessionKey;
  }

  encrypt34(options) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.getKey(), null);
    cipher.setAutoPadding(false);
    let encrypted = cipher.update(options.data);
    cipher.final();

    // Default base64 enable
    //if (options.base64 === false) {
    //  return Buffer.from(encrypted, 'base64');
    //}

    return encrypted;
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
    if (this.version === '3.4') {
      return this.encrypt34(options);
    }

    const cipher = crypto.createCipheriv('aes-128-ecb', this.getKey(), '');

    let encrypted = cipher.update(options.data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Default base64 enable
    if (options.base64 === false) {
      return Buffer.from(encrypted, 'base64');
    }

    return encrypted;
  }

  decrypt34(data) {
    let result;
    try {
      const decipher = crypto.createDecipheriv('aes-128-ecb', this.getKey(), null);
      decipher.setAutoPadding(false);
      result = decipher.update(data);
      decipher.final();
      //remove padding
      result = result.slice(0, (result.length - result[result.length-1]) );
    } catch(_) {
      throw new Error('Decrypt failed');
    }

    // Try to parse data as JSON,
    // otherwise return as string.
    // 3.4 protocol
    // {"protocol":4,"t":1632405905,"data":{"dps":{"101":true},"cid":"00123456789abcde"}}
    try {
      if (result.indexOf(this.version) === 0) {
        result = result.slice(15);
      }
      let res = JSON.parse(result);
      if ('data' in res) {
        let resdata = res.data;
        resdata.t = res.t;
        return resdata; //res.data //for compatibility with tuya-mqtt
      }
      return res;
    } catch (_) {
      return result;
    }
  }

  /**
  * Decrypts data.
  * @param {String|Buffer} data to decrypt
  * @returns {Object|String}
  * returns object if data is JSON, else returns string
  */
  decrypt(data) {
    if (this.version === '3.4') {
      return this.decrypt34(data);
    }

    // Incoming data format
    let format = 'buffer';

    if (data.indexOf(this.version) === 0) {
      if (this.version === '3.3') {
        // Remove 3.3 header
        data = data.slice(15);
      } else {
        // Data has version number and is encoded in base64

        // Remove prefix of version number and MD5 hash
        data = data.slice(19).toString();
        // Decode incoming data as base64
        format = 'base64';
      }
    }

    // Decrypt data
    let result;
    try {
      const decipher = crypto.createDecipheriv('aes-128-ecb', this.getKey(), '');
      result = decipher.update(data, format, 'utf8');
      result += decipher.final('utf8');
    } catch (_) {
      throw new Error('Decrypt failed');
    }

    // Try to parse data as JSON,
    // otherwise return as string.
    try {
      return JSON.parse(result);
    } catch (_) {
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
    return md5hash.slice(8, 24);
  }

  getKey() {
    return this.sessionKey !== null ? this.sessionKey : this.key;
  }

  hmac(data) {
    return crypto.createHmac('sha256',this.getKey()).update(data, 'utf8').digest();//.digest('hex');
  }

  random() {
    return crypto.randomBytes(16);
  }
}
module.exports = TuyaCipher;
