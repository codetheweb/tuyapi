import test from 'ava';

const TuyAPI = require('..');

test('constructor throws error if both ID and IP are missing from device', t => {
  t.throws(() => {
    // eslint-disable-next-line no-new
    new TuyAPI();
  });
});

test('constructor throws error if key is invalid', t => {
  t.throws(() => {
    // Key is 15 characters instead of 16
    // eslint-disable-next-line no-new
    new TuyAPI({id: '22325186db4a2217dc8e',
                key: '4226aa407d5c1e2'});
  });
});

test('set throws error if no arguments are passed', t => {
  t.throws(() => {
    const device = new TuyAPI({id: '22325186db4a2217dc8e',
                               key: '4226aa407d5c1e2b'});

    device.set();
  });
});
