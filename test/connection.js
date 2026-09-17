import net from 'net';
import crypto from 'crypto';
import test from 'ava';
import delay from 'delay';

const TuyAPI = require('..');
const key = '0123456789abcdef';

// A minimal wire-protocol peer: complete the real session-key exchange without
// relying on TuyAPI's connection state or calling its private packet handlers.
function handshakeResponse(request, version, valid = true) {
  let localNonce;
  if (version === '3.4') {
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
    localNonce = Buffer.concat([decipher.update(request.slice(16, -36)), decipher.final()]);
  } else {
    const decipher = crypto.createDecipheriv('aes-128-gcm', key, request.slice(18, 30));
    decipher.setAAD(request.slice(4, 18));
    decipher.setAuthTag(request.slice(-20, -4));
    localNonce = Buffer.concat([decipher.update(request.slice(30, -20)), decipher.final()]);
  }

  const hmac = crypto.createHmac('sha256', key).update(localNonce).digest();
  if (!valid) {
    hmac[0] ^= 0xFF;
  }

  const payload = Buffer.concat([Buffer.alloc(16, 0x42), hmac]);
  if (version === '3.4') {
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
    const header = Buffer.alloc(20);
    header.writeUInt32BE(0x55AA, 0);
    header.writeUInt32BE(1, 4);
    header.writeUInt32BE(4, 8);
    header.writeUInt32BE(encrypted.length + 40, 12);
    const body = Buffer.concat([header, encrypted]);
    return Buffer.concat([body, crypto.createHmac('sha256', key).update(body).digest(), Buffer.from('0000aa55', 'hex')]);
  }

  const header = Buffer.alloc(18);
  header.writeUInt32BE(0x6699, 0);
  header.writeUInt32BE(1, 6);
  header.writeUInt32BE(4, 10);
  header.writeUInt32BE(payload.length + 32, 14);
  const iv = Buffer.alloc(12, 0x24);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
  cipher.setAAD(header.slice(4));
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([Buffer.alloc(4), payload])), cipher.final()]);
  return Buffer.concat([header, iv, encrypted, cipher.getAuthTag(), Buffer.from('00009966', 'hex')]);
}

async function setup(t, version, firstConnection) {
  const sockets = new Set();
  let attempts = 0;
  let received;
  const firstRequest = new Promise(resolve => {
    received = resolve;
  });
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    const attempt = ++attempts;
    socket.once('data', request => {
      if (attempt === 1) {
        received();
        firstConnection(socket, request);
      } else {
        socket.write(handshakeResponse(request, version));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const device = new TuyAPI({id: 'test-device', key, ip: '127.0.0.1', port: server.address().port, version, issueGetOnConnect: false});
  const errors = [];
  device.on('error', error => errors.push(error));
  t.context = {device, server, sockets};
  return {device, errors, firstRequest, attempts: () => attempts};
}

// Bound failures even against the unpatched implementation, whose connect()
// never settles in the cases covered below.
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Test deadline: connect() is still pending')), 1500);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

test.afterEach.always(async t => {
  const {device, server, sockets} = t.context;
  device.disconnect();
  if (device.client) {
    device.client.destroy();
  }

  for (const socket of sockets) {
    socket.destroy();
  }

  await new Promise(resolve => server.close(resolve));
});

for (const version of ['3.4', '3.5']) {
  test.serial(`${version}: close during handshake rejects and permits reconnection`, async t => {
    const {device, attempts} = await setup(t, version, socket => socket.end());
    const connecting = device.connect();
    t.is(device.connect(), connecting);
    await t.throwsAsync(bounded(connecting), {message: 'Connection closed before it was established'});
    t.false(device.isConnected());
    t.true(device.client.destroyed);
    t.is(device.connectPromise, undefined);
    t.true(await bounded(device.connect()));
    t.true(device.isConnected());
    t.is(attempts(), 2);
  });

  test.serial(`${version}: silent handshake times out and a successful retry stays connected`, async t => {
    const {device, errors} = await setup(t, version, () => {});
    device._connectTimeout = 0.15;
    await t.throwsAsync(bounded(device.connect()), {message: 'connection timed out'});
    t.true(device.client.destroyed);
    t.is(errors.length, 1);
    t.true(await bounded(device.connect()));
    await delay(250);
    t.true(device.isConnected());
    t.is(errors.length, 1);
  });

  test.serial(`${version}: incoming traffic cannot postpone the handshake deadline`, async t => {
    const {device, errors} = await setup(t, version, socket => {
      const timer = setInterval(() => socket.write(Buffer.alloc(1)), 20);
      socket.once('close', () => clearInterval(timer));
    });
    device._connectTimeout = 0.15;
    await t.throwsAsync(bounded(device.connect()), {message: 'connection timed out'});
    t.true(errors.length > 1);
    t.is(errors[errors.length - 1].message, 'connection timed out');
    t.true(await bounded(device.connect()));
    t.true(device.isConnected());
  });

  test.serial(`${version}: cancelling a handshake permits an immediate retry`, async t => {
    const {device, firstRequest} = await setup(t, version, () => {});
    const rejection = t.throwsAsync(bounded(device.connect()), {message: 'Connection closed before it was established'});
    await firstRequest;
    device.disconnect();
    const retry = device.connect();
    await rejection;
    t.true(await bounded(retry));
    await delay(20);
    t.true(device.isConnected());
  });

  test.serial(`${version}: socket errors reject and release the pending attempt`, async t => {
    const {device, errors, firstRequest} = await setup(t, version, () => {});
    const error = new Error('Socket failed during handshake');
    const rejection = t.throwsAsync(bounded(device.connect()));
    await firstRequest;
    device.client.destroy(error);
    t.is(await rejection, error);
    t.is(errors.length, 1);
    t.true(await bounded(device.connect()));
    t.true(device.isConnected());
  });

  test.serial(`${version}: authentication failure releases the socket before retrying`, async t => {
    const {device, errors} = await setup(t, version, (socket, request) => socket.write(handshakeResponse(request, version, false)));
    await t.throwsAsync(bounded(device.connect()), {message: /HMAC mismatch/});
    t.true(device.client.destroyed);
    t.is(errors.length, 1);
    t.true(await bounded(device.connect()));
    t.true(device.isConnected());
  });

  test.serial(`${version}: an error listener can retry before the old socket closes`, async t => {
    const {device} = await setup(t, version, () => {});
    device._connectTimeout = 0.15;
    let retry;
    device.once('error', () => {
      retry = device.connect();
    });
    await t.throwsAsync(bounded(device.connect()), {message: 'connection timed out'});
    t.truthy(retry);
    t.true(await bounded(retry));
    await delay(250);
    t.true(device.isConnected());
  });

  test.serial(`${version}: a disconnected listener can immediately establish a new session`, async t => {
    const {device, attempts} = await setup(t, version, (socket, request) => socket.write(handshakeResponse(request, version)));
    t.true(await bounded(device.connect()));
    let retry;
    device.once('disconnected', () => {
      retry = device.connect();
    });
    device.disconnect();
    t.true(await bounded(retry));
    await delay(20);
    t.true(device.isConnected());
    t.is(attempts(), 2);
  });

  test.serial(`${version}: handshake preparation errors reject immediately`, async t => {
    const {device, errors} = await setup(t, version, () => {});
    const error = new Error('Cannot prepare handshake');
    device.device.parser.cipher.random = () => {
      throw error;
    };

    t.is(await t.throwsAsync(bounded(device.connect())), error);
    t.true(device.client.destroyed);
    t.deepEqual(errors, [error]);
  });
}

test.serial('invalid socket options reject without retaining a pending attempt', async t => {
  const {device} = await setup(t, '3.5', () => {});
  device.device.port = -1;
  await t.throwsAsync(device.connect(), {instanceOf: RangeError});
  t.is(device.connectPromise, undefined);
  t.true(device.client.destroyed);
  t.is(device._connectTimeoutTimer, null);
});
