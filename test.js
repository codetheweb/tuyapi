import test from 'ava';

const Parser = require('./lib/message-parser');
const Cipher = require('./lib/cipher');

test('encode and decode message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const encoded = Parser.encode({data: payload, commandByte: '0a'});

  t.deepEqual(Parser.parse(encoded), payload);
});

test('decode encrypted message', t => {
  // eslint-disable-next-line max-len
  const message = '3.133ed3d4a21effe90zrA8OK3r3JMiUXpXDWauNppY4Am2c8rZ6sb4Yf15MjM8n5ByDx+QWeCZtcrPqddxLrhm906bSKbQAFtT1uCp+zP5AxlqJf5d0Pp2OxyXyjg=';
  const equals = {devId: '002004265ccf7fb1b659',
                  dps: {1: false, 2: 0},
                  t: 1529442366,
                  s: 8};
  const cipher = new Cipher({key: 'bbe88b3f4106d354', version: 3.1});

  const result = cipher.decrypt(message);

  t.deepEqual(result, equals);
});
