import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

const PROTO_PATH = path.join(process.cwd(), 'src/lib/proto/file_transfer.proto');

// Load proto definition
let FileTransferService: grpc.ServiceClientConstructor | null = null;

function getService(): grpc.ServiceClientConstructor {
  if (FileTransferService) return FileTransferService;
  
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  FileTransferService = proto.filetransfer.FileTransfer;
  return FileTransferService!;
}

export interface PushFileOptions {
  serverAddress: string;  // e.g. "192.168.1.10:50051"
  filename: string;
  data: Buffer;
  mimeType: string;
  metadata?: Record<string, string>;
  timeoutMs?: number;
}

export interface PushFileResult {
  success: boolean;
  message: string;
  fileId?: string;
  storagePath?: string;
}

export function pushFile(options: PushFileOptions): Promise<PushFileResult> {
  const { serverAddress, filename, data, mimeType, metadata = {}, timeoutMs = 30000 } = options;
  
  return new Promise((resolve) => {
    const Service = getService();
    const client = new Service(serverAddress, grpc.credentials.createInsecure());
    
    const deadline = new Date();
    deadline.setMilliseconds(deadline.getMilliseconds() + timeoutMs);
    
    const fileRequest = {
      filename,
      data,
      mime_type: mimeType,
      metadata,
      timestamp: Date.now(),
    };
    
    client.PushFile(fileRequest, { deadline }, (err: any, response: any) => {
      client.close();
      if (err) {
        resolve({
          success: false,
          message: `gRPC push failed: ${err.details || err.message}`,
        });
        return;
      }
      resolve({
        success: response.success,
        message: response.message,
        fileId: response.file_id,
        storagePath: response.storage_path,
      });
    });
  });
}

export interface PingResult {
  alive: boolean;
  serverId?: string;
  uptime?: number;
}

export function pingServer(serverAddress: string, timeoutMs = 5000): Promise<PingResult> {
  return new Promise((resolve) => {
    const Service = getService();
    const client = new Service(serverAddress, grpc.credentials.createInsecure());
    
    const deadline = new Date();
    deadline.setMilliseconds(deadline.getMilliseconds() + timeoutMs);
    
    client.Ping({}, { deadline }, (err: any, response: any) => {
      client.close();
      if (err) {
        resolve({ alive: false });
        return;
      }
      resolve({
        alive: response.alive,
        serverId: response.server_id,
        uptime: response.uptime,
      });
    });
  });
}
