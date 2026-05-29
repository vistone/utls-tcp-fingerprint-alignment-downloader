import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

const PROTO_PATH = path.join(process.cwd(), 'sidecar', 'proto', 'sidecar.proto');
let FingerprintService: any = null;

function getService() {
  if (FingerprintService) return FingerprintService;
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  FingerprintService = proto.sidecar.FingerprintDownloader;
  return FingerprintService!;
}

function createClient(address: string = 'localhost:50053'): any {
  return new (getService())(address, grpc.credentials.createInsecure());
}

export interface SidecarDownloadRequest {
  targetUrl: string;
  browserPreset: string;
  tcpTtl: number;
  tcpMss: number;
  tcpWindowScale: number;
  tcpSack: boolean;
  tcpTimestamps: boolean;
  tcpWindowSize: number;
  userAgent: string;
  enableGrease: boolean;
  h2WindowIncrement: number;
  proxy?: {
    mode: 'DIRECT' | 'SOCKS5' | 'HTTP_CONNECT';
    nodes: Array<{
      host: string; port: number; username?: string; password?: string;
      bindIp?: string; region?: string; weight?: number;
    }>;
    rotationStrategy?: string;
  };
  dns?: { enabled: boolean; servers: string[]; timeoutMs: number; parallel: boolean; cacheEnabled: boolean; };
  cdnType?: string;  // "cloudflare" | "akamai" | "incapsula" | "custom" | ""
}

export type SidecarEvent =
  | { type: 'log'; message: string }
  | { type: 'progress'; progress: number; speedMbps: number; receivedBytes: number; totalBytes: number }
  | { type: 'state'; state: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'tls_info'; ja4: string; ja3: string; cipherSuite: string; tlsVersion: string; alpn: string }
  | { type: 'tcp_info'; actualTtl: number; actualMss: number; actualWindowScale: number; actualSack: boolean; actualTimestamps: boolean; sourceIp: string; destIp: string; proxyUsed?: string }
  | { type: 'complete'; totalBytes: number; durationSeconds: number; avgSpeedMbps: number };

/**
 * 通过 Go sidecar 执行带完整指纹控制的下载
 * - TCP SYN 参数（TTL/MSS/WindowScale/SACK/Timestamps）由 gvisor 用户态 TCP 栈真实修改
 * - TLS ClientHello 由 uTLS 逐字节模拟浏览器指纹
 * - 支持 SOCKS5/HTTP CONNECT 代理池隐藏出口 IP
 */
export function downloadWithFingerprint(
  address: string,
  req: SidecarDownloadRequest,
  onEvent: (event: SidecarEvent) => void,
  onError?: (error: string) => void,
  onEnd?: () => void,
): grpc.ClientReadableStream<any> {
  const client = createClient(address);

  const protoReq: any = {
    target_url: req.targetUrl,
    browser_preset: req.browserPreset,
    tcp_ttl: req.tcpTtl,
    tcp_mss: req.tcpMss,
    tcp_window_scale: req.tcpWindowScale,
    tcp_sack: req.tcpSack,
    tcp_timestamps: req.tcpTimestamps,
    tcp_window_size: req.tcpWindowSize,
    user_agent: req.userAgent,
    enable_grease: req.enableGrease,
    h2_window_increment: req.h2WindowIncrement,
    cdn_type: req.cdnType || '',
  };

  if (req.proxy && req.proxy.nodes.length > 0) {
    protoReq.proxy = {
      mode: req.proxy.mode === 'SOCKS5' ? 1 : req.proxy.mode === 'HTTP_CONNECT' ? 2 : 0,
      nodes: req.proxy.nodes.map(n => ({
        host: n.host, port: n.port, username: n.username || '', password: n.password || '',
        bind_ip: n.bindIp || '', region: n.region || '', weight: n.weight || 1,
      })),
      rotation_strategy: req.proxy.rotationStrategy || 'round_robin',
    };
  }

  const deadline = new Date();
  deadline.setSeconds(deadline.getSeconds() + 300);

  const call = client.Download(protoReq, { deadline });

  call.on('data', (event: any) => {
    if (event.log) onEvent({ type: 'log', message: event.log.message });
    else if (event.progress) onEvent({ type: 'progress', ...event.progress });
    else if (event.state) onEvent({ type: 'state', state: event.state.state });
    else if (event.error) onEvent({ type: 'error', message: event.error.message, code: event.error.code });
    else if (event.tls_info) onEvent({ type: 'tls_info', ...event.tls_info });
    else if (event.tcp_info) onEvent({ type: 'tcp_info', ...event.tcp_info });
    else if (event.complete) onEvent({ type: 'complete', ...event.complete });
  });

  call.on('error', (err: any) => {
    onError?.(err.details || err.message);
    client.close();
  });

  call.on('end', () => {
    client.close();
    onEnd?.();
  });

  return call;
}

export async function pingSidecar(address: string = 'localhost:50053'): Promise<{ alive: boolean; version?: string; uptimeSeconds?: number }> {
  return new Promise((resolve) => {
    const client = createClient(address);
    client.Ping({}, { deadline: new Date(Date.now() + 5000) }, (err: any, response: any) => {
      client.close();
      if (err) { resolve({ alive: false }); return; }
      resolve({ alive: true, version: response.version, uptimeSeconds: response.uptime_seconds });
    });
  });
}
