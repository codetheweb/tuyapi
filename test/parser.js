import test from 'ava';

const {MessageParser, CommandType} = require('../lib/message-parser');

test('encode and decode message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({
    data: payload,
    commandByte: CommandType.DP_QUERY,
    sequenceN: 2
  });

  const parsed = parser.parse(encoded)[0];

  t.deepEqual(parsed.payload, payload);
  t.deepEqual(parsed.commandByte, CommandType.DP_QUERY);
  t.is(parsed.sequenceN, 2);
});

test('encode and decode get message with protocol 3.3', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser({key: 'bbe88b3f4106d354', version: '3.3'});
  const encoded = parser.encode({
    data: payload,
    commandByte: CommandType.DP_QUERY,
    sequenceN: 2
  });

  const parsed = parser.parse(encoded)[0];

  t.deepEqual(parsed.payload, payload);
  t.deepEqual(parsed.commandByte, CommandType.DP_QUERY);
  t.is(parsed.sequenceN, 2);
});

test('encode and decode set message with protocol 3.3', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser({key: 'bbe88b3f4106d354', version: '3.3'});
  const encoded = parser.encode({data: payload, commandByte: CommandType.CONTROL});

  const parsed = parser.parse(encoded)[0];

  t.deepEqual(parsed.payload, payload);
  t.deepEqual(parsed.commandByte, CommandType.CONTROL);
});

test('constructor throws with incorrect key length', t => {
  t.throws(() => {
    // eslint-disable-next-line no-new
    new MessageParser({key: 'bbe88b3f4106d35'});
  });
});

test('decode empty message', t => {
  const payload = '';

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});

  const parsed = parser.parse(encoded)[0];
  t.falsy(parsed.payload);
});

test('decode message where payload is not a JSON object', t => {
  const payload = 'gw id invalid';

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});

  const parsed = parser.parse(encoded)[0];

  t.deepEqual(payload, parsed.payload);
});

test('decode message where payload is not a JSON object 2', t => {
  const payload = 'gw id invalid';

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});

  const parsed = parser.parse(encoded)[0];
  t.deepEqual(payload, parsed.payload);
});

test('decode corrupt (shortened) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});

  t.throws(() => {
    parser.parse(encoded.slice(0, -10));
  });
});

test('decode corrupt (shorter than possible) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});

  t.throws(() => {
    parser.parse(encoded.slice(0, 23));
  });
});

test('decode corrupt (prefix mismatch) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});
  encoded.writeUInt32BE(0xDEADBEEF, 0);

  t.throws(() => {
    parser.parse(encoded);
  });
});

test('decode corrupt (suffix mismatch) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});
  encoded.writeUInt32BE(0xDEADBEEF, encoded.length - 4);

  t.throws(() => {
    parser.parse(encoded);
  });
});

test('decode corrupt (crc mismatch) message', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});
  encoded.writeUInt32BE(0xDEADBEEF, encoded.length - 8);

  t.throws(() => {
    parser.parse(encoded);
  });
});

test('decode message with two packets', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});

  const parsed = parser.parse(Buffer.concat([encoded, encoded]))[0];

  t.deepEqual(parsed.payload, payload);
  t.is(parsed.commandByte, 10);
});

test('throw when called with invalid command byte', t => {
  const parser = new MessageParser();

  t.throws(() => {
    parser.encode({data: {}, commandByte: 1000});
  });
});

test('decode corrupt (shorter than possible) message 2', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});

  t.throws(() => {
    parser.parse(encoded.slice(0, 23));
  });
});

test('decode corrupt (prefix mismatch) message 2', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});
  encoded.writeUInt32BE(0xDEADBEEF, 0);

  t.throws(() => {
    parser.parse(encoded);
  });
});

test('decode corrupt (suffix mismatch) message 2', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});
  encoded.writeUInt32BE(0xDEADBEEF, encoded.length - 4);

  t.throws(() => {
    parser.parse(encoded);
  });
});

test('decode message with two packets 2', t => {
  const payload = {devId: '002004265ccf7fb1b659', dps: {1: true, 2: 0}};

  const parser = new MessageParser();
  const encoded = parser.encode({data: payload, commandByte: CommandType.DP_QUERY});

  const parsed = parser.parse(Buffer.concat([encoded, encoded]))[0];
  t.deepEqual(parsed.payload, payload);
  t.is(parsed.commandByte, 10);
});
