import test from 'ava';
import TuyaStub from '@tuyapi/stub';
import clone from 'clone';
import delay from 'delay';

const TuyAPI = require('..');

const stub = new TuyaStub({id: '22325186db4a2217dc8e',
                           key: '4226aa407d5c1e2b',
                           state: {1: false, 2: true}});

// You may notice that at the end of each test
// there's a delay() before the function exits.
// This is to prevent race conditions that can
// occur in which a UDP broadcast lags after the
// server is torn down and is captured by the
// following test, skewing the results.

test.serial('find device on network using deprecated resolveId', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b'});
  const thisStub = clone(stub);
  thisStub.startServer();

  thisStub.startUDPBroadcast({interval: 1});

  await stubDevice.resolveId();

  stubDevice.disconnect();
  thisStub.shutdown();

  await delay(100);

  t.not(stubDevice.device.ip, undefined);
});

test.serial('find device on network by ID', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b'});
  const thisStub = clone(stub);
  thisStub.startServer();

  thisStub.startUDPBroadcast({interval: 1});

  await stubDevice.find();

  stubDevice.disconnect();
  thisStub.shutdown();

  await delay(100);

  t.not(stubDevice.device.ip, undefined);
});

test.serial('find device on network by IP', async t => {
  const stubDevice = new TuyAPI({ip: 'localhost',
                                 key: '4226aa407d5c1e2b'});
  const thisStub = clone(stub);
  thisStub.startServer();

  thisStub.startUDPBroadcast({interval: 1});

  await stubDevice.find();

  stubDevice.disconnect();
  thisStub.shutdown();

  await delay(100);

  t.not(stubDevice.device.id, undefined);
});

test.serial('find returns if both ID and IP are already set', async t => {
  const stubDevice = new TuyAPI({ip: 'localhost',
                                 id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b'});
  const thisStub = clone(stub);
  thisStub.startServer();

  thisStub.startUDPBroadcast({interval: 1});

  const result = await stubDevice.find();

  stubDevice.disconnect();
  thisStub.shutdown();

  await delay(100);

  t.is(true, result);
});

test.serial('find throws timeout error', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b'});

  const thisStub = clone(stub);
  thisStub.startServer();

  await t.throwsAsync(() => {
    return stubDevice.find({timeout: 0.1}).catch(async error => {
      stubDevice.disconnect();
      thisStub.shutdown();

      await delay(100);

      throw error;
    });
  });
});

test.serial('find with option all', async t => {
  const stubDevice = new TuyAPI({id: '22325186db4a2217dc8e',
                                 key: '4226aa407d5c1e2b'});
  const thisStub = clone(stub);
  thisStub.startServer();

  thisStub.startUDPBroadcast({interval: 1});

  const foundDevices = await stubDevice.find({all: true, timeout: 2});

  stubDevice.disconnect();
  thisStub.shutdown();

  await delay(100);

  t.truthy(foundDevices.length);
});
