import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import os from 'os';

const PROTO_PATH = path.join(process.cwd(), 'src/lib/proto/download_hub.proto');
let HubService: any = null;

function getHubService() {
  if (HubService) return HubService;
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  HubService = proto.downloadhub.DownloadHub;
  return HubService!;
}

function createClient(hubAddress: string): any {
  return new (getHubService())(hubAddress, grpc.credentials.createInsecure());
}

// --- Device Registration ---

export interface DeviceRegistrationParams {
  hubAddress: string;
  deviceName: string;
  os?: string;
  version?: string;
  capabilities?: Record<string, string>;
  secret?: string;
}

export async function registerDevice(
  type: 'task_client' | 'storage_server',
  params: DeviceRegistrationParams,
): Promise<{ success: boolean; message: string; deviceId?: string }> {
  return new Promise((resolve) => {
    const client = createClient(params.hubAddress);
    const rpc = type === 'task_client' ? 'RegisterTaskClient' : 'RegisterStorageServer';
    
    client[rpc]({
      info: {
        device_name: params.deviceName,
        os: params.os || `${os.platform()} ${os.release()}`,
        hostname: os.hostname(),
        version: params.version || '1.0.5',
        capabilities: params.capabilities || {},
      },
      secret: params.secret || '',
    }, (err: any, response: any) => {
      client.close();
      if (err) {
        resolve({ success: false, message: `Registration failed: ${err.details || err.message}` });
        return;
      }
      resolve({ success: response.success, message: response.message, deviceId: response.device_id });
    });
  });
}

// --- Heartbeat ---

export function sendHeartbeat(
  hubAddress: string,
  deviceId: string,
  status: { state: string; message?: string; activeTasks?: number; cpuUsage?: number; memoryUsage?: number; diskUsage?: number },
): Promise<boolean> {
  return new Promise((resolve) => {
    const client = createClient(hubAddress);
    client.Heartbeat({
      device_id: deviceId,
      status: {
        state: status.state,
        message: status.message || '',
        uptime: Math.floor(process.uptime()),
        active_tasks: status.activeTasks || 0,
        max_tasks: 10,
        cpu_usage: status.cpuUsage || 0,
        memory_usage: status.memoryUsage || 0,
        disk_usage: status.diskUsage || 0,
      },
    }, (err: any, response: any) => {
      client.close();
      resolve(!err && response?.success);
    });
  });
}

// --- Device Management ---

export interface DeviceRecord {
  deviceId: string;
  deviceType: string;
  deviceName: string;
  ip: string;
  os: string;
  hostname: string;
  version: string;
  state: string;
  statusMessage: string;
  registeredAt: number;
  lastHeartbeat: number;
  connectionState: string;
}

export function listDevices(hubAddress: string, typeFilter?: string): Promise<DeviceRecord[]> {
  return new Promise((resolve) => {
    const client = createClient(hubAddress);
    client.ListDevices({ device_type: typeFilter || '' }, (err: any, response: any) => {
      client.close();
      if (err) { resolve([]); return; }
      resolve((response.devices || []).map((d: any) => ({
        deviceId: d.device_id,
        deviceType: d.device_type,
        deviceName: d.info?.device_name || 'unknown',
        ip: d.info?.ip_address || 'unknown',
        os: d.info?.os || 'unknown',
        hostname: d.info?.hostname || 'unknown',
        version: d.info?.version || '0.0.0',
        state: d.status?.state || 'unknown',
        statusMessage: d.status?.message || '',
        registeredAt: d.registered_at || 0,
        lastHeartbeat: d.last_heartbeat || 0,
        connectionState: d.connection_state || 'unknown',
      })));
    });
  });
}

// --- Download Task ---

export interface DownloadTaskParams {
  targetUrl: string;
  browserPreset?: string;
  userAgent?: string;
  tcpTtl?: number;
  tcpMss?: number;
  tcpWindowSize?: number;
  h2WindowIncrement?: number;
  connectionReuse?: boolean;
  cdnType?: string;
  storageDeviceId?: string;
}

export type DownloadEvent =
  | { type: 'progress'; progress: number; speed: number; received: number; total: number }
  | { type: 'log'; level: string; message: string }
  | { type: 'state'; state: string; progress: number };

export function submitDownload(
  hubAddress: string,
  params: DownloadTaskParams,
  onEvent: (event: DownloadEvent) => void,
  onError?: (error: string) => void,
): void {
  const client = createClient(hubAddress);

  const request = {
    target_url: params.targetUrl,
    browser_preset: params.browserPreset || 'chrome',
    user_agent: params.userAgent || 'Mozilla/5.0',
    tcp_ttl: params.tcpTtl || 128,
    tcp_mss: params.tcpMss || 1460,
    tcp_window_size: params.tcpWindowSize || 65535,
    h2_window_increment: params.h2WindowIncrement || 6291456,
    connection_reuse: params.connectionReuse ?? true,
    cdn_type: params.cdnType || 'cloudflare',
    storage_device_id: params.storageDeviceId || '',
  };

  const deadline = new Date();
  deadline.setMilliseconds(deadline.getMilliseconds() + 300000);

  const call = client.SubmitDownload(request, { deadline });

  call.on('data', (event: any) => {
    if (event.progress) onEvent({ type: 'progress', ...event.progress });
    else if (event.log) onEvent({ type: 'log', level: event.log.level, message: event.log.message });
    else if (event.state) onEvent({ type: 'state', state: event.state.state, progress: event.state.progress });
  });

  call.on('error', (err: any) => {
    onError?.(err.details || err.message);
    client.close();
  });

  call.on('end', () => { client.close(); });
}

// --- Health ---

export function pingHub(hubAddress: string): Promise<{ alive: boolean; serverId?: string; uptime?: number; connectedClients?: number; connectedStorage?: number }> {
  return new Promise((resolve) => {
    const client = createClient(hubAddress);
    client.Ping({}, { deadline: new Date(Date.now() + 5000) }, (err: any, response: any) => {
      client.close();
      if (err) { resolve({ alive: false }); return; }
      resolve({
        alive: response.alive, serverId: response.server_id, uptime: response.uptime,
        connectedClients: response.connected_clients, connectedStorage: response.connected_storage,
      });
    });
  });
}
