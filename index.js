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
    if (error) {callback(error, null); }
    callback(null, result['dps']['1']);
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
    thisRequest.command.t = '1508364931'; }// (parseInt(now.getTime() / 1000)).toString(); }

  // encrypt data
  this.cipher.start({iv: ''});
  this.cipher.update(forge.util.createBuffer(JSON.stringify(thisRequest.command), 'utf8'));
  this.cipher.finish();

  // encode binary data to Base64
  var data = forge.util.encode64(this.cipher.output.data);

  // create byte buffer from hex data
  var md5 = '749d6a6644fe1f88'; // ISSUE: can't figure out what MD5 hash is computed from
  var buffer = Buffer.from(thisRequest.prefix + strEncode(this.version + md5 + data, 'hex') + thisRequest.suffix, 'hex');
  console.log(buffer.toString());
  this._send(buffer, function(error, result) {
    console.log(error);
    console.log(result);
  });
}

TuyaDevice.prototype._send = function(buffer, callback) {
  // the local services of devices seem to be a bit flakey, so we'll retry the connection a couple times
  retryConnect.to({port: 6668, host: this.ip}, function (error, client) {
    if (error) { callback(error, null); }

    client.write(buffer);
    client.on('data', function(data) {
      console.log('Returned data: ' + data.toString());
      client.destroy();
      data = data.toString();
      data = data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1);
      data = JSON.parse(data);

      callback(null, data);
    }).on('error', function (error) {
      callback(error, null);
    });
  });
}

module.exports = TuyaDevice;
