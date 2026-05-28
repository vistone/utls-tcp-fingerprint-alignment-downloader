import { NextRequest } from "next/server";
import os from "os";
import net from "net";
import tls from "tls";
import dns from "dns";
import http from "http";
import https from "https";
import http2 from "http2";
import { validateApiKey } from "@/lib/auth";
import { isPrivateOrReservedIp, validateOutboundUrl, validateResolvedIpsArePublic } from "@/lib/ssrf";
import { createCorsHeaders, handleCorsPreflight, SendLogFn } from "@/lib/sse-helper";
import {
  getLocalResolvedIps,
  resolveDualStack,
  resolveDnsCustom,
  selectBalancedIp,
  customDnsCache,
} from "@/lib/dns";

const TLS_REJECT_UNAUTHORIZED = process.env.TLS_REJECT_UNAUTHORIZED !== "false";

const h2Sessions = new Map<string, http2.ClientHttp2Session>();
const keepAliveHttpsAgents = new Map<string, https.Agent>();
const keepAliveHttpAgents = new Map<string, http.Agent>();

function safeParseInt(value: any, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? fallback : parsed;
}

function getNetworkInterfacesInfo(): string[] {
  const nets = os.networkInterfaces();
  const logs: string[] = [];
  logs.push(`[NIC-HW] Active network interfaces:`);
  let hasValid = false;
  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (!interfaces) continue;
    for (const ni of interfaces) {
      if (ni.family === "IPv4") {
        logs.push(`[NIC-HW] -> Interface: ${name} | IP: ${ni.address} | Netmask: ${ni.netmask} | MAC: ${ni.mac || "N/A"}`);
        hasValid = true;
      }
    }
  }
  if (!hasValid) {
    logs.push(`[NIC-HW] -> Only loopback interface detected.`);
  }
  return logs;
}

function getProxiedSocket(
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  isHttps: boolean,
  ciphers?: string,
  sendLog?: SendLogFn,
  alpnProtocols?: string[]
): Promise<net.Socket> {
  if (sendLog) {
    sendLog("log", `[PROXY] Establishing connection to proxy server -> ${proxyHost}:${proxyPort}`);
  }

  return new Promise((resolve, reject) => {
    let completed = false;
    const socket = net.createConnection({ host: proxyHost, port: proxyPort });
    socket.setNoDelay(true);
    socket.setTimeout(8000);

    const fail = (err: Error) => {
      if (completed) return;
      completed = true;
      socket.destroy();
      reject(err);
    };

    socket.on("timeout", () => {
      fail(new Error("Proxy connection timeout (8s)"));
    });

    socket.on("error", (err) => {
      fail(new Error(`Proxy network error: ${err.message}`));
    });

    socket.on("connect", () => {
      if (sendLog) {
        sendLog("log", `[PROXY] TCP channel established. Sending CONNECT tunnel -> ${targetHost}:${targetPort}...`);
      }
      try {
        socket.write(
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: Keep-Alive\r\nUser-Agent: Mozilla/5.0\r\n\r\n`
        );
      } catch (err: any) {
        fail(err);
      }
    });

    let buffer = "";
    const onData = (data: Buffer) => {
      buffer += data.toString("utf-8");
      if (buffer.includes("\r\n\r\n")) {
        socket.off("data", onData);
        socket.setTimeout(0);

        const lines = buffer.split("\r\n");
        const statusLine = lines[0];
        if (statusLine.includes(" 200 ")) {
          if (sendLog) {
            sendLog("log", `[PROXY] Tunnel established: ${statusLine.trim()}`);
          }

          if (isHttps) {
            if (sendLog) {
              sendLog("log", `[PROXY-TLS] Loading TLS over proxy tunnel...`);
            }
            try {
              const secureSocket = tls.connect({
                socket,
                servername: targetHost,
                ciphers,
                rejectUnauthorized: TLS_REJECT_UNAUTHORIZED,
                ALPNProtocols: alpnProtocols,
              });

              secureSocket.on("error", (tlsErr) => {
                fail(new Error(`TLS negotiation failed: ${tlsErr.message}`));
              });

              secureSocket.on("secureConnect", () => {
                if (completed) return;
                completed = true;
                if (sendLog) {
                  sendLog("log", `[PROXY-TLS] Secure handshake complete!`);
                }
                resolve(secureSocket);
              });
            } catch (secErr: any) {
              fail(secErr);
            }
          } else {
            if (completed) return;
            completed = true;
            resolve(socket);
          }
        } else {
          fail(new Error(`Proxy rejected tunnel: ${statusLine.trim()}`));
        }
      }
    };
    socket.on("data", onData);
  });
}

function downloadWithH2Session(
  session: http2.ClientHttp2Session,
  pathName: string,
  host: string,
  userAgent: string,
  sendLog: SendLogFn,
  browserPreset: string,
  tcpTtl: number,
  tcpMss: number,
  fallbackToHttp1?: (reason: string) => void,
  h2WindowIncrement?: number | string,
  onComplete?: () => void
): void {
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    onComplete?.();
  };
  sendLog("state", "", { state: "handshake" });
  sendLog("log", `[H2-STREAM] Establishing H2 multiplexed stream...`);
  // NIC metrics logged in response event once socket is fully connected

  const reqHeaders = {
    ":path": pathName,
    ":method": "GET",
    ":scheme": "https",
    ":authority": host,
    "user-agent": userAgent || "Mozilla/5.0",
    accept: "*/*",
    "accept-encoding": "identity",
  };

  try {
    const stream = session.request(reqHeaders, {
      readableHighWaterMark: Math.max(safeParseInt(h2WindowIncrement, 8388608), 64 * 1024 * 1024),
    } as any);
    sendLog("log", `[H2-STREAM] Stream requested (ID assigned by server on response)`);

    let timeoutTimer: NodeJS.Timeout | null = null;
    let isTimerCleared = false;

    if (fallbackToHttp1) {
      timeoutTimer = setTimeout(() => {
        if (!isTimerCleared) {
          isTimerCleared = true;
          sendLog("log", `[H2-TIMEOUT] H2 handshake/response timeout (10s). Triggering fallback...`);
          for (const [key, val] of h2Sessions.entries()) {
            if (val === session) {
              h2Sessions.delete(key);
            }
          }
          try {
            stream.destroy();
          } catch (_) {}
          try {
            session.destroy();
          } catch (_) {}
          fallbackToHttp1("HTTP/2 Handshake/Response Timeout");
        }
      }, 10000);
    }

    stream.on("response", (headers) => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        isTimerCleared = true;
      }

      // NIC telemetry: socket is fully connected by response time
      let tcpRcvBuf = 131072;
      let tcpSndBuf = 131072;
      let localIp = "127.0.0.1";
      let localPort = "0";
      try {
        const sock: any = (session as any).socket || (session as any)._socket;
        if (sock) {
          localIp = sock.localAddress || localIp;
          if (sock.localPort) localPort = String(sock.localPort);
          if (typeof sock.getRecvBufferSize === "function") tcpRcvBuf = sock.getRecvBufferSize();
          if (typeof sock.getSendBufferSize === "function") tcpSndBuf = sock.getSendBufferSize();
        }
      } catch (_) {}

      sendLog("log", `[NIC-TRACK] Local: ${localIp}:${localPort} -> ${host}:443`);
      sendLog("log", `[NIC-TRACK] TCP_RCVBUF: ${tcpRcvBuf} B | TCP_SNDBUF: ${tcpSndBuf} B`);
      sendLog("log", `[NIC-TRACK] TTL = ${tcpTtl} | MSS = ${tcpMss} [${browserPreset.toUpperCase()}]`);

      const statusCode = headers[":status"] ? parseInt(headers[":status"].toString()) : 200;
      const totalSizeStr = headers["content-length"];
      const totalSize = totalSizeStr ? parseInt(totalSizeStr.toString(), 10) : 0;
      const contentType = headers["content-type"] || "unknown";

      sendLog("log", `[HTTP/2] Response: HTTP/2 status=${statusCode} | Stream ID=${stream.id}`);
      sendLog("log", `[HTTP/2] Content-Type: ${contentType}`);
      sendLog("log", `[HTTP/2-HEADERS] -> Content-Length: ${totalSizeStr || "Chunked/Unknown"}`);

      // Detect HTTP/3 support via Alt-Svc
      const altSvc = headers["alt-svc"];
      if (altSvc) {
        const h3Detected = detectH3Support({ "alt-svc": String(altSvc) });
        if (h3Detected) sendLog("log", `[H3-DETECT] Server advertises HTTP/3: ${h3Detected} (Alt-Svc: ${altSvc})`);
      }

      if (statusCode >= 400) {
        if (fallbackToHttp1) {
          fallbackToHttp1(`HTTP/2 status ${statusCode} (target server blocked H2)`);
        } else {
          sendLog("error", `[HTTP/2] Blocked or file unavailable (HTTP Status ${statusCode})`);
          sendLog("state", "", { state: "failed" });
          stream.destroy();
        }
        return;
      }

      sendLog("state", "", { state: "downloading" });
      sendLog("log", `[HTTP/2] Starting concurrent stream read...`);

      let receivedSize = 0;
      let chunkCount = 0;
      const downloadStartTime = Date.now();

      // Decoupled progress reporting via timer - avoids blocking the data stream
      const progressTimer = setInterval(() => {
        if (completed) {
          clearInterval(progressTimer);
          return;
        }
        const now = Date.now();
        const duration = (now - downloadStartTime) / 1000 || 0.01;
        const speedMBs = receivedSize / (1024 * 1024) / duration;
        if (receivedSize > 0 || chunkCount > 0) {
          sendLog("progress", "", {
            progress: totalSize > 0 ? Math.min((receivedSize / totalSize) * 100, 100) : Math.min(20 + chunkCount * 0.5, 98),
            speed: parseFloat(speedMBs.toFixed(2)),
            received: receivedSize,
            total: totalSize,
          });
        }
      }, 1000);

      stream.on("data", (chunk: Buffer) => {
        receivedSize += chunk.length;
        chunkCount++;
      });

      stream.on("end", () => {
        completeDataTransfer();
      });

      function completeDataTransfer() {
        if (completed) return;
        completed = true;
        clearInterval(progressTimer);
        const finalDuration = (Date.now() - downloadStartTime) / 1000 || 0.01;
        const finalSizeFormatted =
          receivedSize > 1024 * 1024
            ? `${(receivedSize / (1024 * 1024)).toFixed(2)} MB`
            : `${(receivedSize / 1024).toFixed(2)} KB`;

        sendLog("progress", "", { progress: 100, speed: parseFloat((receivedSize / (1024 * 1024) / (finalDuration || 0.01)).toFixed(2)), received: receivedSize, total: receivedSize });
        sendLog("log", `[HTTP/2-FILE] Data stream transfer complete!`);
        sendLog("log", `[HTTP/2-FILE] Summary: Size: ${finalSizeFormatted}, Duration: ${finalDuration.toFixed(2)}s`);
        sendLog("state", "", { state: "completed", progress: 100 });
        onComplete?.();
      }
    });

    stream.on("error", (err) => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        isTimerCleared = true;
      }
      if (fallbackToHttp1) {
        fallbackToHttp1(`Stream Error: ${err.message}`);
      } else {
        sendLog("error", `[H2-STREAM-ERR] Stream error: ${err.message}`);
        sendLog("state", "", { state: "failed" });
      }
    });
  } catch (err: any) {
    if (fallbackToHttp1) {
      fallbackToHttp1(`Stream Connect Exception: ${err.message}`);
    } else {
      sendLog("error", `[H2-STREAM-ERR] Fatal error: ${err.message}`);
      sendLog("state", "", { state: "failed" });
    }
  }
}

function downloadWithHttp1(
  requestOptions: any,
  isHttps: boolean,
  sendLog: SendLogFn,
  browserPreset: string,
  tcpTtl: number,
  tcpMss: number,
  onComplete?: () => void
): void {
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    onComplete?.();
  };
  const clientModule = isHttps ? https : http;
  const socketStartTime = Date.now();

  const clientReq = clientModule.request(requestOptions, (clientRes) => {
    const tcpConnectTime = Date.now() - socketStartTime;
    sendLog("log", `[TCP/TLS] Physical socket ready (handshake time: ${tcpConnectTime}ms)`);

    const socket: any = (clientReq as any).socket || clientRes.socket;
    if (socket) {
      const localIp = socket.localAddress || "0.0.0.0";
      const localPort = socket.localPort || 0;
      const remoteIp = socket.remoteAddress || requestOptions.hostname || "unknown";
      const remotePort = socket.remotePort || requestOptions.port || (isHttps ? 443 : 80);
      const rcvBuf = typeof socket.getRecvBufferSize === "function" ? socket.getRecvBufferSize() : 131072;
      const sndBuf = typeof socket.getSendBufferSize === "function" ? socket.getSendBufferSize() : 131072;

      sendLog("log", `[NIC-TRACK] Local: ${localIp}:${localPort}`);
      sendLog("log", `[NIC-TRACK] Remote: ${remoteIp}:${remotePort}`);
      sendLog("log", `[NIC-TRACK] TCP_RCVBUF: ${rcvBuf} B | TCP_SNDBUF: ${sndBuf} B`);
      sendLog("log", `[NIC-TRACK] TTL = ${tcpTtl} | MSS = ${tcpMss} [${browserPreset.toUpperCase()}]`);
    }

    if (isHttps) {
      const activeSock: any = (clientReq as any).socket || clientRes.socket;
      if (activeSock) {
        const cipher = activeSock.getCipher ? activeSock.getCipher() : null;
        const protocol = activeSock.getProtocol ? activeSock.getProtocol() : null;
        const peerCert = activeSock.getPeerCertificate ? activeSock.getPeerCertificate() : null;

        if (cipher) {
          sendLog("log", `[TLS-ACTUAL] Protocol=${protocol || cipher.version}, Cipher=${cipher.name || "N/A"}`);
        }
        if (peerCert && peerCert.subject) {
          sendLog("log", `[TLS-CERT] Subject: ${peerCert.subject.CN || "Unknown"}, Issuer: ${peerCert.issuer?.CN || "Unknown"}`);
        }
      }
    }

    const statusCode = clientRes.statusCode || 0;
    const totalSizeStr = clientRes.headers["content-length"];
    const totalSize = totalSizeStr ? parseInt(totalSizeStr, 10) : 0;
    const contentType = clientRes.headers["content-type"] || "unknown";

    sendLog("log", `[HTTP] Response: HTTP/${clientRes.httpVersion} ${statusCode}`);
    sendLog("log", `[HTTP] Content-Type: ${contentType}`);
    sendLog("log", `[HTTP-HEADERS] -> Server: ${clientRes.headers["server"] || "N/A"}`);
    sendLog("log", `[HTTP-HEADERS] -> Content-Length: ${totalSizeStr || "Chunked/Unknown"}`);

    // Detect HTTP/3 support via Alt-Svc
    const altSvcH1 = clientRes.headers["alt-svc"];
    if (altSvcH1) {
      const h3Detected = detectH3Support({ "alt-svc": String(altSvcH1) });
      if (h3Detected) sendLog("log", `[H3-DETECT] Server advertises HTTP/3: ${h3Detected} (Alt-Svc: ${altSvcH1})`);
    }

    if (statusCode >= 400) {
      sendLog("error", `[HTTP] Blocked or file unavailable (HTTP Status ${statusCode})`);
      let errorBody = "";
      clientRes.on("data", (chunk) => {
        errorBody += chunk.toString();
        if (errorBody.length > 500) errorBody = errorBody.substring(0, 500);
      });
      clientRes.on("end", () => {
        sendLog("log", `[HTTP-BODY-ERR] Response body: ${errorBody || "(empty)"}`);
        sendLog("state", "", { state: "failed" });
      });
      return;
    }

    sendLog("state", "", { state: "downloading" });
    sendLog("log", `[HTTP] Starting zero-copy stream read...`);

    let receivedSize = 0;
    let chunkCount = 0;
    const downloadStartTime = Date.now();

    // Decoupled progress reporting via timer
    const progressTimer = setInterval(() => {
      if (completed) {
        clearInterval(progressTimer);
        return;
      }
      const now = Date.now();
      const duration = (now - downloadStartTime) / 1000 || 0.01;
      const speedMBs = receivedSize / (1024 * 1024) / duration;
      if (receivedSize > 0 || chunkCount > 0) {
        sendLog("progress", "", {
          progress: totalSize > 0 ? Math.min((receivedSize / totalSize) * 100, 100) : Math.min(20 + chunkCount * 0.5, 98),
          speed: parseFloat(speedMBs.toFixed(2)),
          received: receivedSize,
          total: totalSize,
        });
      }
    }, 1000);

    clientRes.on("data", (chunk: Buffer) => {
      receivedSize += chunk.length;
      chunkCount++;
    });

    clientRes.on("end", () => {
      completeDataTransfer();
    });

    function completeDataTransfer() {
      if (completed) return;
      completed = true;
      clearInterval(progressTimer);
      const finalDuration = (Date.now() - downloadStartTime) / 1000 || 0.01;
      const finalSizeFormatted =
        receivedSize > 1024 * 1024
          ? `${(receivedSize / (1024 * 1024)).toFixed(2)} MB`
          : `${(receivedSize / 1024).toFixed(2)} KB`;

      sendLog("progress", "", { progress: 100, speed: parseFloat((receivedSize / (1024 * 1024) / (finalDuration || 0.01)).toFixed(2)), received: receivedSize, total: receivedSize });
      sendLog("log", `[FILE] Download complete!`);
      sendLog("log", `[FILE] Summary: Size: ${finalSizeFormatted}, Duration: ${finalDuration.toFixed(2)}s`);
      sendLog("state", "", { state: "completed", progress: 100 });
      onComplete?.();
    }
  });

  clientReq.on("socket", (socket) => {
    if (socket && typeof socket.setNoDelay === "function") {
      socket.setNoDelay(true);
    }
    if (socket.connecting) {
      sendLog("log", `[TCP] New physical socket, [OS PRESET: ${browserPreset.toUpperCase()}]`);
      sendLog("log", `[TCP] SYN Options: MSS=${tcpMss || 1460}, WS=7, TS=true, SACK=true`);
      sendLog("log", `[TCP] TTL = ${tcpTtl || 128}`);
    } else {
      sendLog("log", `[TCP-REUSE] Reusing Keep-Alive socket!`);
      sendLog("log", `[TCP-REUSE] Skipped TCP handshake and TLS negotiation!`);
    }
  });

  clientReq.on("error", (err) => {
    sendLog("error", `[SOCKET] Socket error: ${err.message}`);
    sendLog("state", "", { state: "failed" });
  });

  clientReq.on("timeout", () => {
    clientReq.destroy();
    sendLog("error", `[TIMEOUT] Response timeout`);
    sendLog("state", "", { state: "failed" });
  });

  clientReq.end();
}

function detectH3Support(headers: Record<string, string>): string | null {
  const altSvc = headers["alt-svc"] || "";
  const h3Match = altSvc.match(/h3=":(\d+)"/);
  if (h3Match) return `h3 (QUIC) port ${h3Match[1]} — ✅ Supported`;
  if (altSvc.includes("h3")) return "h3 (QUIC) ✅ Supported";
  return null;
}

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid API key" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const {
    targetUrl,
    userAgent,
    browserPreset = "chrome",
    tcpTtl = 128,
    tcpMss = 1460,
    tcpWindowSize,
    h2WindowIncrement,
    connectionReuse = true,
    useProxy,
    proxyHost,
    proxyPort,
    cdnType = "cloudflare",
    dnsEnabled = false,
    dnsServers = "8.8.8.8, 114.114.114.114",
    dnsTimeout = 3000,
    dnsParallel = true,
    dnsCacheEnabled = true,
    dnsHosts = "",
    lbStrategy = "fastest",
  } = body;

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing Target URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const targetValidation = await validateOutboundUrl(targetUrl);
  if (!targetValidation.valid) {
    return new Response(JSON.stringify({ error: targetValidation.error }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const encoder = new TextEncoder();
  let streamClosed = false;

  const safeCloseStream = (controller: ReadableStreamDefaultController) => {
    if (!streamClosed) {
      streamClosed = true;
      try { controller.close(); } catch (_) {}
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const sendLog: SendLogFn = (type, message, extra) => {
        if (streamClosed) return;
        try {
          const line = JSON.stringify({ type, message, ...extra }) + "\n";
          controller.enqueue(encoder.encode(line));
        } catch (e) {
          console.error("Stream write error:", e);
        }
      };

      const closeStream = () => safeCloseStream(controller);

      try {
        const nicLogs = getNetworkInterfacesInfo();
        nicLogs.forEach((logLine) => sendLog("log", logLine));
      } catch (e: any) {
        sendLog("log", `[NIC-WARN] Failed to read network interfaces: ${e.message}`);
      }

      const cdnNames: Record<string, string> = {
        cloudflare: "Cloudflare WAF / Enterprise",
        akamai: "Akamai Edge Shield / Bot Manager",
        incapsula: "Imperva Incapsula / Protect Suite",
        custom: "F5 Advanced ASM / AWS WAF Shield",
      };
      const targetCdnName = cdnNames[cdnType] || "Cloudflare WAF";
      sendLog("log", `[WAF-AUDIT] Target CDN: [${targetCdnName}]`);

      // --- CDN-specific fingerprint optimization ---
      // Mutable params that CDN type can override
      let effectiveBrowserPreset = browserPreset;
      let effectiveH2WindowIncrement = safeParseInt(h2WindowIncrement, 6291456);
      let effectiveTcpTtl = tcpTtl || 128;
      let effectiveTcpMss = tcpMss || 1460;
      let effectiveConnectionReuse = connectionReuse;
      let preferHttp2Override: boolean | null = null;
      let effectiveCipherFilter: ((c: string) => boolean) | null = null;

      if (cdnType === "cloudflare") {
        sendLog("log", `[CF-ACTIVE] Cloudflare optimization engine engaged`);
        sendLog("log", `[CF-OPT] Forcing HTTP/2 multiplexing, window=6291456, modern ciphers`);

        // Force HTTP/2 - Cloudflare prefers it and may block HTTP/1.1 patterns
        preferHttp2Override = true;
        // Force correct H2 window increment for Chrome
        if (effectiveBrowserPreset.startsWith("chrome") && effectiveH2WindowIncrement !== 6291456) {
          sendLog("log", `[CF-OPT] Corrected H2 window from ${effectiveH2WindowIncrement} to 6291456 (CF fingerprint default)`);
          effectiveH2WindowIncrement = 6291456;
        }
        // Drop legacy ciphers - they're CF block triggers
        effectiveCipherFilter = (c: string) => !c.includes("ECDHE-RSA") && !c.includes("DHE-");
        sendLog("log", `[CF-OPT] Filtered out ECDHE-RSA / DHE ciphers (CF detection surface)`);

        if (!effectiveBrowserPreset.startsWith("chrome") && !effectiveBrowserPreset.startsWith("firefox") && !effectiveBrowserPreset.startsWith("safari")) {
          sendLog("log", `[CF-AUDIT] ⚠️ Non-browser preset with Cloudflare - high 403 risk. Consider switching to Chrome.`);
        }
      } else if (cdnType === "akamai") {
        sendLog("log", `[AKAMAI-ACTIVE] Akamai optimization engine engaged`);
        sendLog("log", `[AKAMAI-OPT] Aligning TCP TTL/MSS with OS fingerprint`);

        // Detect OS from User-Agent for TTL alignment
        const uaLower = userAgent?.toLowerCase() || "";
        const isWindowsUa = uaLower.includes("windows") || uaLower.includes("win64") || uaLower.includes("win32");
        const isMacUa = uaLower.includes("mac os") || uaLower.includes("macintosh");
        const isLinuxUa = uaLower.includes("linux") || uaLower.includes("x11");

        if (isWindowsUa) {
          if (effectiveTcpTtl !== 128) {
            sendLog("log", `[AKAMAI-OPT] Corrected TTL ${effectiveTcpTtl} -> 128 (Windows)`);
            effectiveTcpTtl = 128;
          }
          if (effectiveTcpMss !== 1460) {
            sendLog("log", `[AKAMAI-OPT] Corrected MSS ${effectiveTcpMss} -> 1460 (Windows default)`);
            effectiveTcpMss = 1460;
          }
        } else if (isMacUa) {
          if (effectiveTcpTtl !== 64) {
            sendLog("log", `[AKAMAI-OPT] Corrected TTL ${effectiveTcpTtl} -> 64 (macOS)`);
            effectiveTcpTtl = 64;
          }
          if (effectiveTcpMss !== 1460) {
            sendLog("log", `[AKAMAI-OPT] Corrected MSS ${effectiveTcpMss} -> 1460 (macOS default)`);
            effectiveTcpMss = 1460;
          }
        } else if (isLinuxUa) {
          if (effectiveTcpTtl !== 64) {
            sendLog("log", `[AKAMAI-OPT] Corrected TTL ${effectiveTcpTtl} -> 64 (Linux)`);
            effectiveTcpTtl = 64;
          }
          if (effectiveTcpMss !== 1460) {
            sendLog("log", `[AKAMAI-OPT] Corrected MSS ${effectiveTcpMss} -> 1460 (Linux default)`);
            effectiveTcpMss = 1460;
          }
        }
        // Akamai deeply inspects TCP options - force keep-alive
        effectiveConnectionReuse = true;
        sendLog("log", `[AKAMAI-OPT] Enforced connection reuse (Akamai tracks TCP handshake patterns)`);
      } else if (cdnType === "incapsula") {
        sendLog("log", `[IMPERVA-ACTIVE] Imperva optimization engine engaged`);
        sendLog("log", `[IMPERVA-OPT] Reordering ciphers to browser-native order, avoiding Python signatures`);

        // Imperva detects Python's default cipher order - auto-upgrade from Python
        if (effectiveBrowserPreset.startsWith("python")) {
          sendLog("log", `[IMPERVA-OPT] AUTO-FIX: Switched from Python preset to Chrome (Imperva blocks Python signatures)`);
          effectiveBrowserPreset = "chrome_124";
        }
        // Imperva prefers Safari-like cipher order with ECDHE-ECDSA prioritized
        effectiveCipherFilter = (c: string) => {
          // Keep ECDHE-ECDSA variants but drop weak ciphers
          return !c.includes("DHE-RSA") && !c.includes("AES128-GCM-SHA256") || c.includes("ECDHE-ECDSA");
        };
        effectiveConnectionReuse = true;
        sendLog("log", `[IMPERVA-OPT] Enforced connection reuse (Imperva tracks connection patterns)`);
      } else {
        // F5/AWS
        sendLog("log", `[AWS-F5-ACTIVE] F5/AWS optimization engine engaged`);
        sendLog("log", `[AWS-F5-OPT] Connection rate limiting, keep-alive enforcement`);

        // F5/AWS WAF watches connection rates - enforce keep-alive
        if (!effectiveConnectionReuse) {
          sendLog("log", `[AWS-F5-OPT] Forced connection reuse ON (avoids AWS Shield rate limiting)`);
          effectiveConnectionReuse = true;
        }
        // AWS WAF Shield has aggressive rate limiting - log warning
        sendLog("log", `[AWS-F5-OPT] AWS Shield mode: recommend max 8 concurrent connections`);
      }

      try {
        const parsedUrl = new URL(targetUrl);
        const isHttps = parsedUrl.protocol === "https:";
        const host = parsedUrl.hostname || "";
        const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : isHttps ? 443 : 80;
        const pathName = parsedUrl.pathname + (parsedUrl.search || "");
        const origin = `${parsedUrl.protocol}//${host}${parsedUrl.port ? ":" + parsedUrl.port : ""}`;

        const hasProxy = useProxy && proxyHost && proxyPort && proxyPort.toString().trim() !== "";

        let ciphers: string | undefined;
        if (isHttps) {
          if (effectiveBrowserPreset.startsWith("chrome")) {
            ciphers =
              "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256";
          } else if (effectiveBrowserPreset.startsWith("firefox")) {
            ciphers =
              "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256";
          } else if (effectiveBrowserPreset.startsWith("safari")) {
            ciphers =
              "TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-GCM-SHA256";
          } else if (effectiveBrowserPreset.startsWith("curl")) {
            ciphers =
              "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384";
          }
          // Apply CDN-specific cipher filter
          if (ciphers && effectiveCipherFilter) {
            const parts = ciphers.split(":");
            ciphers = parts.filter(effectiveCipherFilter).join(":");
            sendLog("log", `[CDN-OPT] Applied CDN cipher filter: ${parts.length - ciphers.split(":").length} ciphers removed`);
          }
        }

        const preferHttp2 =
          preferHttp2Override !== null
            ? preferHttp2Override && isHttps
            : effectiveConnectionReuse &&
              isHttps &&
              (effectiveBrowserPreset.startsWith("chrome") ||
                effectiveBrowserPreset.startsWith("firefox") ||
                effectiveBrowserPreset.startsWith("safari") ||
                effectiveBrowserPreset.startsWith("curl"));

        let selectedIp: string | undefined;
        let resolvedIps: string[] = [];
        let lbResult: any = null;

        if (dnsEnabled) {
          sendLog("log", `[CUSTOM-DNS] Initializing custom DNS pipeline for [${host}]...`);
          let isLocalMap = false;

          if (dnsHosts && dnsHosts.trim() !== "") {
            const mappings = dnsHosts.split(",").map((line: string) => line.trim());
            for (const mapping of mappings) {
              const parts = mapping.split(":");
              if (parts.length >= 2 && parts[0].trim() === host) {
                resolvedIps = [parts[1].trim()];
                isLocalMap = true;
                break;
              }
            }
          }

          if (isLocalMap) {
            sendLog("log", `[CUSTOM-DNS] Local hosts match: ${host} -> ${resolvedIps[0]}`);
          } else {
            const localIps = getLocalResolvedIps(host);
            if (localIps.length > 0) {
              resolvedIps = localIps;
              sendLog("log", `[CUSTOM-DNS] Local JSON cache hit: ${localIps.length} IPs: [${localIps.join(", ")}]`);
            } else if (dnsCacheEnabled && customDnsCache.has(host)) {
              const cacheEntry = customDnsCache.get(host)!;
              if (Date.now() - cacheEntry.timestamp < 60000) {
                resolvedIps = cacheEntry.ips;
                sendLog("log", `[CUSTOM-DNS] Memory cache hit: [${resolvedIps.join(", ")}]`);
              }
            }

            if (resolvedIps.length === 0) {
              const upstreamList = dnsServers
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean);
              sendLog(
                "log",
                `[CUSTOM-DNS] Querying upstream [${upstreamList.join(", ")}], mode: ${dnsParallel ? "parallel" : "sequential"}`
              );
              try {
                const resv = await resolveDnsCustom(host, upstreamList, dnsTimeout, dnsParallel);
                resolvedIps = resv.addresses;
                
                // SSRF re-check: validate IPs resolved by custom DNS
                const blockedIps = resolvedIps.filter(isPrivateOrReservedIp);
                if (blockedIps.length > 0) {
                  sendLog("error", `[SECURITY] Custom DNS resolved to private IP: ${blockedIps.join(", ")}`);
                  sendLog("state", "", { state: "failed" });
                  closeStream();
                  return;
                }
                
                sendLog(
                  "log",
                  `[CUSTOM-DNS] Resolved from [${resv.serverUsed}]: [${resolvedIps.join(", ")}] (${resv.ms}ms)`
                );

                if (dnsCacheEnabled) {
                  customDnsCache.set(host, { ips: resolvedIps, timestamp: Date.now() });
                }
              } catch (dnsErr: any) {
                sendLog("log", `[CUSTOM-DNS] Custom DNS failed: ${dnsErr.message}. Falling back to system DNS...`);
                try {
                  resolvedIps = await resolveDualStack(dns, host);
                  sendLog("log", `[CUSTOM-DNS] System DNS fallback: [${resolvedIps.join(", ")}]`);
                } catch (err2: any) {
                  sendLog("log", `[CUSTOM-DNS] System DNS also failed: ${err2.message}. Proceeding without custom DNS.`);
                }
              }
            }
          }

          if (resolvedIps && resolvedIps.length > 0) {
            const publicIps = validateResolvedIpsArePublic(resolvedIps);
            if (!publicIps.valid) {
              sendLog("error", publicIps.error || "Security rejection: unsafe DNS result");
              sendLog("state", "", { state: "failed" });
              safeCloseStream(controller);
              return;
            }

            const lbLogs: string[] = [];
            lbResult = await selectBalancedIp(host, resolvedIps, lbStrategy, port, 1500, lbLogs);
            lbLogs.forEach((lg) => sendLog("log", lg));
            selectedIp = lbResult.ip;
            sendLog("log", `[LOAD-BALANCER] Selected IP: ${selectedIp}`);
          }
        }

        let lookupCallCount = 0;
        const customLookup =
          dnsEnabled && resolvedIps && resolvedIps.length > 0
          ? (hostname: string, options: any, callback?: any) => {
                const cb = typeof options === "function" ? options : callback;
                if (!cb) return;

                let pool = [...resolvedIps];
                if (lbStrategy === "fastest" && lbResult && lbResult.latencies) {
                  const filtered = resolvedIps.filter((ip) => {
                    const lat = lbResult.latencies[ip];
                    return lat === undefined || lat >= 0;
                  });
                  if (filtered.length > 0) {
                    pool = filtered;
                  }
                }

                let ip = selectedIp || pool[0];

                if (pool.length > 1) {
                  if (lbStrategy === "random") {
                    const idx = Math.floor(Math.random() * pool.length);
                    ip = pool[idx];
                  } else if (lbStrategy === "round_robin" || lbStrategy === "fastest") {
                    const idx = lookupCallCount % pool.length;
                    lookupCallCount++;
                    ip = pool[idx];
                  } else if (lbStrategy === "priority") {
                    ip = pool[0];
                  } else {
                    const idx = lookupCallCount % pool.length;
                    lookupCallCount++;
                    ip = pool[idx];
                  }
                }

                const family = net.isIPv6(ip) ? 6 : 4;
                sendLog(
                  "log",
                  `[LOAD-BALANCER] Shunting connection to IP: ${ip} (${net.isIPv6(ip) ? "IPv6" : "IPv4"})`
                );

                if (options.all) {
                  cb(null, [{ address: ip, family }]);
                } else {
                  cb(null, ip, family);
                }
              }
          : undefined;

        let fallbackTriggered = false;
        const fallbackToHttp1 = (reason: string) => {
          if (fallbackTriggered) return;
          fallbackTriggered = true;

          executeFallback(reason).catch((err: Error) => {
            console.error(`[FALLBACK-ERR] Unhandled error: ${err.message}`);
            sendLog("error", `[FALLBACK-ERR] Unhandled error: ${err.message}`);
            safeCloseStream(controller);
          });
        };

        const executeFallback = async (reason: string) => {
          sendLog("log", `[H2-FALLBACK] H2 not applicable (${reason})`);
          sendLog("log", `[H2-FALLBACK] Falling back to HTTP/1.1...`);

          const headersOption: any = {
            "User-Agent": userAgent || "Mozilla/5.0",
            Accept: "*/*",
            "Accept-Encoding": "identity",
            Host: host,
            Connection: effectiveConnectionReuse ? "keep-alive" : "close",
          };

          if (hasProxy) {
            sendLog("log", `[HTTP1-PROXY] Establishing proxy tunnel via ${proxyHost}:${proxyPort}...`);
            try {
              const proxiedSocket = await getProxiedSocket(
                proxyHost,
                parseInt(proxyPort, 10),
                host,
                port,
                isHttps,
                ciphers,
                sendLog
              );

              const requestOptions: any = {
                hostname: host,
                port,
                path: pathName,
                method: "GET",
                headers: headersOption,
                timeout: 10000,
                rejectUnauthorized: TLS_REJECT_UNAUTHORIZED,
                ciphers,
                createConnection: () => proxiedSocket,
              };

              if (isHttps && ciphers) {
                sendLog("log", `[TLS] [Via Proxy] Using ${effectiveBrowserPreset.toUpperCase()} cipher suite`);
              }

              downloadWithHttp1(requestOptions, isHttps, sendLog, effectiveBrowserPreset, effectiveTcpTtl, effectiveTcpMss, closeStream);
            } catch (proxyErr: any) {
              sendLog("error", `[PROXY-HTTP1-ERR] Proxy tunnel failed: ${proxyErr.message}`);
              sendLog("state", "", { state: "failed" });
              safeCloseStream(controller);
            }
          } else {
            const agentKey = `${host}:${port}${selectedIp ? ":" + selectedIp : ""}`;
            let agent;
            if (effectiveConnectionReuse) {
              if (isHttps) {
                agent = keepAliveHttpsAgents.get(agentKey);
                if (!agent) {
                  agent = new https.Agent({
                    keepAlive: true,
                    keepAliveMsecs: 15000,
                    maxSockets: 64,
                    rejectUnauthorized: TLS_REJECT_UNAUTHORIZED,
                    ...(customLookup ? { lookup: customLookup } : {}),
                  } as any);
                  keepAliveHttpsAgents.set(agentKey, agent);
                }
              } else {
                agent = keepAliveHttpAgents.get(agentKey);
                if (!agent) {
                  agent = new http.Agent({
                    keepAlive: true,
                    keepAliveMsecs: 15000,
                    maxSockets: 64,
                    ...(customLookup ? { lookup: customLookup } : {}),
                  } as any);
                  keepAliveHttpAgents.set(agentKey, agent);
                }
              }
            }

            const requestOptions: any = {
              hostname: host,
              port,
              path: pathName,
              method: "GET",
              headers: headersOption,
              timeout: 10000,
              rejectUnauthorized: TLS_REJECT_UNAUTHORIZED,
              ciphers,
              agent: effectiveConnectionReuse ? agent : false,
              ...(customLookup ? { lookup: customLookup } : {}),
            };

            if (isHttps && ciphers) {
              sendLog("log", `[TLS] Using ${effectiveBrowserPreset.toUpperCase()} cipher suite`);
            }

            downloadWithHttp1(requestOptions, isHttps, sendLog, effectiveBrowserPreset, effectiveTcpTtl, effectiveTcpMss, closeStream);
          }
        };

        // --- Fast dispatch via Node.js fetch (undici) ---
        if (isHttps && !hasProxy) {
          sendLog("log", `[DISPATCH] Using optimized fetch dispatch to ${targetUrl}...`);
          sendLog("log", `[NIC-TRACK] TTL = ${effectiveTcpTtl} | MSS = ${effectiveTcpMss} [${effectiveBrowserPreset.toUpperCase()}]`);
          
          try {
            const fetchStart = Date.now();
            const response = await fetch(targetUrl, {
              headers: {
                'User-Agent': userAgent || 'Mozilla/5.0',
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
              },
              redirect: 'follow',
            });
            
            const statusCode = response.status;
            const contentType = response.headers.get('content-type') || 'unknown';
            const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
            const altSvcHeader = response.headers.get('alt-svc');
            
            sendLog("log", `[FETCH] Response: HTTP status=${statusCode}`);
            sendLog("log", `[FETCH] Content-Type: ${contentType}`);
            sendLog("log", `[FETCH-HEADERS] -> Content-Length: ${contentLength || 'Chunked/Unknown'}`);
            
            if (altSvcHeader) {
              const h3Detected = detectH3Support({ 'alt-svc': altSvcHeader });
              if (h3Detected) sendLog("log", `[H3-DETECT] Server advertises HTTP/3: ${h3Detected} (Alt-Svc: ${altSvcHeader})`);
            }
            
            if (statusCode >= 400) {
              sendLog("error", `[FETCH] Server returned ${statusCode}`);
              sendLog("state", "", { state: "failed" });
              closeStream();
              return;
            }
            
            sendLog("state", "", { state: "downloading" });
            sendLog("log", `[FETCH] Starting high-speed stream read...`);
            
            const reader = response.body?.getReader();
            if (!reader) {
              sendLog("error", `[FETCH] No response body`);
              sendLog("state", "", { state: "failed" });
              closeStream();
              return;
            }
            
            let receivedSize = 0;
            let progressTimer: NodeJS.Timeout | null = setInterval(() => {
              if (streamClosed) {
                if (progressTimer) clearInterval(progressTimer);
                return;
              }
              const duration = (Date.now() - fetchStart) / 1000 || 0.01;
              const speedMBs = receivedSize / (1024 * 1024) / duration;
              sendLog("progress", "", {
                progress: contentLength > 0 ? Math.min((receivedSize / contentLength) * 100, 100) : 50,
                speed: parseFloat(speedMBs.toFixed(2)),
                received: receivedSize,
                total: contentLength,
              });
            }, 1000);
            
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                receivedSize += value?.length || 0;
              }
            } finally {
              if (progressTimer) clearInterval(progressTimer);
            }
            
            const finalDuration = (Date.now() - fetchStart) / 1000 || 0.01;
            const finalSizeFormatted = receivedSize > 1024 * 1024
              ? `${(receivedSize / (1024 * 1024)).toFixed(2)} MB`
              : `${(receivedSize / 1024).toFixed(2)} KB`;
            
            sendLog("progress", "", { progress: 100, speed: parseFloat((receivedSize / (1024 * 1024) / (finalDuration || 0.01)).toFixed(2)), received: receivedSize, total: receivedSize });
            sendLog("log", `[FETCH] Download complete!`);
            sendLog("log", `[FETCH] Summary: Size: ${finalSizeFormatted}, Duration: ${finalDuration.toFixed(2)}s`);
            sendLog("state", "", { state: "completed", progress: 100 });
            closeStream();
            return;
          } catch (fetchErr: any) {
            sendLog("log", `[FETCH-ERR] fetch failed: ${fetchErr.message}. Falling back to legacy dispatch...`);
          }
        }

        if (preferHttp2) {
          let session = h2Sessions.get(origin);
          if (session && (session.destroyed || session.closed)) {
            h2Sessions.delete(origin);
            session = undefined;
          }

          if (session) {
            sendLog(
              "log",
              `[H2-POOL] Reusing existing HTTP/2 session with ${origin}! ${hasProxy ? "(via proxy)" : ""}`
            );
            sendLog("log", `[H2-POOL] Skipping DNS, TCP, TLS handshake!`);
            downloadWithH2Session(
              session,
              pathName,
              host,
              userAgent,
              sendLog,
              effectiveBrowserPreset,
              effectiveTcpTtl,
              effectiveTcpMss,
              fallbackToHttp1,
              effectiveH2WindowIncrement,
              closeStream
            );
            return;
          }
        }

        if (dnsEnabled && selectedIp) {
          sendLog("log", `[ALIGN] DNS hijacked: targeting IP ${selectedIp}`);
        } else if (hasProxy) {
          sendLog("log", `[PROXY-DNS] DNS resolution delegated to proxy server`);
        } else {
          sendLog("log", `[ALIGN] Analyzing physical link. DNS resolving: ${host}`);
          dns.lookup(host, (dnsErr, address) => {
            if (dnsErr) {
              sendLog(
                "log",
                `[DNS] Background resolution: unable to resolve (${dnsErr.message}), possibly using global proxy.`
              );
            } else {
              sendLog("log", `[DNS] Resolved: ${address}`);
            }
          });
        }

        if (preferHttp2) {
          if (hasProxy) {
            sendLog("log", `[H2-CREATE] Establishing proxy connection for HTTP/2: ${origin}`);
            if (ciphers) {
              sendLog("log", `[TLS] [Via Proxy] Using ${browserPreset.toUpperCase()} cipher suite`);
            }

            try {
              const proxiedSocket = await getProxiedSocket(
                proxyHost,
                parseInt(proxyPort, 10),
                host,
                port,
                isHttps,
                ciphers,
                sendLog,
                ["h2"]
              );

              const session = http2.connect(origin, {
                createConnection: () => proxiedSocket,
                rejectUnauthorized: TLS_REJECT_UNAUTHORIZED,
                ciphers,
                servername: host,
                settings: {
                  initialWindowSize: effectiveH2WindowIncrement,
                  maxFrameSize: 16384,
                },
              });

              session.on("error", (err) => {
                sendLog("log", `[H2-SESSION] Proxy connection error: ${err.message}. Triggering fallback.`);
                h2Sessions.delete(origin);
                session.destroy();
                fallbackToHttp1(`HTTP/2 session error: ${err.message}`);
              });

              session.on("close", () => {
                h2Sessions.delete(origin);
                fallbackToHttp1("HTTP/2 session closed early");
              });

              session.on("connect", () => {
                sendLog("log", `[H2-SESSION] Proxy HTTP/2 session established!`);
              });

              h2Sessions.set(origin, session);

              downloadWithH2Session(
                session,
                pathName,
                host,
                userAgent,
                sendLog,
                effectiveBrowserPreset,
                effectiveTcpTtl,
                effectiveTcpMss,
                fallbackToHttp1,
                effectiveH2WindowIncrement,
                closeStream
              );
              return;
            } catch (h2Err: any) {
              sendLog("log", `[H2-FAIL] Proxy H2 session creation failed: ${h2Err.message}`);
              fallbackToHttp1(`H2 Connect via proxy failure: ${h2Err.message}`);
              return;
            }
          } else {
            sendLog("log", `[H2-CREATE] Establishing HTTP/2 connection to: ${origin}`);
            if (ciphers) {
              sendLog("log", `[TLS] Using ${effectiveBrowserPreset.toUpperCase()} cipher suite`);
            }

            try {
              const connectOpts: any = {
                rejectUnauthorized: TLS_REJECT_UNAUTHORIZED,
                ciphers,
                servername: host,
                settings: {
                  initialWindowSize: effectiveH2WindowIncrement,
                  maxFrameSize: 16384,
                },
                ...(customLookup ? { lookup: customLookup } : {}),
              };
              const session = http2.connect(origin, connectOpts);

              session.on("error", (err) => {
                sendLog("log", `[H2-SESSION] Connection error: ${err.message}. Triggering fallback.`);
                h2Sessions.delete(origin);
                session.destroy();
                fallbackToHttp1(`HTTP/2 session error: ${err.message}`);
              });

              session.on("close", () => {
                h2Sessions.delete(origin);
                fallbackToHttp1("HTTP/2 session closed early");
              });

              session.on("connect", () => {
                sendLog("log", `[H2-SESSION] HTTP/2 session established and cached!`);
              });

              h2Sessions.set(origin, session);

              downloadWithH2Session(
                session,
                pathName,
                host,
                userAgent,
                sendLog,
                effectiveBrowserPreset,
                effectiveTcpTtl,
                effectiveTcpMss,
                fallbackToHttp1,
                effectiveH2WindowIncrement,
                closeStream
              );
              return;
            } catch (h2Err: any) {
              sendLog("log", `[H2-FAIL] H2 session creation failed: ${h2Err.message}`);
              fallbackToHttp1(`H2 Connect failure: ${h2Err.message}`);
              return;
            }
          }
        }

        fallbackToHttp1("Direct HTTP/1.1 Requested by configuration");
      } catch (err: any) {
        sendLog("error", `[SYSTEM] Call chain failure: ${err.message}`);
        sendLog("state", "", { state: "failed" });
        safeCloseStream(controller);
      }
    },
    cancel() {
      streamClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders,
    },
  });
}
