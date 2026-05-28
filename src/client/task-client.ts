#!/usr/bin/env tsx
/**
 * Download Hub Task Client
 * 
 * A standalone CLI tool that connects to a Download Hub,
 * registers itself as a task sender, submits download tasks,
 * specifies target storage servers, and streams progress.
 * 
 * Usage:
 *   npx tsx src/client/task-client.ts --hub 192.168.1.10:50051 --name "MyClient" \
 *     --url "https://example.com/file.zip" --storage "storage-1"
 * 
 *   # Interactive mode:
 *   npx tsx src/client/task-client.ts --hub localhost:50051
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import os from 'os';

const PROTO_PATH = path.join(process.cwd(), 'src/lib/proto/download_hub.proto');

// ===== Parse CLI Args =====
const args = process.argv.slice(2);
const getArg = (flag: string, def?: string): string => {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def || '';
};

const HUB_ADDRESS = getArg('--hub', 'localhost:50051');
const CLIENT_NAME = getArg('--name', `cli-${os.hostname()}`);
const DOWNLOAD_URL = getArg('--url', '');
const STORAGE_ID = getArg('--storage', '');

// ===== Load Proto =====
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const HubService = proto.downloadhub.DownloadHub;

function createClient(): any {
  return new HubService(HUB_ADDRESS, grpc.credentials.createInsecure());
}

// ===== Colors for Terminal =====
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  purple: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(color: string, tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${colors.dim}[${ts}]${colors.reset} ${color}[${tag}]${colors.reset} ${msg}`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ===== 1. Ping Hub =====
async function pingHub(): Promise<boolean> {
  return new Promise((resolve) => {
    const client = createClient();
    client.Ping({}, { deadline: new Date(Date.now() + 5000) }, (err: any, res: any) => {
      client.close();
      if (err) {
        log(colors.red, 'ERR', `Cannot connect to Hub at ${HUB_ADDRESS}: ${err.details || err.message}`);
        resolve(false);
        return;
      }
      log(colors.green, 'HUB', `Connected to ${HUB_ADDRESS} (Server: ${res.server_id}, Uptime: ${res.uptime}s)`);
      log(colors.green, 'HUB', `Connected clients: ${res.connected_clients}, Storage: ${res.connected_storage}`);
      resolve(true);
    });
  });
}

// ===== 2. List Available Storage =====
async function listStorageServers(): Promise<Array<{ deviceId: string; name: string; ip: string }>> {
  return new Promise((resolve) => {
    const client = createClient();
    client.ListDevices({ device_type: 'storage_server' }, (err: any, res: any) => {
      client.close();
      if (err) { resolve([]); return; }
      const servers = (res.devices || []).map((d: any) => ({
        deviceId: d.device_id,
        name: d.info?.device_name || 'unknown',
        ip: d.info?.ip_address || 'unknown',
      }));
      resolve(servers);
    });
  });
}

// ===== 3. Register as Task Client =====
async function registerClient(): Promise<string | null> {
  return new Promise((resolve) => {
    const client = createClient();
    client.RegisterTaskClient({
      info: {
        device_name: CLIENT_NAME,
        os: `${os.platform()} ${os.release()}`,
        hostname: os.hostname(),
        version: '1.0.5',
        capabilities: JSON.parse(getArg('--capabilities', '{}')),
      },
    }, (err: any, res: any) => {
      client.close();
      if (err) {
        log(colors.red, 'ERR', `Registration failed: ${err.details || err.message}`);
        resolve(null);
        return;
      }
      log(colors.green, 'REG', `Registered as ${colors.bold}${res.device_id}${colors.reset} (${CLIENT_NAME})`);
      resolve(res.device_id);
    });
  });
}

// ===== 4. Send Heartbeat (keepalive thread) =====
function startHeartbeat(deviceId: string) {
  const interval = setInterval(() => {
    const client = createClient();
    client.Heartbeat({
      device_id: deviceId,
      status: {
        state: 'online',
        message: 'Active',
        uptime: Math.floor(process.uptime()),
        active_tasks: 0,
        cpu_usage: 0,
      },
    }, (err: any) => {
      client.close();
      if (err) {
        log(colors.red, 'HB', `Heartbeat failed: ${err.details || err.message}`);
      }
    });
  }, 25000); // every 25 seconds
  
  // Don't let the interval prevent exit
  interval.unref();
  return interval;
}

// ===== 5. Submit Download Task =====
async function submitDownload(deviceId: string, url: string, storageId: string) {
  return new Promise<void>((resolve) => {
    const client = createClient();
    
    log(colors.cyan, 'TASK', `Downloading: ${url}`);
    if (storageId) {
      log(colors.cyan, 'TASK', `Target storage: ${storageId}`);
    }

    const deadline = new Date();
    deadline.setMilliseconds(deadline.getMilliseconds() + 300000); // 5 min

    const request = {
      target_url: url,
      browser_preset: 'chrome',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      cdn_type: 'cloudflare',
      storage_device_id: storageId,
    };

    const call = client.SubmitDownload(request, { deadline });
    
    let lastProgressLine = '';

    call.on('data', (event: any) => {
      if (event.progress) {
        const p = event.progress;
        const bar = '█'.repeat(Math.floor(p.progress / 5)) + '░'.repeat(20 - Math.floor(p.progress / 5));
        const line = `  ${bar} ${p.progress.toFixed(1)}% | ${p.speed.toFixed(2)} MB/s | ${(p.received / 1024 / 1024).toFixed(2)} MB / ${(p.total / 1024 / 1024).toFixed(2)} MB`;
        // Clear previous progress line
        process.stdout.write('\x1b[K');
        console.log(line);
      } else if (event.log) {
        const lvl = event.log.level === 'error' ? colors.red : event.log.level === 'warn' ? colors.yellow : colors.dim;
        log(lvl, 'LOG', event.log.message);
      } else if (event.state) {
        const state = event.state.state;
        const stateColor = state === 'completed' ? colors.green : state === 'failed' ? colors.red : colors.cyan;
        log(stateColor, state.toUpperCase(), `Progress: ${event.state.progress}%`);
        
        if (state === 'completed' || state === 'failed') {
          client.close();
          resolve();
        }
      }
    });

    call.on('error', (err: any) => {
      log(colors.red, 'ERR', `Stream error: ${err.details || err.message}`);
      client.close();
      resolve();
    });

    call.on('end', () => {
      client.close();
      resolve();
    });
  });
}

// ===== Main =====
async function main() {
  console.log(`\n${colors.bold}╔══════════════════════════════════╗`);
  console.log(`║   Download Hub Task Client v1.0   ║`);
  console.log(`╚══════════════════════════════════╝${colors.reset}\n`);

  log(colors.purple, 'INIT', `Client: ${CLIENT_NAME}`);
  log(colors.purple, 'INIT', `Hub:    ${HUB_ADDRESS}`);

  // Step 1: Ping Hub
  const alive = await pingHub();
  if (!alive) {
    console.error(`\n${colors.red}Cannot reach Hub at ${HUB_ADDRESS}. Start the server first.${colors.reset}\n`);
    process.exit(1);
  }

  // Step 2: List storage servers
  const storageServers = await listStorageServers();
  if (storageServers.length === 0) {
    log(colors.yellow, 'WARN', 'No storage servers registered. Files will be saved locally on Hub.');
  } else {
    log(colors.green, 'STOR', `Available storage servers:`);
    for (const s of storageServers) {
      const selected = s.deviceId === STORAGE_ID ? ' ← SELECTED' : '';
      log(colors.cyan, '    ', `${s.deviceId} - ${s.name} (${s.ip})${selected}`);
    }
  }

  // Step 3: Register
  const deviceId = await registerClient();
  if (!deviceId) {
    process.exit(1);
  }

  // Step 4: Start heartbeat
  startHeartbeat(deviceId);
  log(colors.dim, 'HB', 'Heartbeat thread started (25s interval)');

  // If URL provided, submit immediately
  if (DOWNLOAD_URL) {
    await submitDownload(deviceId, DOWNLOAD_URL, STORAGE_ID);
  } else {
    // Interactive: wait for user input
    console.log(`\n${colors.bold}Interactive mode. Enter URLs to download (or 'quit' to exit):${colors.reset}\n`);
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = () => {
      rl.question(`\n${colors.cyan}URL${colors.reset}> `, async (input: string) => {
        const url = input.trim();
        if (!url || url === 'quit') {
          log(colors.yellow, 'EXIT', 'Shutting down...');
          rl.close();
          return;
        }
        
        let storageId = STORAGE_ID;
        if (!storageId && storageServers.length > 0) {
          rl.question(`${colors.cyan}Storage ID${colors.reset}> `, (sid: string) => {
            storageId = sid.trim();
            submitDownload(deviceId, url, storageId).then(prompt);
          });
          return;
        }
        
        await submitDownload(deviceId, url, storageId);
        prompt();
      });
    };

    prompt();

    await new Promise<void>((resolve) => {
      rl.on('close', resolve);
    });
  }

  log(colors.yellow, 'DONE', 'Client session complete');
  process.exit(0);
}

main();
