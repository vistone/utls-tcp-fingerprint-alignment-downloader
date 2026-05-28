import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import fs from 'fs';

const PROTO_PATH = path.join(process.cwd(), 'src/lib/proto/download_hub.proto');
const HEARTBEAT_TIMEOUT = 30000; // 30s without heartbeat = offline

let server: grpc.Server | null = null;

// --- Device Registry ---
interface Device {
  id: string;
  type: 'task_client' | 'storage_server';
  info: { name: string; ip: string; os: string; hostname: string; version: string; capabilities: Record<string, string> };
  status: { state: string; message: string; uptime: number; activeTasks: number; maxTasks: number; cpuUsage: number; memoryUsage: number; diskUsage: number; extra: Record<string, string> };
  registeredAt: number;
  lastHeartbeat: number;
  taskHistory: Array<{ taskId: string; targetUrl: string; status: string; startedAt: number; completedAt: number; storageResult: string }>;
}

const devices = new Map<string, Device>();
let deviceIdCounter = 0;

function detectDeviceIp(call: grpc.ServerUnaryCall<any, any>): string {
  const peer = call.getPeer();
  const match = peer?.match(/ipv4:(\d+\.\d+\.\d+\.\d+)/);
  return match ? match[1] : peer || 'unknown';
}

function registerDeviceHandler(type: 'task_client' | 'storage_server') {
  return (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    const { info, secret } = call.request;
    if (!info?.device_name) {
      callback(null, { success: false, message: 'Missing device_name' });
      return;
    }

    const deviceId = `${type === 'task_client' ? 'client' : 'storage'}-${++deviceIdCounter}`;
    const ip = detectDeviceIp(call);

    devices.set(deviceId, {
      id: deviceId,
      type,
      info: {
        name: info.device_name,
        ip: info.ip_address || ip,
        os: info.os || 'unknown',
        hostname: info.hostname || 'unknown',
        version: info.version || '0.0.0',
        capabilities: info.capabilities || {},
      },
      status: {
        state: 'online',
        message: 'Registered',
        uptime: 0,
        activeTasks: 0,
        maxTasks: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        extra: {},
      },
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      taskHistory: [],
    });

    console.log(`[HUB] ${type} registered: ${info.device_name} (${ip}) -> ${deviceId}`);
    callback(null, { success: true, message: `Registered as ${deviceId}`, device_id: deviceId });
  };
}

function heartbeatHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { device_id, status } = call.request;
  const device = devices.get(device_id);
  if (!device) {
    callback(null, { success: false, message: `Device ${device_id} not found` });
    return;
  }

  device.lastHeartbeat = Date.now();
  if (status) {
    device.status = {
      state: status.state || 'online',
      message: status.message || '',
      uptime: status.uptime || 0,
      activeTasks: status.active_tasks || 0,
      maxTasks: status.max_tasks || 0,
      cpuUsage: status.cpu_usage || 0,
      memoryUsage: status.memory_usage || 0,
      diskUsage: status.disk_usage || 0,
      extra: status.extra || {},
    };
  }

  callback(null, { success: true, hub_time: new Date().toISOString() });
}

function unregisterDeviceHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { device_id } = call.request;
  if (!devices.has(device_id)) {
    callback(null, { success: false, message: `Device ${device_id} not found` });
    return;
  }
  devices.delete(device_id);
  console.log(`[HUB] Device unregistered: ${device_id}`);
  callback(null, { success: true, message: `Unregistered ${device_id}` });
}

function listDevicesHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const filter = call.request.device_type || '';
  const now = Date.now();

  const list = Array.from(devices.values())
    .filter(d => !filter || d.type === filter)
    .map(d => ({
      device_id: d.id,
      device_type: d.type,
      info: {
        device_name: d.info.name,
        ip_address: d.info.ip,
        os: d.info.os,
        hostname: d.info.hostname,
        version: d.info.version,
        capabilities: d.info.capabilities,
      },
      status: {
        state: d.status.state,
        message: d.status.message,
        uptime: d.status.uptime,
        active_tasks: d.status.activeTasks,
        max_tasks: d.status.maxTasks,
        cpu_usage: d.status.cpuUsage,
        memory_usage: d.status.memoryUsage,
        disk_usage: d.status.diskUsage,
        extra: d.status.extra,
      },
      registered_at: d.registeredAt,
      last_heartbeat: d.lastHeartbeat,
      connection_state: (now - d.lastHeartbeat < HEARTBEAT_TIMEOUT) ? 'online' : 'offline',
    }));

  callback(null, { devices: list });
}

function getDeviceDetailHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { device_id } = call.request;
  const device = devices.get(device_id);
  if (!device) {
    callback(null, { device: null, tasks: [] });
    return;
  }

  const now = Date.now();
  callback(null, {
    device: {
      device_id: device.id,
      device_type: device.type,
      info: {
        device_name: device.info.name,
        ip_address: device.info.ip,
        os: device.info.os,
        hostname: device.info.hostname,
        version: device.info.version,
        capabilities: device.info.capabilities,
      },
      status: {
        state: device.status.state,
        message: device.status.message,
        uptime: device.status.uptime,
        active_tasks: device.status.activeTasks,
        max_tasks: device.status.maxTasks,
        cpu_usage: device.status.cpuUsage,
        memory_usage: device.status.memoryUsage,
        disk_usage: device.status.diskUsage,
        extra: device.status.extra,
      },
      registered_at: device.registeredAt,
      last_heartbeat: device.lastHeartbeat,
      connection_state: (now - device.lastHeartbeat < HEARTBEAT_TIMEOUT) ? 'online' : 'offline',
    },
    tasks: device.taskHistory.map(t => ({
      task_id: t.taskId,
      target_url: t.targetUrl,
      status: t.status,
      started_at: t.startedAt,
      completed_at: t.completedAt,
      storage_result: t.storageResult,
    })),
  });
}

// --- Download Task ---

function submitDownloadHandler(call: any) {
  const req = call.request;

  const sendEvent = (type: string, data: any) => {
    try { call.write({ [type]: data }); } catch (_) {}
  };
  const safeClose = () => {
    try { call.end(); } catch (_) {}
  };

  if (!req.target_url) {
    sendEvent('log', { level: 'error', message: 'Missing target_url' });
    sendEvent('state', { state: 'failed', progress: 0 });
    safeClose();
    return;
  }

  const targetStorageId = req.storage_device_id;
  if (targetStorageId && !devices.has(targetStorageId)) {
    sendEvent('log', { level: 'error', message: `Storage ${targetStorageId} not registered` });
    sendEvent('state', { state: 'failed', progress: 0 });
    safeClose();
    return;
  }

  sendEvent('state', { state: 'handshake', progress: 0 });
  sendEvent('log', { level: 'log', message: `[HUB] Task received: ${req.target_url}` });

  if (targetStorageId) {
    const storage = devices.get(targetStorageId)!;
    sendEvent('log', { level: 'log', message: `[HUB] Target storage: ${storage.info.name} (${storage.info.ip})` });
  }

  const controller = new AbortController();
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  (async () => {
    try {
      sendEvent('log', { level: 'log', message: `[HUB] Fetching: ${req.target_url}` });
      const fetchStart = Date.now();

      const response = await fetch(req.target_url, {
        headers: {
          'User-Agent': req.user_agent || 'Mozilla/5.0',
          'Accept': '*/*',
          'Accept-Encoding': 'identity',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      const statusCode = response.status;
      const contentType = response.headers.get('content-type') || 'unknown';
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

      sendEvent('log', { level: 'log', message: `[HUB] HTTP status=${statusCode} | Content-Type=${contentType}` });

      if (statusCode >= 400) {
        sendEvent('log', { level: 'error', message: `[HUB] Server returned ${statusCode}` });
        sendEvent('state', { state: 'failed', progress: 0 });
        safeClose();
        return;
      }

      sendEvent('state', { state: 'downloading', progress: 0 });

      const reader = response.body?.getReader();
      if (!reader) {
        sendEvent('log', { level: 'error', message: '[HUB] No response body' });
        sendEvent('state', { state: 'failed', progress: 0 });
        safeClose();
        return;
      }

      let receivedSize = 0;
      let lastProgressTime = 0;
      const chunks: Buffer[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedSize += value?.length || 0;
        if (value) chunks.push(Buffer.from(value));

        const now = Date.now();
        if (now - lastProgressTime >= 1000) {
          lastProgressTime = now;
          const duration = (now - fetchStart) / 1000 || 0.01;
          const speed = receivedSize / (1024 * 1024) / duration;
          const progress = contentLength > 0 ? Math.min((receivedSize / contentLength) * 100, 100) : 0;
          sendEvent('progress', { progress, speed: parseFloat(speed.toFixed(2)), received: receivedSize, total: contentLength });
        }
      }

      const finalDuration = (Date.now() - fetchStart) / 1000 || 0.01;
      const finalSize = receivedSize > 1024 * 1024
        ? `${(receivedSize / (1024 * 1024)).toFixed(2)} MB`
        : `${(receivedSize / 1024).toFixed(2)} KB`;

      sendEvent('log', { level: 'log', message: `[HUB] Download complete: ${finalSize} in ${finalDuration.toFixed(2)}s` });

      // Save locally
      const storageDir = path.join(process.cwd(), 'storage');
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      const filename = new URL(req.target_url).pathname.split('/').pop() || 'download';
      const localPath = path.join(storageDir, filename);
      const fileData = Buffer.concat(chunks);
      fs.writeFileSync(localPath, fileData);
      sendEvent('log', { level: 'log', message: `[HUB] Saved: ${localPath}` });

      // Push to registered storage
      let storageResult = 'local_only';
      if (targetStorageId) {
        const storage = devices.get(targetStorageId);
        if (storage) {
          sendEvent('log', { level: 'log', message: `[HUB] Pushing to ${storage.info.name} (${storage.info.ip})...` });
          try {
            const pushOk = await pushToStorage(storage.info.ip, filename, fileData, contentType, {
              source_url: req.target_url,
              browser_preset: req.browser_preset || '',
              client_id: req.client_id || '',
              task_id: taskId,
            });
            storageResult = pushOk ? 'pushed' : 'push_failed';
            sendEvent('log', { level: pushOk ? 'log' : 'error', message: `[HUB] Storage push ${pushOk ? 'success' : 'failed'}` });
          } catch (gErr: any) {
            storageResult = 'push_error';
            sendEvent('log', { level: 'error', message: `[HUB] Push error: ${gErr.message}` });
          }
        }
      }

      if (targetStorageId) {
        const storage = devices.get(targetStorageId);
        if (storage) {
          storage.taskHistory.push({
            taskId, targetUrl: req.target_url, status: 'completed',
            startedAt: fetchStart, completedAt: Date.now(), storageResult,
          });
        }
      }

      sendEvent('state', { state: 'completed', progress: 100 });

    } catch (err: any) {
      sendEvent('log', { level: 'error', message: `[HUB] Error: ${err.message}` });
      sendEvent('state', { state: 'failed', progress: 0 });
    }

    safeClose();
  })();

  call.on('cancelled', () => controller.abort());
}

async function pushToStorage(
  address: string, filename: string, data: Buffer, mimeType: string, metadata: Record<string, string>,
): Promise<boolean> {
  const ftProtoPath = path.join(process.cwd(), 'src/lib/proto/file_transfer.proto');
  const pkgDef = protoLoader.loadSync(ftProtoPath, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(pkgDef) as any;
  const FTService = proto.filetransfer.FileTransfer;

  return new Promise((resolve) => {
    const client = new FTService(address, grpc.credentials.createInsecure(), {
      'grpc.max_send_message_length': 1024 * 1024 * 1024,
    });
    const deadline = new Date();
    deadline.setMilliseconds(deadline.getMilliseconds() + 60000);

    client.PushFile({ filename, data, mime_type: mimeType, metadata, timestamp: Date.now() },
      { deadline }, (err: any, response: any) => {
        client.close();
        resolve(!err && response?.success);
      }
    );
  });
}

function pingHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  let connectedClients = 0;
  let connectedStorage = 0;
  const now = Date.now();
  for (const d of devices.values()) {
    if (now - d.lastHeartbeat < HEARTBEAT_TIMEOUT) {
      if (d.type === 'task_client') connectedClients++;
      else connectedStorage++;
    }
  }
  callback(null, {
    alive: true, server_id: `download-hub-${process.pid}`,
    uptime: Math.floor(process.uptime()),
    connected_clients: connectedClients,
    connected_storage: connectedStorage,
  });
}

// --- Auto-cleanup offline devices ---
setInterval(() => {
  const now = Date.now();
  for (const [id, d] of devices) {
    if (now - d.lastHeartbeat > HEARTBEAT_TIMEOUT * 3) {
      console.log(`[HUB] Auto-removed stale device: ${d.info.name} (${id})`);
      devices.delete(id);
    }
  }
}, 60000);

// --- Lifecycle ---

export function startGrpcServer(port: number = 50051): Promise<void> {
  return new Promise((resolve, reject) => {
    const Service = loadProto();
    server = new grpc.Server();

    server.addService(Service.service, {
      RegisterTaskClient: registerDeviceHandler('task_client'),
      RegisterStorageServer: registerDeviceHandler('storage_server'),
      Heartbeat: heartbeatHandler,
      UnregisterDevice: unregisterDeviceHandler,
      ListDevices: listDevicesHandler,
      GetDeviceDetail: getDeviceDetailHandler,
      SubmitDownload: submitDownloadHandler,
      Ping: pingHandler,
    });

    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
      if (err) { reject(err); return; }
      console.log(`[HUB] Download Hub listening on port ${port}`);
      resolve();
    });
  });
}

function loadProto(): grpc.ServiceClientConstructor {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  return proto.downloadhub.DownloadHub;
}

export function stopGrpcServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.tryShutdown(() => { console.log('[HUB] Stopped'); server = null; resolve(); });
    } else { resolve(); }
  });
}

export function getAllDevices() {
  const now = Date.now();
  return Array.from(devices.values()).map(d => ({
    ...d,
    connectionState: (now - d.lastHeartbeat < HEARTBEAT_TIMEOUT) ? 'online' : 'offline',
  }));
}
