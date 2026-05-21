#!/usr/bin/env node
/**
 * DepartureMonitor — ESP32 device simulator
 * Simulates the full device lifecycle on your PC so you can test without hardware.
 *
 * Usage:
 *   node scripts/sim-device.js
 *   node scripts/sim-device.js --id <uuid>       reuse an existing device ID
 *   node scripts/sim-device.js --url http://...  custom backend URL
 *   node scripts/sim-device.js --bat 45          initial battery %
 */

import { randomUUID } from 'crypto';
import { createInterface } from 'readline';

// ── CLI args ──────────────────────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

const BASE      = arg('--url') || 'http://localhost:3000';
const DEVICE_ID = arg('--id')  || randomUUID();
const FIRMWARE  = '1.0.0-sim';
let   battery   = parseInt(arg('--bat') || '78', 10);

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: err.message };
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
const LINE = '─'.repeat(60);
function log(msg)       { console.log(msg); }
function ok(msg)        { console.log(`  [OK]  ${msg}`); }
function info(msg)      { console.log(`        ${msg}`); }
function warn(msg)      { console.log(`  [!!]  ${msg}`); }
function section(title) { console.log(`\n${LINE}\n  ${title}\n${LINE}`); }

function fmtDep(dep) {
  const mins = dep.countdown <= 0  ? 'jetzt'
             : dep.countdown >= 60 ? `${Math.floor(dep.countdown/60)}h${dep.countdown%60}`
             :                       `${dep.countdown}m`;
  const delay = dep.delay > 0 ? ` +${dep.delay}` : '';
  return `  [${dep.type}] ${dep.line.padEnd(5)} ${dep.destination.padEnd(22)} ${(mins+delay).padStart(8)}`;
}

// ── Simulator state ───────────────────────────────────────────────────────────
let config        = null;
let heartbeatTimer = null;
let pollTimer      = null;
let polling        = false;

// ── Steps ─────────────────────────────────────────────────────────────────────

async function checkBackend() {
  section('1 / Backend health check');
  const { ok: isOk, data } = await api('GET', '/health');
  if (isOk) {
    ok(`Backend reachable  ${data.timestamp || ''}`);
  } else {
    warn('Backend not reachable. Is Docker / the backend running?');
    warn(`  Expected at: ${BASE}`);
    warn('  Run: docker compose -f docker-compose.dev.yml up -d');
    process.exit(1);
  }
}

async function registerDevice() {
  section('2 / Device registration');
  info(`Device ID : ${DEVICE_ID}`);
  info(`Firmware  : ${FIRMWARE}`);

  const { ok: isOk, data } = await api('POST', `/api/device/${DEVICE_ID}/register`, { firmware: FIRMWARE });
  if (isOk) {
    ok(`Registered as "${data.name || '(no name yet)'}"`);
  } else {
    warn(`Register failed: ${JSON.stringify(data)}`);
  }
}

async function showSetupInfo() {
  section('3 / Setup URL');
  const setupUrl = `${BASE}/setup/${DEVICE_ID}`;
  log(`  Open this in your browser to configure the device:`);
  log('');
  log(`  >>> ${setupUrl} <<<`);
  log('');
  info('The simulator will poll for a config every 3 seconds.');
  info('Configure the device in the web UI, then save.');
}

async function pollConfig() {
  section('4 / Waiting for config');

  return new Promise((resolve) => {
    let attempt = 0;
    polling = true;

    pollTimer = setInterval(async () => {
      attempt++;
      const { status, data } = await api('GET', `/api/device/${DEVICE_ID}/config`);

      if (status === 202) {
        process.stdout.write(`\r  Poll ${attempt}: pending setup...   `);
      } else if (status === 200 && data.stations) {
        clearInterval(pollTimer);
        polling = false;
        process.stdout.write('\n');
        ok(`Config received after ${attempt} polls`);
        config = data;
        resolve();
      } else {
        process.stdout.write(`\r  Poll ${attempt}: unexpected ${status}   `);
      }
    }, 3000);
  });
}

function showConfig() {
  section('5 / Config');
  log(`  Stations (${config.stations?.length || 0}):`);
  for (const s of (config.stations || [])) {
    info(`  ${s.icon?.padEnd(14)} "${s.label}" — ${s.stopName} (${s.api?.toUpperCase()}, stopId ${s.stopId})`);
  }
  log(`  Refresh: ${config.refresh_minutes} min`);
  log(`  TZ: ${config.timezone}`);
}

async function fetchDepartures() {
  section('6 / Departure test fetch');
  for (const station of (config.stations || [])) {
    if (!station.stopId) { warn(`  "${station.label}" has no stopId, skipping`); continue; }
    log(`\n  Station: ${station.label} (${station.stopName}, api=${station.api})`);
    const path = `/api/transit/departures?stopId=${encodeURIComponent(station.stopId)}&api=${station.api || 'vrr'}&deviceId=${DEVICE_ID}`;
    const { ok: isOk, status, data } = await api('GET', path);
    if (!isOk) {
      warn(`  Fetch failed: ${status} — ${JSON.stringify(data)}`);
      continue;
    }
    const deps = data.departures || [];
    if (!deps.length) {
      info('  No departures returned.');
    } else {
      for (const d of deps.slice(0, 5)) log(fmtDep(d));
    }
    info(`  (fetched at ${data.fetchedAt})`);
  }
}

async function startHeartbeatLoop() {
  section('7 / Heartbeat loop  (Ctrl+C to stop)');
  info('Sends a heartbeat every 30 seconds.');
  info('Commands: b <0-100> = set battery  |  d = fetch departures  |  q = quit');
  log('');

  const sendHeartbeat = async () => {
    const { ok: isOk } = await api('POST', `/api/device/${DEVICE_ID}/heartbeat`, {
      battery_pct: battery,
      firmware: FIRMWARE,
    });
    process.stdout.write(`\r  Heartbeat sent — battery ${battery}%${' '.repeat(20)}`);
    if (!isOk) process.stdout.write(' (FAILED)');
  };

  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 30_000);

  // Interactive stdin
  const rl = createInterface({ input: process.stdin, terminal: false });
  process.stdin.setRawMode?.(false);

  rl.on('line', async (line) => {
    const parts = line.trim().split(/\s+/);
    const cmd   = parts[0];
    if (cmd === 'b' && parts[1] !== undefined) {
      battery = Math.min(100, Math.max(0, parseInt(parts[1], 10)));
      await sendHeartbeat();
    } else if (cmd === 'd') {
      await fetchDepartures();
    } else if (cmd === 'q') {
      cleanup();
      process.exit(0);
    } else if (cmd) {
      log('  Commands: b <pct>  d  q');
    }
  });
}

function cleanup() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pollTimer)      clearInterval(pollTimer);
}

process.on('SIGINT', () => { log('\n  Simulator stopped.'); cleanup(); process.exit(0); });

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log('  DepartureMonitor — Device Simulator');
console.log('========================================');

await checkBackend();
await registerDevice();
await showSetupInfo();
await pollConfig();
showConfig();
await fetchDepartures();
await startHeartbeatLoop();
