import test from 'ava';

const Cipher = require('../lib/cipher');

test('decrypt message with header and base64 encoding', t => {
  const message = '3.133ed3d4a21effe90zrA8OK3r3JMiUXpXDWauNppY4Am2c8rZ6sb4Yf15MjM8n5ByDx+QWeCZtcrPqddxLrhm906bSKbQAFtT1uCp+zP5AxlqJf5d0Pp2OxyXyjg=';
  const equals = {devId: '002004265ccf7fb1b659',
                  dps: {1: false, 2: 0},
                  t: 1529442366,
                  s: 8};
  const cipher = new Cipher({key: 'bbe88b3f4106d354', version: 3.1});

  const result = cipher.decrypt(message);

  t.deepEqual(result, equals);
});

test('decrypt message without header and not base64 encoded', t => {
  const message = 'zrA8OK3r3JMiUXpXDWauNppY4Am2c8rZ6sb4Yf15MjM8n5ByDx+QWeCZtcrPqddxLrhm906bSKbQAFtT1uCp+zP5AxlqJf5d0Pp2OxyXyjg=';
  const decoded = Buffer.from(message, 'base64');
  const data = {devId: '002004265ccf7fb1b659',
                dps: {1: false, 2: 0},
                t: 1529442366,
                s: 8};
  const cipher = new Cipher({key: 'bbe88b3f4106d354', version: 3.1});

  const result = cipher.decrypt(decoded);

  t.deepEqual(result, data);
});

test('encrypt message as a buffer', t => {
  const message = 'zrA8OK3r3JMiUXpXDWauNppY4Am2c8rZ6sb4Yf15MjM8n5ByDx+QWeCZtcrPqddxLrhm906bSKbQAFtT1uCp+zP5AxlqJf5d0Pp2OxyXyjg=';
  const buffer = Buffer.from(message, 'base64');

  const data = {devId: '002004265ccf7fb1b659',
                dps: {1: false, 2: 0},
                t: 1529442366,
                s: 8};
  const cipher = new Cipher({key: 'bbe88b3f4106d354', version: 3.1});
  const result = cipher.encrypt({data: JSON.stringify(data), base64: false});

  t.deepEqual(buffer, result);
});

test('decrypt message where payload is not a JSON object', t => {
  const message = '3.133ed3d4a21effe90rt1hJFzMJPF3x9UhPTCiXw==';
  const equals = 'gw id invalid';
  const cipher = new Cipher({key: 'bbe88b3f4106d354', version: 3.1});

  const result = cipher.decrypt(message);

  t.deepEqual(result, equals);
});
