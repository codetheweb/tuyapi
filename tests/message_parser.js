const parser = require('../message_parser');

let b = Buffer.from('000055aa000000000000000a0000005d000000007b226465764964223a223034323030343839363863363361626562333534222c22647073223a7b2231223a747275652c2232223a302c2234223a3931322c2235223a313032352c2236223a313137357d7d440c87ca0000aa55', 'hex');

//let b = fs.readFileSync('./packet.bin');
let arr = [
  b.slice(0, 5),
  b.slice(5, 14),
  b.slice(14, 20),
  b.slice(20)
]

arr = [Buffer.from('000055aa00000000000000070000000c00000000789370910000aa55', 'hex')]

let mp = new parser();

while(!mp.parse() && arr.length) {
  console.error('push');
  mp.append(arr.shift());
}

console.log(mp.parse());
console.log(mp.decode());
