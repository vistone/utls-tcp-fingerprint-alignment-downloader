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
  grpcPushEnabled?: boolean;
  grpcPushServer?: string;
}

export type DownloadEvent = {
  type: 'progress';
  progress: number;
  speed: number;
  received: number;
  total: number;
} | {
  type: 'log';
  level: string;
  message: string;
} | {
  type: 'state';
  state: string;
  progress: number;
};

export function submitDownload(
  serverAddress: string,
  params: DownloadTaskParams,
  onEvent: (event: DownloadEvent) => void,
  onError?: (error: string) => void,
): void {
  const Service = getService();
  const client = new Service(serverAddress, grpc.credentials.createInsecure());
  
  const request = {
    target_url: params.targetUrl,
    browser_preset: params.browserPreset || 'chrome',
    user_agent: params.userAgent || 'Mozilla/5.0',
    tcp_ttl: params.tcpTtl || 128,
    tcp_mss: params.tcpMss || 1460,
    tcp_window_size: params.tcpWindowSize || 65535,
    h2_window_increment: params.h2WindowIncrement || 6291456,
    connection_reuse: params.connectionReuse ?? true,
    use_proxy: false,
    cdn_type: params.cdnType || 'cloudflare',
    grpc_push_enabled: params.grpcPushEnabled ?? false,
    grpc_push_server: params.grpcPushServer || '',
  };
  
  const deadline = new Date();
  deadline.setMilliseconds(deadline.getMilliseconds() + 300000); // 5 min timeout
  
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
