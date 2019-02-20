import test from 'ava';

const Parser = require('../lib/message-parser');

test('encode and decode message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const encoded = Parser.encode({data: payload, commandByte: '0a'});

  const parsed = Parser.parse(encoded);
  t.deepEqual(parsed.data, payload);
  t.deepEqual(parsed.commandByte, 10);
});
