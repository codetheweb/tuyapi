const crypto = require('crypto');

const UDP_KEY_STRING = 'yGAdlopoPVldABfn';

const UDP_KEY = crypto.createHash('md5').update(UDP_KEY_STRING, 'utf8').digest();

module.exports = {UDP_KEY};
