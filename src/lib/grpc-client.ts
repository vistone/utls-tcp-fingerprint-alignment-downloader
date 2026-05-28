import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

const PROTO_PATH = path.join(process.cwd(), 'src/lib/proto/download_hub.proto');

let HubService: grpc.ServiceClientConstructor | null = null;

function getHubService(): grpc.ServiceClientConstructor {
  if (HubService) return HubService;
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  HubService = proto.downloadhub.DownloadHub;
  return HubService!;
}

function createHubClient(hubAddress: string): any {
  const Service = getHubService();
  return new Service(hubAddress, grpc.credentials.createInsecure());
}

// --- Client Registration (task sender) ---

export interface RegisterClientParams {
  hubAddress: string;
  name: string;
  secret?: string;
}

export function registerClient(params: RegisterClientParams): Promise<{ success: boolean; message: string; clientId?: string }> {
  return new Promise((resolve) => {
    const client = createHubClient(params.hubAddress);
    client.RegisterClient({ name: params.name, secret: params.secret || '' }, (err: any, response: any) => {
      client.close();
      if (err) {
        resolve({ success: false, message: `Registration failed: ${err.details || err.message}` });
        return;
      }
      resolve({ success: response.success, message: response.message, clientId: response.client_id });
    });
  });
}

export function unregisterClient(hubAddress: string, clientId: string): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const client = createHubClient(hubAddress);
    client.UnregisterClient({ client_id: clientId }, (err: any, response: any) => {
      client.close();
      if (err) {
        resolve({ success: false, message: err.details || err.message });
        return;
      }
      resolve({ success: response.success, message: response.message });
    });
  });
}

export interface ClientInfo {
  clientId: string;
  name: string;
  registeredAt: number;
  lastActive: number;
  tasksSubmitted: number;
}

export function listClients(hubAddress: string): Promise<ClientInfo[]> {
  return new Promise((resolve) => {
    const client = createHubClient(hubAddress);
    client.ListClients({}, (err: any, response: any) => {
      client.close();
      if (err) { resolve([]); return; }
      resolve((response.clients || []).map((c: any) => ({
        clientId: c.client_id,
        name: c.name,
        registeredAt: c.registered_at,
        lastActive: c.last_active,
        tasksSubmitted: c.tasks_submitted,
      })));
    });
  });
}

// --- Storage Registration ---

export interface RegisterStorageParams {
  hubAddress: string;
  name: string;
  address: string;
  secret?: string;
}

export function registerStorage(params: RegisterStorageParams): Promise<{ success: boolean; message: string; serverId?: string }> {
  return new Promise((resolve) => {
    const client = createHubClient(params.hubAddress);
    client.RegisterStorage({ name: params.name, address: params.address, secret: params.secret || '' }, (err: any, response: any) => {
      client.close();
      if (err) {
        resolve({ success: false, message: `Registration failed: ${err.details || err.message}` });
        return;
      }
      resolve({ success: response.success, message: response.message, serverId: response.server_id });
    });
  });
}

export function unregisterStorage(hubAddress: string, serverId: string): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const client = createHubClient(hubAddress);
    client.UnregisterStorage({ server_id: serverId }, (err: any, response: any) => {
      client.close();
      if (err) {
        resolve({ success: false, message: err.details || err.message });
        return;
      }
      resolve({ success: response.success, message: response.message });
    });
  });
}

export interface StorageServerInfo {
  serverId: string;
  name: string;
  address: string;
  registeredAt: number;
}

export function listStorageServers(hubAddress: string): Promise<StorageServerInfo[]> {
  return new Promise((resolve) => {
    const client = createHubClient(hubAddress);
    client.ListStorageServers({}, (err: any, response: any) => {
      client.close();
      if (err) { resolve([]); return; }
      resolve((response.servers || []).map((s: any) => ({
        serverId: s.server_id,
        name: s.name,
        address: s.address,
        registeredAt: s.registered_at,
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
  storageServerId?: string;
  clientId?: string;
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
  const client = createHubClient(hubAddress);

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
    storage_server_id: params.storageServerId || '',
    client_id: params.clientId || '',
  };

  const deadline = new Date();
  deadline.setMilliseconds(deadline.getMilliseconds() + 300000);

  const call = client.SubmitDownload(request, { deadline });

  call.on('data', (event: any) => {
    if (event.progress) {
      onEvent({ type: 'progress', ...event.progress });
    } else if (event.log) {
      onEvent({ type: 'log', level: event.log.level, message: event.log.message });
    } else if (event.state) {
      onEvent({ type: 'state', state: event.state.state, progress: event.state.progress });
    }
  });

  call.on('error', (err: any) => {
    onError?.(err.details || err.message);
    client.close();
  });

  call.on('end', () => {
    client.close();
  });
}

// --- Health Check ---

export function pingHub(hubAddress: string): Promise<{ alive: boolean; serverId?: string; uptime?: number }> {
  return new Promise((resolve) => {
    const client = createHubClient(hubAddress);
    client.Ping({}, { deadline: new Date(Date.now() + 5000) }, (err: any, response: any) => {
      client.close();
      if (err) { resolve({ alive: false }); return; }
      resolve({ alive: response.alive, serverId: response.server_id, uptime: response.uptime });
    });
  });
}
