import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.join(__dirname, 'proto/download_hub.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const HubService = proto.downloadhub.DownloadHub;

export function createClient(hubAddress: string): any {
  return new HubService(hubAddress, grpc.credentials.createInsecure());
}

export function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== Ping =====
export function pingHub(hubAddress: string): Promise<{
  alive: boolean; serverId?: string; uptime?: number;
  connectedClients?: number; connectedStorage?: number;
}> {
  return new Promise((resolve) => {
    const client = createClient(hubAddress);
    const deadline = new Date(Date.now() + 5000);
    client.Ping({}, { deadline }, (err: any, res: any) => {
      client.close();
      if (err) { resolve({ alive: false }); return; }
      resolve({
        alive: res.alive, serverId: res.server_id, uptime: res.uptime,
        connectedClients: res.connected_clients, connectedStorage: res.connected_storage,
      });
    });
  });
}

// ===== Register as Task Client =====
export function registerTaskClient(
  hubAddress: string,
  deviceName: string,
  osInfo?: string,
  hostname?: string,
  version?: string,
): Promise<{ success: boolean; deviceId?: string; message: string }> {
  return new Promise((resolve) => {
    const client = createClient(hubAddress);
    client.RegisterTaskClient({
      info: {
        device_name: deviceName,
        os: osInfo || process.platform,
        hostname: hostname || '',
        version: version || '1.0.0',
        capabilities: {},
      },
    }, (err: any, res: any) => {
      client.close();
      if (err) {
        resolve({ success: false, message: err.details || err.message });
        return;
      }
      resolve({ success: res.success, deviceId: res.device_id, message: res.message });
    });
  });
}

// ===== Heartbeat =====
export function sendHeartbeat(
  hubAddress: string, deviceId: string,
  status: { state: string; activeTasks?: number; cpuUsage?: number; memoryUsage?: number },
): Promise<boolean> {
  return new Promise((resolve) => {
    const client = createClient(hubAddress);
    client.Heartbeat({
      device_id: deviceId,
      status: {
        state: status.state,
        message: '',
        uptime: Math.floor(process.uptime()),
        active_tasks: status.activeTasks || 0,
        max_tasks: 10,
        cpu_usage: status.cpuUsage || 0,
        memory_usage: status.memoryUsage || 0,
        disk_usage: 0,
      },
    }, (err: any) => {
      client.close();
      resolve(!err);
    });
  });
}

// ===== List Devices =====
export function listDevices(hubAddress: string, typeFilter?: string): Promise<any[]> {
  return new Promise((resolve) => {
    const client = createClient(hubAddress);
    client.ListDevices({ device_type: typeFilter || '' }, (err: any, res: any) => {
      client.close();
      if (err) { resolve([]); return; }
      resolve(res.devices || []);
    });
  });
}

// ===== Submit Download =====
export function submitDownload(
  hubAddress: string,
  targetUrl: string,
  storageDeviceId?: string,
  onEvent?: (type: string, data: any) => void,
  timeoutMs = 300000,
): Promise<void> {
  return new Promise((resolve) => {
    const client = createClient(hubAddress);
    const deadline = new Date(Date.now() + timeoutMs);

    client.SubmitDownload({
      target_url: targetUrl,
      browser_preset: 'chrome',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      cdn_type: 'cloudflare',
      storage_device_id: storageDeviceId || '',
    }, { deadline }, (err: any, call: any) => {
      if (err) {
        onEvent?.('error', { message: err.details || err.message });
        resolve();
        return;
      }
      call.on('data', (event: any) => {
        if (event.progress) onEvent?.('progress', event.progress);
        else if (event.log) onEvent?.('log', event.log);
        else if (event.state) {
          onEvent?.('state', event.state);
          if (event.state.state === 'completed' || event.state.state === 'failed') {
            client.close();
            resolve();
          }
        }
      });
      call.on('error', (e: any) => {
        onEvent?.('error', { message: e.details || e.message });
        client.close();
        resolve();
      });
      call.on('end', () => { client.close(); resolve(); });
    });
  });
}
