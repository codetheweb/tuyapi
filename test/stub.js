import test from 'ava';
import TuyaStub from '@tuyapi/stub';
import clone from 'clone';
import pRetry from 'p-retry';
import delay from 'delay';

const TuyAPI = require('..');

const stub = new TuyaStub({id: '22325186db4a2217dc8e',
                           key: '4226aa407d5c1e2b',
                           state: {1: false, 2: true}});

test.serial('get property of device', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b',
                                 ip: 'localhost'});
  const thisStub = clone(stub);
  thisStub.startServer();
  await stubDevice.connect();

  // Get status 3 different ways
  const status = await stubDevice.get();

  const schema = await stubDevice.get({schema: true});

  const specificDPS = await stubDevice.get({dps: '1'});

  // Shutdown stub server before continuing
  stubDevice.disconnect();
  thisStub.shutdown();

  // Check responses
  t.is(status, thisStub.getProperty('1'));

  t.is(schema.dps['1'], thisStub.getProperty('1'));

  t.is(specificDPS, thisStub.getProperty('1'));
});

test.serial('set property of device', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b',
                                 ip: 'localhost'});
  const thisStub = clone(stub);
  thisStub.startServer();
  await stubDevice.connect();

  await stubDevice.set({set: true});

  stubDevice.disconnect();
  thisStub.shutdown();

  t.is(true, thisStub.getProperty('1'));
});

test.serial('set multiple properties at once', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b',
                                 ip: 'localhost'});
  const thisStub = clone(stub);
  thisStub.startServer();
  await stubDevice.connect();

  await stubDevice.set({multiple: true, data: {1: true, 2: false}});

  stubDevice.disconnect();
  thisStub.shutdown();

  t.deepEqual({1: true, 2: false}, thisStub.getState());
});

test.serial('catch data event when property changes', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b',
                                 ip: 'localhost'});

  const thisStub = clone(stub);
  thisStub.startServer();

  await new Promise((resolve, reject) => {
    stubDevice.on('data', data => {
      t.is(data.dps['1'], thisStub.getProperty('1'));
      resolve();
    });

    stubDevice.on('connected', () => {
      thisStub.setProperty('1', true);
    });

    stubDevice.on('error', error => reject(error));

    stubDevice.connect();
  });

  stubDevice.disconnect();
  thisStub.shutdown();

  t.pass();
});

test.serial('toggle property of device', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b',
                                 ip: 'localhost'});
  const thisStub = clone(stub);
  thisStub.startServer();
  await stubDevice.connect();

  await stubDevice.toggle();

  stubDevice.disconnect();
  thisStub.shutdown();

  t.is(true, thisStub.getProperty('1'));
});

test.serial('heartbeat event is fired', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b',
                                 ip: 'localhost'});

  const thisStub = clone(stub);
  thisStub.startServer();

  stubDevice._pingPongPeriod = 0.5;

  await new Promise((resolve, reject) => {
    // One heartbeat must be in 1s as each one has 0.5s between
    const toleranceTimeout = setTimeout(() => reject(), 1000);

    stubDevice.on('heartbeat', () => {
      clearTimeout(toleranceTimeout);
      resolve();
    });

    stubDevice.on('error', error => reject(error));

    stubDevice.connect();
  });

  stubDevice.disconnect();
  thisStub.shutdown();

  t.pass();
});

test.serial('disconnected event is fired when heartbeat times out', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b',
                                 ip: 'localhost'});

  const thisStub = clone(stub);
  thisStub.respondToHeartbeat = false;
  thisStub.startServer();

  stubDevice._pingPongPeriod = 0.5;

  await stubDevice.connect();

  await new Promise(resolve => {
    stubDevice.on('disconnected', () => resolve());
  });

  stubDevice.disconnect();
  thisStub.shutdown();

  t.pass();
});

test('can reconnect if device goes offline', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b',
                                 ip: 'localhost'});

  const thisStub = clone(stub);
  thisStub.startServer();

  stubDevice.on('error', () => {});

  await stubDevice.connect();

  thisStub.shutdown();

  await delay(500);

  thisStub.startServer();

  // Attempt to reconnect
  await pRetry(async () => {
    await stubDevice.connect();
  }, {retries: 3});

  t.pass();
});
