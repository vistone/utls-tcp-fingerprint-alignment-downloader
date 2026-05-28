import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import fs from 'fs';

const PROTO_PATH = path.join(process.cwd(), 'src/lib/proto/file_transfer.proto');

let server: grpc.Server | null = null;
let savedFiles: Record<string, { filename: string; size: number; path: string; timestamp: number }> = {};

function loadProto(): grpc.ServiceClientConstructor {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  return proto.filetransfer.FileTransfer;
}

function pushFileHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const { filename, data, mime_type } = call.request;
  
  if (!filename || !data) {
    callback(null, {
      success: false,
      message: 'Missing filename or data',
      file_id: '',
      storage_path: '',
    });
    return;
  }
  
  const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const storageDir = path.join(process.cwd(), 'storage');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  
  const storagePath = path.join(storageDir, filename);
  
  try {
    fs.writeFileSync(storagePath, data);
    savedFiles[fileId] = { filename, size: data.length, path: storagePath, timestamp: Date.now() };
    
    console.log(`[GRPC-SERVER] Received ${filename} (${(data.length / 1024 / 1024).toFixed(2)} MB) -> ${storagePath}`);
    
    callback(null, {
      success: true,
      message: `File stored: ${filename}`,
      file_id: fileId,
      storage_path: storagePath,
    });
  } catch (err: any) {
    callback(null, {
      success: false,
      message: `Storage error: ${err.message}`,
      file_id: '',
      storage_path: '',
    });
  }
}

function pushFilesHandler(call: grpc.ServerReadableStream<any, any>, callback: grpc.sendUnaryData<any>) {
  let count = 0;
  call.on('data', (fileRequest: any) => {
    count++;
    pushFileHandler({ request: fileRequest } as any, () => {});
  });
  call.on('end', () => {
    callback(null, {
      success: true,
      message: `Received ${count} files`,
      file_id: '',
      storage_path: path.join(process.cwd(), 'storage'),
    });
  });
}

function pingHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  callback(null, {
    alive: true,
    server_id: `file-transfer-${process.pid}`,
    uptime: Math.floor(process.uptime()),
  });
}

// SubmitDownload: receives download config, streams progress back
function submitDownloadHandler(call: grpc.ServerUnaryCall<any, any>, responseStream: grpc.ServerWritableStream<any, any>) {
  const req = call.request;
  
  const sendEvent = (event: any) => {
    try { responseStream.write(event); } catch (_) {}
  };
  
  // Validate
  if (!req.target_url) {
    sendEvent({ event: { log: { level: 'error', message: 'Missing target_url' } } });
    responseStream.end({ event: { state: { state: 'failed', progress: 0 } } });
    return;
  }
  
  // Start download via internal fetch (reuse the same logic as /api/download)
  const controller = new AbortController();
  
  (async () => {
    try {
      sendEvent({ event: { state: { state: 'handshake', progress: 0 } } });
      sendEvent({ event: { log: { level: 'log', message: `[GRPC-TASK] Received download task: ${req.target_url}` } } });
      
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
      
      sendEvent({ event: { log: { level: 'log', message: `[GRPC-FETCH] Response: HTTP status=${statusCode}` } } });
      sendEvent({ event: { log: { level: 'log', message: `[GRPC-FETCH] Content-Type: ${contentType}` } } });
      sendEvent({ event: { log: { level: 'log', message: `[GRPC-FETCH-HEADERS] Content-Length: ${contentLength}` } } });
      
      if (statusCode >= 400) {
        sendEvent({ event: { log: { level: 'error', message: `[GRPC-FETCH] Server returned ${statusCode}` } } });
        responseStream.end({ event: { state: { state: 'failed', progress: 0 } } });
        return;
      }
      
      sendEvent({ event: { state: { state: 'downloading', progress: 0 } } });
      
      const reader = response.body?.getReader();
      if (!reader) {
        sendEvent({ event: { log: { level: 'error', message: '[GRPC-FETCH] No response body' } } });
        responseStream.end({ event: { state: { state: 'failed', progress: 0 } } });
        return;
      }
      
      let receivedSize = 0;
      let lastProgressTime = 0;
      
      // Collect full body for potential gRPC push
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedSize += value?.length || 0;
        chunks.push(value!);
        
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
      
      sendEvent({ event: { log: { level: 'log', message: `[GRPC-FETCH] Download complete! Size: ${finalSize}, Duration: ${finalDuration.toFixed(2)}s` } } });
      
      // Push to remote gRPC storage if configured
      let storagePath = '';
      if (req.grpc_push_enabled && req.grpc_push_server && chunks.length > 0) {
        sendEvent({ event: { log: { level: 'log', message: `[GRPC-PUSH] Pushing to ${req.grpc_push_server}...` } } });
        
        try {
          const { pushFile } = await import('./grpc-client');
          const fileData = Buffer.concat(chunks.map(c => Buffer.from(c)));
          const filename = new URL(req.target_url).pathname.split('/').pop() || 'download';
          
          const pushResult = await pushFile({
            serverAddress: req.grpc_push_server,
            filename,
            data: fileData,
            mimeType: contentType,
            metadata: {
              source_url: req.target_url,
              download_duration: `${finalDuration.toFixed(2)}s`,
              download_size: `${receivedSize}`,
              browser_preset: req.browser_preset || '',
            },
          });
          
          if (pushResult.success) {
            storagePath = pushResult.storagePath || '';
            sendEvent({ event: { log: { level: 'log', message: `[GRPC-PUSH] Success: ${filename} -> ${storagePath}` } } });
          } else {
            sendEvent({ event: { log: { level: 'error', message: `[GRPC-PUSH] Failed: ${pushResult.message}` } } });
          }
        } catch (gErr: any) {
          sendEvent({ event: { log: { level: 'error', message: `[GRPC-PUSH] Error: ${gErr.message}` } } });
        }
      }
      
      // Also save locally
      const storageDir = path.join(process.cwd(), 'storage');
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      const filename = new URL(req.target_url).pathname.split('/').pop() || 'download';
      const localPath = path.join(storageDir, filename);
      fs.writeFileSync(localPath, Buffer.concat(chunks.map(c => Buffer.from(c))));
      
      sendEvent({ event: { state: { state: 'completed', progress: 100 } } });
      
    } catch (err: any) {
      sendEvent({ event: { log: { level: 'error', message: `[GRPC-TASK] Error: ${err.message}` } } });
      sendEvent({ event: { state: { state: 'failed', progress: 0 } } });
    }
    
    responseStream.end();
  })();
  
  // Handle client disconnect
  call.on('cancelled', () => {
    controller.abort();
  });
}

export function startGrpcServer(port: number = 50051): Promise<void> {
  return new Promise((resolve, reject) => {
    const Service = loadProto();
    server = new grpc.Server();
    
    server.addService(Service.service, {
      PushFile: pushFileHandler,
      PushFiles: pushFilesHandler,
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
        console.log(`[GRPC-SERVER] gRPC server listening on port ${port}`);
        resolve();
      }
    );
  });
}

export function stopGrpcServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.tryShutdown(() => {
        console.log('[GRPC-SERVER] gRPC server stopped');
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export function getSavedFiles() {
  return savedFiles;
}
