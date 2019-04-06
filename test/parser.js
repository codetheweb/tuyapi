import test from 'ava';

const MessageParser = require('../lib/message-parser');

test('encode and decode message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: '0a'});

  const parsed = parser.parse(encoded)[0];

  t.deepEqual(parsed.data, payload);
  t.deepEqual(parsed.commandByte, 10);
});

test('decode empty message', t => {
  const payload = '';

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: '0a'});

  const parsed = parser.parse(encoded)[0];
  t.falsy(parsed.data);
});

test('decode corrupt (shortened) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: '0a'});

  t.throws(() => {
    parser.parse(encoded.slice(0, -10));
  });
});
