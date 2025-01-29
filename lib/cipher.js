const crypto = require('crypto');
/**
* Low-level class for encrypting and decrypting payloads.
* @class
* @param {Object} options - Options for the cipher.
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

  /**
   * Sets the session key used for Protocol 3.4, 3.5
   * @param {Buffer} sessionKey Session key
   */
  setSessionKey(sessionKey) {
    this.sessionKey = sessionKey;
  }

  /**
  * Encrypts data.
  * @param {Object} options Options for encryption
  * @param {String} options.data data to encrypt
  * @param {Boolean} [options.base64=true] `true` to return result in Base64
  * @example
  * TuyaCipher.encrypt({data: 'hello world'})
  * @returns {Buffer|String} returns Buffer unless options.base64 is true
  */
  encrypt(options) {
    if (this.version === '3.4') {
      return this._encrypt34(options);
    }

    if (this.version === '3.5') {
      return this._encrypt35(options);
    }

    return this._encryptPre34(options);
  }

  /**
   * Encrypt data for protocol 3.3 and before
   * @param {Object} options Options for encryption
   * @param {String} options.data data to encrypt
   * @param {Boolean} [options.base64=true] `true` to return result in Base64
   * @returns {Buffer|String} returns Buffer unless options.base64 is true
   */
  _encryptPre34(options) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.getKey(), '');

    let encrypted = cipher.update(options.data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Default base64 enable
    if (options.base64 === false) {
      return Buffer.from(encrypted, 'base64');
    }

    return encrypted;
  }

  /**
   * Encrypt data for protocol 3.4
   * @param {Object} options Options for encryption
   * @param {String} options.data data to encrypt
   * @param {Boolean} [options.base64=true] `true` to return result in Base64
   * @returns {Buffer|String} returns Buffer unless options.base64 is true
   */
  _encrypt34(options) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.getKey(), null);
    cipher.setAutoPadding(false);
    const encrypted = cipher.update(options.data);
    cipher.final();

    // Default base64 enable TODO: check if this is needed?
    // if (options.base64 === false) {
    //   return Buffer.from(encrypted, 'base64');
    // }

    return encrypted;
  }

  /**
   * Encrypt data for protocol 3.5
   * @param {Object} options Options for encryption
   * @param {String} options.data data to encrypt
   * @param {Boolean} [options.base64=true] `true` to return result in Base64
   * @returns {Buffer|String} returns Buffer unless options.base64 is true
   */
  _encrypt35(options) {
    let encrypted;
    let localIV = Buffer.from((Date.now() * 10).toString().slice(0, 12));
    if (options.iv !== undefined) {
      localIV = options.iv.slice(0, 12);
    }

    const cipher = crypto.createCipheriv('aes-128-gcm', this.getKey(), localIV);
    if (options.aad === undefined) {
      encrypted = Buffer.concat([cipher.update(options.data), cipher.final()]);
    } else {
      cipher.setAAD(options.aad);
      encrypted = Buffer.concat([localIV, cipher.update(options.data), cipher.final(), cipher.getAuthTag(), Buffer.from([0x00, 0x00, 0x99, 0x66])]);
    }

    return encrypted;
  }

  /**
   * Decrypts data.
   * @param {String|Buffer} data to decrypt
   * @param {String} [version] protocol version
   * @returns {Object|String}
   * returns object if data is JSON, else returns string
   */
  decrypt(data, version) {
    version = version || this.version;
    if (version === '3.4') {
      return this._decrypt34(data);
    }

    if (version === '3.5') {
      return this._decrypt35(data);
    }

    return this._decryptPre34(data);
  }

  /**
   * Decrypts data for protocol 3.3 and before
   * @param {String|Buffer} data to decrypt
   * @returns {Object|String}
   * returns object if data is JSON, else returns string
   */
  _decryptPre34(data) {
    // Incoming data format
    let format = 'buffer';

    if (data.indexOf(this.version) === 0) {
      if (this.version === '3.3' || this.version === '3.2') {
        // Remove 3.3/3.2 header
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
   * Decrypts data for protocol 3.4
   * @param {String|Buffer} data to decrypt
   * @returns {Object|String}
   * returns object if data is JSON, else returns string
   */
  _decrypt34(data) {
    let result;
    try {
      const decipher = crypto.createDecipheriv('aes-128-ecb', this.getKey(), null);
      decipher.setAutoPadding(false);
      result = decipher.update(data);
      decipher.final();
      // Remove padding
      result = result.slice(0, (result.length - result[result.length - 1]));
    } catch (_) {
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

      const res = JSON.parse(result);
      if ('data' in res) {
        const resData = res.data;
        resData.t = res.t;
        return resData; // Or res.data // for compatibility with tuya-mqtt
      }

      return res;
    } catch (_) {
      return result;
    }
  }

  /**
   * Decrypts data for protocol 3.5
   * @param {String|Buffer} data to decrypt
   * @returns {Object|String}
   * returns object if data is JSON, else returns string
   */
  _decrypt35(data) {
    let result;
    const header = data.slice(0, 14);
    const iv = data.slice(14, 26);
    const tag = data.slice(data.length - 16);
    data = data.slice(26, data.length - 16);

    try {
      const decipher = crypto.createDecipheriv('aes-128-gcm', this.getKey(), iv);
      decipher.setAuthTag(tag);
      decipher.setAAD(header);

      result = Buffer.concat([decipher.update(data), decipher.final()]);
      result = result.slice(4); // Remove 32bit return code
    } catch (_) {
      throw new Error('Decrypt failed');
    }

    // Try to parse data as JSON, otherwise return as string.
    // 3.5 protocol
    // {"protocol":4,"t":1632405905,"data":{"dps":{"101":true},"cid":"00123456789abcde"}}
    try {
      if (result.indexOf(this.version) === 0) {
        result = result.slice(15);
      }

      const res = JSON.parse(result);
      if ('data' in res) {
        const resData = res.data;
        resData.t = res.t;
        return resData; // Or res.data // for compatibility with tuya-mqtt
      }

      return res;
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

  /**
   * Gets the key used for encryption/decryption
   * @returns {String} sessionKey (if set for protocol 3.4, 3.5) or key
   */
  getKey() {
    return this.sessionKey === null ? this.key : this.sessionKey;
  }

  /**
   * Returns the HMAC for the current key (sessionKey if set for protocol 3.4, 3.5 or key)
   * @param {Buffer} data data to hash
   * @returns {Buffer} HMAC
   */
  hmac(data) {
    return crypto.createHmac('sha256', this.getKey()).update(data, 'utf8').digest(); // .digest('hex');
  }

  /**
   * Returns 16 random bytes
   * @returns {Buffer} Random bytes
   */
  random() {
    return crypto.randomBytes(16);
  }
}
module.exports = TuyaCipher;
