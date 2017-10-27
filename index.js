'use strict';

// Import packages
const forge = require('node-forge');
const retryConnect = require('net-retry-connect');
const strEncode = require('str-encode');

// Import requests for devices
const requests = require('./requests.json');

// Constructor
function TuyaDevice(params) {
  // init properties
  this.type =    params.type || 'outlet';
  this.ip =      params.ip;
  this.port =    params.port || 6668;
  this.id =      params.id;
  this.uid =     params.uid;
  this.key =     params.key;
  this.version = params.version || 3.1;

  // create cipher object
  this.cipher = forge.cipher.createCipher('AES-ECB', this.key);
}

TuyaDevice.prototype.getStatus = function(callback) {
  // add data to command
  if ('gwId'  in requests[this.type].status.command) { requests[this.type].status.command.gwId  = this.id; }
  if ('devId' in requests[this.type].status.command) { requests[this.type].status.command.devId = this.id; }

  // create byte buffer from hex data
  var buffer = Buffer.from(requests[this.type].status.prefix + strEncode(JSON.stringify(requests[this.type].status.command), 'hex') + requests[this.type].status.suffix, 'hex');

  this._send(buffer, function(error, result) {
    if (error) { return callback(error, null); }

    // Extract returned JSON
    result = result.toString();
    result = result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1);
    result = JSON.parse(result);
    return callback(null, result['dps']['1']);
  });
}

TuyaDevice.prototype.setStatus = function(on, callback) {
  var thisRequest = requests[this.type][!on ? 'off' : 'on'];

  // add data to command
  var now = new Date;
  if ('gwId' in thisRequest.command) {
    thisRequest.command.gwId = this.id; }
  if ('devId' in thisRequest.command) {
    thisRequest.command.devId = this.id; }
  if ('uid' in thisRequest.command) {
    thisRequest.command.uid = this.uid; }
  if ('t' in thisRequest.command) {
    thisRequest.command.t = (parseInt(now.getTime() / 1000)).toString(); }

  // encrypt data
  this.cipher.start({iv: ''});
  this.cipher.update(forge.util.createBuffer(JSON.stringify(thisRequest.command), 'utf8'));
  this.cipher.finish();

  // encode binary data to Base64
  var data = forge.util.encode64(this.cipher.output.data);

  var preMd5String = "data="+data+"||lpv="+this.version+"||"+this.key;
  var md5hash = forge.md.md5.create().update(preMd5String).digest().toHex();
  var md5 = md5hash.toString().toLowerCase().substr(8, 16);

  // create byte buffer from hex data
  var buffer = Buffer.from(thisRequest.prefix + strEncode(this.version + md5 + data, 'hex') + thisRequest.suffix, 'hex');

  // send request to change status
  var that = this;
  this._send(buffer, function(error, result) {
    if (error) { return callback(error, null); }
    // setting the status returns a specific value if successful
    else if (strEncode(result, 'hex') != requests[that.type][!on ? 'off' : 'on'].returns) {
      return callback(new Error('returned value does not match expected value'), null);
    }
    else { return callback(null, true); }
  });
}

TuyaDevice.prototype._send = function(buffer, callback) {
  // the local services of devices seem to be a bit flakey, so we'll retry the connection a couple times
  retryConnect.to({port: 6668, host: this.ip}, function (error, client) {
    if (error) { return callback(error, null); }

    client.write(buffer);

    client.on('data', function(data) {
      client.destroy();
      return callback(null, data);
    }).on('error', function (error) {
      return callback(error, null);
    });
  });
}

module.exports = TuyaDevice;
