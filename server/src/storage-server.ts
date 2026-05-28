#!/usr/bin/env tsx
/**
 * Download Hub Storage Server
 *
 * A standalone gRPC server that receives pushed files from the Hub
 * and stores them in a local KV database. Registers itself with the
 * Download Hub and sends heartbeats to stay discoverable.
 *
 * Usage:
 *   npm start
 *   npm start -- --name "NAS-01" --hub localhost:50051 --port 50052
 *
 * Architecture:
 *   Task Client ──SubmitDownload──► Hub ──PushFile──► Storage Server (this)
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { storeFile, listFiles, getStats, deleteFile } from './kv-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== CLI Args =====
const args = process.argv.slice(2);
const getArg = (flag: string, def?: string): string => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def || '';
};

const STORAGE_NAME = getArg('--name', `storage-${os.hostname()}`);
const HUB_ADDRESS = getArg('--hub', 'localhost:50051');
const GRPC_PORT = parseInt(getArg('--port', '50052'), 10);

// ===== Colors =====
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};

function log(color: string, tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${C.dim}[${ts}]${C.reset} ${color}[${tag}]${C.reset} ${msg}`);
}

// ===== Load Proto =====
const PROTO_PATH = path.join(__dirname, 'proto/file_transfer.proto');
const HUB_PROTO_PATH = path.join(path.dirname(__dirname), '..', 'src/lib/proto/download_hub.proto');

function loadFTProto() {
  const pkgDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(pkgDef) as any;
  return proto.filetransfer.FileTransfer;
}

// ===== PushFile Handler =====
function pushFileHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { filename, data, mime_type, metadata } = call.request;

  if (!filename || !data) {
    callback(null, {
      success: false, message: 'Missing filename or data',
      file_id: '', storage_path: '',
    });
    return;
  }

  try {
    const result = storeFile(filename, data, mime_type || 'application/octet-stream', metadata || {});
    callback(null, {
      success: true,
      message: `Stored: ${filename} (${(data.length / 1024).toFixed(1)} KB)`,
      file_id: result.id,
      storage_path: result.path,
    });
  } catch (err: any) {
    callback(null, {
      success: false, message: `Storage error: ${err.message}`,
      file_id: '', storage_path: '',
    });
  }
}

// ===== Ping Handler =====
function pingHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const stats = getStats();
  callback(null, {
    alive: true,
    server_id: `storage-server-${crypto.createHash('md5').update(STORAGE_NAME).digest('hex').slice(0, 8)}`,
    uptime: Math.floor(process.uptime()),
    stored_files: stats.fileCount,
    total_bytes: stats.totalBytes,
  });
}

// ===== Hub Registration =====
async function registerWithHub(): Promise<string | null> {
  return new Promise((resolve) => {
    const pkgDef = protoLoader.loadSync(HUB_PROTO_PATH, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(pkgDef) as any;
    const client = new proto.downloadhub.DownloadHub(HUB_ADDRESS, grpc.credentials.createInsecure());

    client.RegisterStorageServer({
      info: {
        device_name: STORAGE_NAME,
        ip_address: `127.0.0.1:${GRPC_PORT}`,
        os: `${os.platform()} ${os.release()}`,
        hostname: os.hostname(),
        version: '1.0.0',
        capabilities: {
          storage_type: 'kv-file',
          max_file_size: '1024MB',
          total_capacity: 'unlimited',
        },
      },
    }, (err: any, response: any) => {
      client.close();
      if (err) {
        log(C.red, 'HUB', `Registration failed: ${err.details || err.message}`);
        resolve(null);
        return;
      }
      log(C.green, 'HUB', `Registered as ${C.bold}${response.device_id}${C.reset}`);
      resolve(response.device_id);
    });
  });
}

// ===== Heartbeat Loop =====
function startHeartbeat(deviceId: string) {
  const iv = setInterval(async () => {
    const stats = getStats();
    const pkgDef = protoLoader.loadSync(HUB_PROTO_PATH, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(pkgDef) as any;
    const client = new proto.downloadhub.DownloadHub(HUB_ADDRESS, grpc.credentials.createInsecure());

    client.Heartbeat({
      device_id: deviceId,
      status: {
        state: 'online',
        message: `Stored ${stats.fileCount} files (${(stats.totalBytes / 1048576).toFixed(1)} MB)`,
        uptime: Math.floor(process.uptime()),
        active_tasks: 0,
        max_tasks: 50,
        cpu_usage: 0,
        memory_usage: 0,
        disk_usage: stats.totalBytes > 0 ? Math.min(stats.totalBytes / (1024 * 1024 * 1024), 100) : 0,
        extra: {
          stored_files: String(stats.fileCount),
          total_bytes: String(stats.totalBytes),
        },
      },
    }, (err: any) => {
      client.close();
      if (err) log(C.red, 'HB', `Heartbeat failed: ${err.details || err.message}`);
    });
  }, 25000);
  iv.unref();
}

// ===== Start gRPC Server =====
function startGrpcServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const Service = loadFTProto();
    const server = new grpc.Server();

    server.addService(Service.service, {
      PushFile: pushFileHandler,
      Ping: pingHandler,
    });

    server.bindAsync(
      `0.0.0.0:${GRPC_PORT}`,
      grpc.ServerCredentials.createInsecure(),
      (err) => {
        if (err) { reject(err); return; }
        log(C.green, 'GRPC', `Storage server listening on port ${GRPC_PORT}`);
        resolve();
      }
    );
  });
}

// ===== Web API (for local management) =====
import * as http from 'node:http';

function startWebApi() {
  const WEB_PORT = GRPC_PORT + 1; // e.g. 50053
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = new URL(req.url || '/', `http://localhost:${WEB_PORT}`);

    if (url.pathname === '/api/files' && req.method === 'GET') {
      const files = listFiles().map(f => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        size: f.size,
        storedAt: f.storedAt,
        checksum: f.checksum,
        source_url: f.metadata?.source_url || '',
      }));
      res.end(JSON.stringify({ files, stats: getStats() }));
      return;
    }

    if (url.pathname.startsWith('/api/files/') && req.method === 'GET') {
      const id = url.pathname.split('/').pop() || '';
      const file = awaitGetFile(id);
      if (!file) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
      }
      // Return metadata + download URL
      res.end(JSON.stringify({
        id: file.record.id,
        filename: file.record.filename,
        size: file.record.size,
        mimeType: file.record.mimeType,
        storedAt: file.record.storedAt,
        checksum: file.record.checksum,
      }));
      return;
    }

    if (url.pathname.startsWith('/api/download/') && req.method === 'GET') {
      const id = url.pathname.split('/').pop() || '';
      const file = awaitGetFile(id);
      if (!file) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
      }
      res.setHeader('Content-Type', file.record.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.record.filename}"`);
      res.end(file.data);
      return;
    }

    if (url.pathname === '/api/stats' && req.method === 'GET') {
      res.end(JSON.stringify({ ...getStats(), uptime: process.uptime(), version: '1.0.0' }));
      return;
    }

    // Default: list endpoint
    res.statusCode = 302;
    res.setHeader('Location', '/api/files');
    res.end();
  });

  server.listen(WEB_PORT, () => {
    log(C.cyan, 'WEB', `Web API available at http://localhost:${WEB_PORT}/api/files`);
  });
}

// Helper for sync getFile
function awaitGetFile(id: string) {
  const { getFile } = require('./kv-store.js');
  try { return getFile(id); } catch { return null; }
}

// ===== Main =====
async function main() {
  console.log(`\n${C.bold}╔══════════════════════════════════════╗`);
  console.log(`║   Download Hub Storage Server v1.0  ║`);
  console.log(`╚══════════════════════════════════════╝${C.reset}\n`);
  console.log(`  Name: ${STORAGE_NAME}`);
  console.log(`  Hub:  ${HUB_ADDRESS}`);
  console.log(`  Port: ${GRPC_PORT} (gRPC) | ${GRPC_PORT + 1} (Web)\n`);

  // 1. Start gRPC server
  await startGrpcServer();

  // 2. Start Web API
  startWebApi();

  // 3. Register with Hub
  const deviceId = await registerWithHub();
  if (!deviceId) {
    log(C.yellow, 'WARN', 'Could not register with Hub. Running standalone.');
  } else {
    startHeartbeat(deviceId);
  }

  // Initial stats
  const stats = getStats();
  log(C.green, 'KV', `KV database ready | ${stats.fileCount} files | ${(stats.totalBytes / 1048576).toFixed(2)} MB`);

  log(C.dim, 'INFO', 'Press Ctrl+C to stop');
}

main().catch((e) => { console.error(e); process.exit(1); });
