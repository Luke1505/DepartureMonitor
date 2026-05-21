#!/usr/bin/env node
/**
 * Prints your local network IP(s) so you can paste one into platformio.ini
 * for the firmware-local build environment.
 *
 * Usage: node scripts/local-ip.js
 */
import { networkInterfaces } from 'os';

const nets = networkInterfaces();
const candidates = [];

for (const [iface, addrs] of Object.entries(nets)) {
  for (const addr of addrs) {
    if (addr.family === 'IPv4' && !addr.internal) {
      candidates.push({ iface, address: addr.address });
    }
  }
}

console.log('\n  Your local IPv4 addresses:\n');
for (const { iface, address } of candidates) {
  console.log(`  ${iface.padEnd(20)} ${address}`);
}

if (candidates.length > 0) {
  const best = candidates[0].address;
  console.log('\n  Paste the right one into platformio.ini:');
  console.log(`  -DSERVER_BASE_URL=\'"http://${best}:3000"\'`);
}
console.log('');
