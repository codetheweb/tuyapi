import test from 'ava';

const Parser = require('../lib/message-parser');

test('encode and decode message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const encoded = Parser.encode({data: payload, commandByte: '0a'});

  const parsed = Parser.parse(encoded);
  t.deepEqual(parsed.data, payload);
  t.deepEqual(parsed.commandByte, 10);
});

test('decode empty message', t => {
  const payload = '';

  const encoded = Parser.encode({data: payload, commandByte: '0a'});

  const parsed = Parser.parse(encoded);
  t.falsy(parsed.data);
});

test('decode message where payload is not a JSON object', t => {
  const payload = 'gw id invalid';

  const encoded = Parser.encode({data: payload, commandByte: '0a'});

  const parsed = Parser.parse(encoded);

  t.deepEqual(payload, parsed.data);
});

test('decode corrupt (shortened) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const encoded = Parser.encode({data: payload, commandByte: '0a'});

  t.throws(() => {
    Parser.parse(encoded.slice(0, -10));
  });
});

test('decode corrupt (shorter than possible) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const encoded = Parser.encode({data: payload, commandByte: '0a'});

  t.throws(() => {
    Parser.parse(encoded.slice(0, 23));
  });
});

test('decode corrupt (prefix mismatch) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const encoded = Parser.encode({data: payload, commandByte: '0a'});
  encoded.writeUInt32BE(0xDEADBEEF, 0);

  t.throws(() => {
    Parser.parse(encoded);
  });
});

test('decode corrupt (suffix mismatch) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const encoded = Parser.encode({data: payload, commandByte: '0a'});
  encoded.writeUInt32BE(0xDEADBEEF, encoded.length - 4);

  t.throws(() => {
    Parser.parse(encoded);
  });
});

test('decode message with two packets', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const encoded = Parser.encode({data: payload, commandByte: '0a'});

  const parsed = Parser.parse(Buffer.concat([encoded, encoded]));
  t.deepEqual(parsed.data, payload);
  t.deepEqual(parsed.commandByte, 10);
});
