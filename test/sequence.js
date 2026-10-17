import test from 'ava';

const TuyAPI = require('..');

// A Tuya device advances its own sequence number for every packet it sends,
// including unsolicited ones (e.g. the STATUS/DP_REFRESH push emitted right
// after a SET). TuyAPI must re-sync its outgoing counter from received packets:
// otherwise the next request reuses a sequence number the device has already
// consumed, the device answers with a different number, and the resolver we
// registered is never called — so the pending get()/set() hangs until the socket
// is recycled.

function makeDevice() {
  const device = new TuyAPI({id: '22325186db4a2217dc8e',
                             key: '4226aa407d5c1e2b',
                             ip: '127.0.0.1',
                             version: '3.4'});
  // Pretend a session is already established and swallow socket writes.
  device._connected = true;
  device.client = {write() {}};
  return device;
}

test('re-syncs the sequence counter from an unsolicited device packet', t => {
  const device = makeDevice();
  device._currentSequenceN = 98;

  // The device pushes a STATUS packet using sequence 100; our counter is behind.
  device._packetHandler({commandByte: 8, sequenceN: 100, payload: {dps: {3: 15}}});

  t.is(device._currentSequenceN, 100);
});

test('does not rewind the sequence counter on an older packet', t => {
  const device = makeDevice();
  device._currentSequenceN = 100;

  device._packetHandler({commandByte: 8, sequenceN: 90, payload: {dps: {3: 15}}});

  t.is(device._currentSequenceN, 100);
});

test('a pending request still resolves after an unsolicited push', t => {
  const device = makeDevice();
  let deviceSequenceN = 200; // the last sequence number the device has used

  // The device pushes an unsolicited packet, advancing its own counter.
  deviceSequenceN++;
  device._packetHandler({commandByte: 8, sequenceN: deviceSequenceN, payload: {dps: {3: 15}}});

  // Issue a read the way get()/_send() do: claim the next sequence number and
  // register a resolver for it.
  const requestSequenceN = ++device._currentSequenceN;
  let received;
  device._resolvers[requestSequenceN] = payload => {
    received = payload;
  };

  // The device answers on the sequence number that follows the one it last used.
  deviceSequenceN++;
  device._packetHandler({commandByte: 16, sequenceN: deviceSequenceN, payload: {dps: {1: true}}});

  t.is(received.dps['1'], true);
});
