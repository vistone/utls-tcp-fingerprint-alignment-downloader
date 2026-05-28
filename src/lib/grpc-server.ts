import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import fs from 'fs';

const PROTO_PATH = path.join(process.cwd(), 'src/lib/proto/download_hub.proto');

let server: grpc.Server | null = null;
let clientIdCounter = 0;
let storageIdCounter = 0;

// --- Client (Task Sender) Registry ---
interface RegisteredClient {
  clientId: string;
  name: string;
  registeredAt: number;
  lastActive: number;
  tasksSubmitted: number;
}

const clients = new Map<string, RegisteredClient>();

// --- Storage Server Registry ---
interface RegisteredStorage {
  serverId: string;
  name: string;
  address: string;
  registeredAt: number;
}

const storageServers = new Map<string, RegisteredStorage>();

function loadProto(): grpc.ServiceClientConstructor {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  return proto.downloadhub.DownloadHub;
}

// --- Client Registration ---

function registerClientHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { name } = call.request;
  if (!name) {
    callback(null, { success: false, message: 'Missing name' });
    return;
  }

  const clientId = `client-${++clientIdCounter}`;
  const now = Date.now();
  clients.set(clientId, { clientId, name, registeredAt: now, lastActive: now, tasksSubmitted: 0 });

  console.log(`[HUB] Client registered: ${name} -> ${clientId}`);
  callback(null, { success: true, message: `Registered as ${clientId}`, client_id: clientId });
}

function unregisterClientHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { client_id } = call.request;
  if (!client_id) {
    callback(null, { success: false, message: 'Missing client_id' });
    return;
  }
  clients.delete(client_id);
  console.log(`[HUB] Client unregistered: ${client_id}`);
  callback(null, { success: true, message: `Unregistered ${client_id}` });
}

function listClientsHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const list = Array.from(clients.values()).map(c => ({
    client_id: c.clientId,
    name: c.name,
    registered_at: c.registeredAt,
    last_active: c.lastActive,
    tasks_submitted: c.tasksSubmitted,
  }));
  callback(null, { clients: list });
}

// --- Storage Registration ---

function registerStorageHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { name, address } = call.request;
  if (!name || !address) {
    callback(null, { success: false, message: 'Missing name or address' });
    return;
  }

  const serverId = `storage-${++storageIdCounter}`;
  storageServers.set(serverId, { serverId, name, address, registeredAt: Date.now() });

  console.log(`[HUB] Storage registered: ${name} (${address}) -> ${serverId}`);
  callback(null, { success: true, message: `Registered as ${serverId}`, server_id: serverId });
}

function unregisterStorageHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { server_id } = call.request;
  if (!server_id) {
    callback(null, { success: false, message: 'Missing server_id' });
    return;
  }
  storageServers.delete(server_id);
  callback(null, { success: true, message: `Unregistered ${server_id}` });
}

function listStorageServersHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const list = Array.from(storageServers.values()).map(s => ({
    server_id: s.serverId,
    name: s.name,
    address: s.address,
    registered_at: s.registeredAt,
    status: 'online',
  }));
  callback(null, { servers: list });
}

// --- Download Task ---

function submitDownloadHandler(call: grpc.ServerUnaryCall<any, any>, responseStream: grpc.ServerWritableStream<any, any>) {
  const req = call.request;
  const clientId = req.client_id || 'unknown';

  const sendEvent = (event: any) => {
    try { responseStream.write(event); } catch (_) {}
  };
  const safeClose = () => {
    try { responseStream.end(); } catch (_) {}
  };

  if (!req.target_url) {
    sendEvent({ event: { log: { level: 'error', message: 'Missing target_url' } } });
    sendEvent({ event: { state: { state: 'failed', progress: 0 } } });
    safeClose();
    return;
  }

  // Update client activity
  const client = clients.get(clientId);
  if (client) {
    client.lastActive = Date.now();
    client.tasksSubmitted++;
  }

  const targetStorageId = req.storage_server_id;
  if (targetStorageId && !storageServers.has(targetStorageId)) {
    sendEvent({ event: { log: { level: 'error', message: `Storage ${targetStorageId} not registered` } } });
    sendEvent({ event: { state: { state: 'failed', progress: 0 } } });
    safeClose();
    return;
  }

  sendEvent({ event: { state: { state: 'handshake', progress: 0 } } });
  sendEvent({ event: { log: { level: 'log', message: `[HUB] Task from ${clientId}: ${req.target_url}` } } });

  if (targetStorageId) {
    const storage = storageServers.get(targetStorageId)!;
    sendEvent({ event: { log: { level: 'log', message: `[HUB] Target storage: ${storage.name} (${storage.address})` } } });
  }

  const controller = new AbortController();

  (async () => {
    try {
      sendEvent({ event: { log: { level: 'log', message: `[HUB] Fetching: ${req.target_url}` } } });
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

      sendEvent({ event: { log: { level: 'log', message: `[HUB] HTTP status=${statusCode} | Content-Type=${contentType}` } } });

      if (statusCode >= 400) {
        sendEvent({ event: { log: { level: 'error', message: `[HUB] Server returned ${statusCode}` } } });
        sendEvent({ event: { state: { state: 'failed', progress: 0 } } });
        safeClose();
        return;
      }

      sendEvent({ event: { state: { state: 'downloading', progress: 0 } } });

      const reader = response.body?.getReader();
      if (!reader) {
        sendEvent({ event: { log: { level: 'error', message: '[HUB] No response body' } } });
        sendEvent({ event: { state: { state: 'failed', progress: 0 } } });
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
          sendEvent({ event: { progress: { progress, speed: parseFloat(speed.toFixed(2)), received: receivedSize, total: contentLength } } });
        }
      }

      const finalDuration = (Date.now() - fetchStart) / 1000 || 0.01;
      const finalSize = receivedSize > 1024 * 1024
        ? `${(receivedSize / (1024 * 1024)).toFixed(2)} MB`
        : `${(receivedSize / 1024).toFixed(2)} KB`;

      sendEvent({ event: { log: { level: 'log', message: `[HUB] Download complete: ${finalSize} in ${finalDuration.toFixed(2)}s` } } });

      // Save locally
      const storageDir = path.join(process.cwd(), 'storage');
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      const filename = new URL(req.target_url).pathname.split('/').pop() || 'download';
      const localPath = path.join(storageDir, filename);
      const fileData = Buffer.concat(chunks);
      fs.writeFileSync(localPath, fileData);
      sendEvent({ event: { log: { level: 'log', message: `[HUB] Saved: ${localPath}` } } });

      // Push to registered storage
      if (targetStorageId) {
        const storage = storageServers.get(targetStorageId);
        if (storage) {
          sendEvent({ event: { log: { level: 'log', message: `[HUB] Pushing to ${storage.name}...` } } });
          try {
            const pushResult = await pushToStorage(storage.address, filename, fileData, contentType, {
              source_url: req.target_url,
              browser_preset: req.browser_preset || '',
              client_id: clientId,
            });
            sendEvent({ event: { log: { level: pushResult.success ? 'log' : 'error', message: `[HUB] Push ${pushResult.success ? 'success' : 'failed'}: ${pushResult.message}` } } });
          } catch (gErr: any) {
            sendEvent({ event: { log: { level: 'error', message: `[HUB] Push error: ${gErr.message}` } } });
          }
        }
      }

      sendEvent({ event: { state: { state: 'completed', progress: 100 } } });

    } catch (err: any) {
      sendEvent({ event: { log: { level: 'error', message: `[HUB] Error: ${err.message}` } } });
      sendEvent({ event: { state: { state: 'failed', progress: 0 } } });
    }

    safeClose();
  })();

  call.on('cancelled', () => controller.abort());
}

async function pushToStorage(
  address: string,
  filename: string,
  data: Buffer,
  mimeType: string,
  metadata: Record<string, string>,
): Promise<{ success: boolean; message: string }> {
  const ftProtoPath = path.join(process.cwd(), 'src/lib/proto/file_transfer.proto');
  const pkgDef = protoLoader.loadSync(ftProtoPath, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(pkgDef) as any;
  const FTService = proto.filetransfer.FileTransfer;

  return new Promise((resolve) => {
    const client = new FTService(address, grpc.credentials.createInsecure());
    const deadline = new Date();
    deadline.setMilliseconds(deadline.getMilliseconds() + 60000);

    client.PushFile({
      filename, data, mime_type: mimeType, metadata, timestamp: Date.now(),
    }, { deadline }, (err: any, response: any) => {
      client.close();
      if (err) {
        resolve({ success: false, message: err.details || err.message });
        return;
      }
      resolve({ success: response.success, message: response.message });
    });
  });
}

function pingHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  callback(null, {
    alive: true,
    server_id: `download-hub-${process.pid}`,
    uptime: Math.floor(process.uptime()),
  });
}

// --- Lifecycle ---

export function startGrpcServer(port: number = 50051): Promise<void> {
  return new Promise((resolve, reject) => {
    const Service = loadProto();
    server = new grpc.Server();

    server.addService(Service.service, {
      RegisterClient: registerClientHandler,
      UnregisterClient: unregisterClientHandler,
      ListClients: listClientsHandler,
      RegisterStorage: registerStorageHandler,
      UnregisterStorage: unregisterStorageHandler,
      ListStorageServers: listStorageServersHandler,
      SubmitDownload: submitDownloadHandler as any,
      Ping: pingHandler,
    });

    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`[HUB] Download Hub listening on port ${port}`);
        resolve();
      }
    );
  });
}

export function stopGrpcServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.tryShutdown(() => {
        console.log('[HUB] gRPC server stopped');
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export function getClients() {
  return Array.from(clients.values());
}

export function getStorageServers() {
  return Array.from(storageServers.values());
}
