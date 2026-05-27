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
  const { filename, data, mime_type, metadata } = call.request;
  
  if (!filename || !data) {
    callback(null, {
      success: false,
      message: 'Missing filename or data',
      file_id: '',
      storage_path: '',
    });
    return;
  }
  
  // Generate storage path
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

export function startGrpcServer(port: number = 50051): Promise<void> {
  return new Promise((resolve, reject) => {
    const Service = loadProto();
    server = new grpc.Server();
    
    server.addService(Service.service, {
      PushFile: pushFileHandler,
      PushFiles: pushFilesHandler,
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
        console.log(`[GRPC-SERVER] gRPC file transfer server listening on port ${port}`);
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
