const forge = require('node-forge');

/**
* Class for encrypting and decrypting payloads.
* @class
* @param {Object} options
* @param {String} options.key localKey of cipher
* @param {Number} options.version protocol version
* @example
* const cipher = new TuyaCipher({key: 'xxxxxxxxxxxxxxxx', version: 3.1})
*/
function TuyaCipher(options) {
  this.cipher = forge.cipher.createCipher('AES-ECB', options.key);
  this.decipher = forge.cipher.createDecipher('AES-ECB', options.key);
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
TuyaCipher.prototype.encrypt = function (options) {
  this.cipher.start({iv: ''});
  this.cipher.update(forge.util.createBuffer(options.data, 'utf8'));
  this.cipher.finish();

  if (options.base64 !== false) {
    return forge.util.encode64(this.cipher.output.data);
  }

  return this.cipher.output;
};

/**
* Decrypts data.
* @param {String} data to decrypt
* @returns {Object|String}
* returns object if data is JSON, else returns string
*/
TuyaCipher.prototype.decrypt = function (data) {
  if (data.indexOf(this.version.toString()) !== -1) {
    // Data has version number and is encoded in base64

    // Remove prefix of version number and MD5 hash
    data = data.slice(19);

    // Decode data
    data = forge.util.decode64(data);
  }

  // Turn data into Buffer
  data = forge.util.createBuffer(data);

  this.decipher.start({iv: ''});
  this.decipher.update(data);
  this.decipher.finish();

  const result = this.decipher.output.data;

  // Try to parse data as JSON,
  // otherwise return as string.
  try {
    return JSON.parse(result);
  } catch (err) {
    return result;
  }
};

/**
* Calculates a MD5 hash.
* @param {String} data to hash
* @returns {String} last 8 characters of hash of data
*/
TuyaCipher.prototype.md5 = function (data) {
  const md5hash = forge.md.md5.create().update(data).digest().toHex();
  return md5hash.toString().toLowerCase().substr(8, 16);
};

module.exports = TuyaCipher;
