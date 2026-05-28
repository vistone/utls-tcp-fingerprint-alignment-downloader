#!/usr/bin/env tsx
/**
 * Download Hub Task Client - Standalone
 *
 * A completely standalone CLI tool that connects to a Download Hub,
 * registers as a task sender, submits download tasks, and specifies
 * target storage servers. Has zero dependency on the main project.
 *
 * Usage:
 *   npm start -- --hub 192.168.1.10:50051 --name "Client-1" --url "https://..." --storage "storage-1"
 *
 *   # Interactive:
 *   npm start -- --hub localhost:50051 --name "MyClient"
 */

import * as readline from 'node:readline';
import * as os from 'node:os';
import {
  createClient, delay, pingHub,
  registerTaskClient, sendHeartbeat,
  listDevices, submitDownload,
} from './hub-client.js';

// ===== Colors =====
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  purple: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(color: string, tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`${C.dim}[${ts}]${C.reset} ${color}[${tag}]${C.reset} ${msg}\n`);
}

// ===== Parse CLI Args =====
const args = process.argv.slice(2);
const getArg = (flag: string, def?: string): string => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def || '';
};

const HUB = getArg('--hub', 'localhost:50051');
const NAME = getArg('--name', `cli-${os.hostname()}`);
const URL  = getArg('--url', '');
const STOR = getArg('--storage', '');

// ===== Main =====
async function main() {
  console.log(`\n${C.bold}╔══════════════════════════════════════╗`);
  console.log(`║   Download Hub Task Client v1.0      ║`);
  console.log(`║   Standalone - no server dependency   ║`);
  console.log(`╚══════════════════════════════════════╝${C.reset}\n`);
  console.log(`  Hub:  ${HUB}`);
  console.log(`  Name: ${NAME}\n`);

  // 1. Connect
  log(C.purple, 'HUB', `Connecting to ${HUB}...`);
  const hub = await pingHub(HUB);
  if (!hub.alive) {
    log(C.red, 'ERR', `Cannot reach Hub at ${HUB}`);
    process.exit(1);
  }
  log(C.green, 'HUB', `Connected | Uptime: ${hub.uptime}s | Clients: ${hub.connectedClients} | Storage: ${hub.connectedStorage}`);

  // 2. List storage
  const storageDevices = await listDevices(HUB, 'storage_server');
  if (storageDevices.length === 0) {
    log(C.yellow, 'STOR', 'No storage servers registered. Files saved locally on Hub.');
  } else {
    log(C.green, 'STOR', 'Available storage servers:');
    for (const s of storageDevices) {
      const name = s.info?.device_name || '?';
      const ip = s.info?.ip_address || '?';
      const sid = s.device_id;
      const sel = sid === STOR ? ' ← SELECTED' : '';
      log(C.cyan, '     ', `${sid}  ${name}  (${ip})${sel}`);
    }
  }

  // 3. Register
  const hostname = os.hostname();
  const reg = await registerTaskClient(HUB, NAME, `${os.platform()} ${os.release()}`, hostname, '1.0.0');
  if (!reg.success) {
    log(C.red, 'ERR', `Registration failed: ${reg.message}`);
    process.exit(1);
  }
  const DEVICE_ID = reg.deviceId!;
  log(C.green, 'REG', `Registered as ${C.bold}${DEVICE_ID}${C.reset} on ${hostname}`);

  // 4. Heartbeat loop (background)
  const hb = setInterval(async () => {
    await sendHeartbeat(HUB, DEVICE_ID, { state: 'online', cpuUsage: 0, memoryUsage: 0, activeTasks: 0 });
  }, 25000);
  hb.unref();

  log(C.dim, 'HB', 'Heartbeat started (25s interval)');
  console.log('');

  // 5. Submit download
  const doDownload = async (url: string, storageId: string) => {
    log(C.cyan, 'TASK', `Downloading: ${url}`);
    if (storageId) log(C.cyan, 'TASK', `Storage: ${storageId}`);

    let lastPct = -1;
    await submitDownload(HUB, url, storageId, (type, data) => {
      if (type === 'progress') {
        const p = data;
        const pct = Math.floor(p.progress);
        if (pct !== lastPct) {
          lastPct = pct;
          const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
          log(C.green, 'PROG', `${bar} ${pct}% | ${p.speed.toFixed(2)} MB/s | ${(p.received / 1048576).toFixed(2)} MB / ${(p.total / 1048576).toFixed(2)} MB`);
        }
      } else if (type === 'log') {
        const lvl = data.level === 'error' ? C.red : C.dim;
        log(lvl, 'LOG', data.message);
      } else if (type === 'state') {
        const sc = data.state === 'completed' ? C.green : data.state === 'failed' ? C.red : C.cyan;
        log(sc, data.state.toUpperCase(), `Progress: ${data.progress}%`);
      } else if (type === 'error') {
        log(C.red, 'ERR', data.message);
      }
    });
  };

  if (URL) {
    await doDownload(URL, STOR);
    console.log(`\n${C.green}Download complete. Exiting.${C.reset}\n`);
    process.exit(0);
  } else {
    // Interactive mode
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

    console.log(`${C.bold}Interactive mode. Enter URLs to download (or 'quit' to exit):${C.reset}\n`);
    while (true) {
      const url = (await ask(`\n${C.cyan}URL${C.reset}> `)).trim();
      if (!url || url === 'quit') break;

      let storageId = STOR;
      if (!storageId && storageDevices.length > 0) {
        storageId = (await ask(`${C.cyan}Storage ID${C.reset}> `)).trim();
      }

      await doDownload(url, storageId);
    }

    rl.close();
    log(C.yellow, 'EXIT', 'Goodbye');
    process.exit(0);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
