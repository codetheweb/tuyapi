import test from 'ava';

const parser = require('./lib/message-parser');
const mp = new parser();

test('decode message', t => {
  const b = Buffer.from('000055aa000000000000000a0000005d000000007b226465764964223a223034323030343839363863363361626562333534222c22647073223a7b2231223a747275652c2232223a302c2234223a3931322c2235223a313032352c2236223a313137357d7d440c87ca0000aa55', 'hex');
  mp.append(b);
  console.log(mp.parse());
  console.log(mp.decode());
  t.is(apiResult.length, 56);
});
