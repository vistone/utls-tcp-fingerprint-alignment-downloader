import dns from "dns";
import net from "net";
import fs from "fs";
import path from "path";

export const customDnsCache = new Map<string, { ips: string[]; timestamp: number }>();
export const rrCounters = new Map<string, number>();

const DNS_RECORDS_DIR = path.join(process.cwd(), "dns_records");

function ensureDnsRecordsDir(): string {
  if (!fs.existsSync(DNS_RECORDS_DIR)) {
    fs.mkdirSync(DNS_RECORDS_DIR, { recursive: true });
  }
  return DNS_RECORDS_DIR;
}

export function getLocalResolvedIps(host: string): string[] {
  try {
    const cleanDomain = host.toLowerCase().trim();
    const filePath = path.join(ensureDnsRecordsDir(), `${cleanDomain}.json`);
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(fileContent);
      if (data) {
        const ipv4s = data.ipv4 || [];
        const ipv6s = data.ipv6 || [];
        return [...ipv4s, ...ipv6s];
      }
    }
  } catch (e) {
    console.error(`[DNS-SERVICE] Error reading local JSON database for ${host}:`, e);
  }
  return [];
}

export function getLocalIpInfo(host: string): Record<string, any> | null {
  try {
    const cleanDomain = host.toLowerCase().trim();
    const filePath = path.join(ensureDnsRecordsDir(), `${cleanDomain}.json`);
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(fileContent);
      return data.ipInfo || null;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export function measureTcpLatency(ip: string, port: number, timeout: number = 2000): Promise<number> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.connect({
      host: ip,
      port: port,
      timeout: timeout,
    });

    let settled = false;

    socket.on("connect", () => {
      if (!settled) {
        settled = true;
        resolve(Date.now() - start);
        socket.destroy();
      }
    });

    socket.on("error", () => {
      if (!settled) {
        settled = true;
        resolve(-1);
        socket.destroy();
      }
    });

    socket.on("timeout", () => {
      if (!settled) {
        settled = true;
        resolve(-1);
        socket.destroy();
      }
    });
  });
}

export function resolveDualStack(resolver: dns.Resolver | typeof dns, hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let resolved4: string[] = [];
    let resolved6: string[] = [];
    let error4: any = null;
    let error6: any = null;
    let completed = 0;

    const checkComplete = () => {
      completed++;
      if (completed === 2) {
        const combined = [...resolved4, ...resolved6];
        if (combined.length > 0) {
          resolve(combined);
        } else {
          const errMsg = [error4?.message, error6?.message].filter(Boolean).join(" | ");
          reject(new Error(errMsg || "No IPv4 (A) or IPv6 (AAAA) records resolved"));
        }
      }
    };

    resolver.resolve4(hostname, (err, addresses) => {
      if (err) error4 = err;
      else resolved4 = addresses || [];
      checkComplete();
    });

    resolver.resolve6(hostname, (err, addresses) => {
      if (err) error6 = err;
      else resolved6 = addresses || [];
      checkComplete();
    });
  });
}

export function resolveDnsCustom(
  hostname: string,
  servers: string[],
  timeout: number = 3000,
  parallel: boolean = true
): Promise<{ addresses: string[]; serverUsed: string; ms: number }> {
  return new Promise((resolve, reject) => {
    if (!servers || servers.length === 0) {
      const start = Date.now();
      resolveDualStack(dns, hostname)
        .then((addresses) => {
          resolve({ addresses, serverUsed: "System Default", ms: Date.now() - start });
        })
        .catch((err) => {
          reject(err);
        });
      return;
    }

    const cleanServers = servers
      .map((s) => {
        const parts = s.trim().split(":");
        return parts[0];
      })
      .filter((s) => s.length > 0);

    if (cleanServers.length === 0) {
      return reject(new Error("No valid DNS server IPs provided after parsing."));
    }

    if (parallel) {
      const start = Date.now();
      let finished = false;
      const errors: Error[] = [];

      cleanServers.forEach((serverIp) => {
        const resolver = new dns.Resolver();
        try {
          resolver.setServers([serverIp]);
        } catch (e: any) {
          errors.push(e);
          if (errors.length === cleanServers.length) {
            finished = true;
            reject(new Error(`Failed to configure all DNS servers: ${errors.map((err) => err.message).join("; ")}`));
          }
          return;
        }

        const timeoutTimer = setTimeout(() => {
          if (finished) return;
          errors.push(new Error(`Upstream ${serverIp} query timeout`));
          if (errors.length === cleanServers.length) {
            finished = true;
            reject(new Error("All custom DNS servers timed out."));
          }
        }, timeout);

        resolveDualStack(resolver, hostname)
          .then((addresses) => {
            clearTimeout(timeoutTimer);
            if (finished) return;
            if (addresses && addresses.length > 0) {
              finished = true;
              resolve({ addresses, serverUsed: serverIp, ms: Date.now() - start });
            } else {
              errors.push(new Error(`Upstream ${serverIp} returned empty response`));
              if (errors.length === cleanServers.length) {
                finished = true;
                reject(new Error("All custom DNS servers returned empty responses."));
              }
            }
          })
          .catch((err) => {
            clearTimeout(timeoutTimer);
            if (finished) return;
            errors.push(err);
            if (errors.length === cleanServers.length) {
              finished = true;
              reject(new Error(`All custom DNS servers failed: ${errors.map((err) => err.message).join("; ")}`));
            }
          });
      });
    } else {
      let index = 0;
      const runNext = () => {
        if (index >= cleanServers.length) {
          reject(new Error("Custom DNS Sequential lookup: All upstream DNS servers failed."));
          return;
        }
        const serverIp = cleanServers[index];
        const resolver = new dns.Resolver();
        try {
          resolver.setServers([serverIp]);
        } catch (e: any) {
          index++;
          runNext();
          return;
        }

        const start = Date.now();
        const timeoutTimer = setTimeout(() => {
          index++;
          runNext();
        }, timeout);

        resolveDualStack(resolver, hostname)
          .then((addresses) => {
            clearTimeout(timeoutTimer);
            if (!addresses || addresses.length === 0) {
              index++;
              runNext();
            } else {
              resolve({ addresses, serverUsed: serverIp, ms: Date.now() - start });
            }
          })
          .catch(() => {
            clearTimeout(timeoutTimer);
            index++;
            runNext();
          });
      };
      runNext();
    }
  });
}

export function selectBalancedIp(
  hostname: string,
  ips: string[],
  strategy: string,
  port: number = 443,
  timeout: number = 2000,
  targetLogs: string[] = []
): Promise<{ ip: string; latencies?: Record<string, number> }> {
  return new Promise(async (resolve) => {
    if (!ips || ips.length === 0) {
      resolve({ ip: "" });
      return;
    }
    if (ips.length === 1) {
      resolve({ ip: ips[0] });
      return;
    }

    if (strategy === "random") {
      const idx = Math.floor(Math.random() * ips.length);
      targetLogs.push(`[LB-RANDOM] Selected IP: ${ips[idx]} (from ${ips.length} resolved addresses)`);
      resolve({ ip: ips[idx] });
    } else if (strategy === "round_robin") {
      const count = rrCounters.get(hostname) || 0;
      const idx = count % ips.length;
      rrCounters.set(hostname, count + 1);
      targetLogs.push(`[LB-RR] Round-robin selected IP: ${ips[idx]} (request #${count})`);
      resolve({ ip: ips[idx] });
    } else if (strategy === "priority") {
      targetLogs.push(`[LB-PRIORITY] Priority selected first IP: ${ips[0]}`);
      resolve({ ip: ips[0] });
    } else {
      targetLogs.push(`[LB-FASTEST] Testing TCP latency to ${ips.length} IPs on port ${port}...`);
      const latencies: Record<string, number> = {};
      const latencyPromises = ips.map(async (ip) => {
        const ms = await measureTcpLatency(ip, port, timeout);
        latencies[ip] = ms;
        if (ms >= 0) {
          targetLogs.push(`[LB-FASTEST] -> Node ${ip}: ${ms}ms`);
        } else {
          targetLogs.push(`[LB-FASTEST] -> Node ${ip}: unreachable`);
        }
      });
      await Promise.all(latencyPromises);

      let bestIp = "";
      let minMs = Infinity;
      ips.forEach((ip) => {
        const ms = latencies[ip];
        if (ms >= 0 && ms < minMs) {
          minMs = ms;
          bestIp = ip;
        }
      });

      if (!bestIp) {
        bestIp = ips[0];
        targetLogs.push(`[LB-FASTEST] All nodes unreachable, falling back to: ${bestIp}`);
      } else {
        targetLogs.push(`[LB-FASTEST] Best IP: ${bestIp} (${minMs}ms latency)`);
      }
      resolve({ ip: bestIp, latencies });
    }
  });
}

export async function resolveOnSingleServer(
  domain: string,
  ip: string,
  timeout: number = 800
): Promise<{ ipv4: string[]; ipv6: string[] }> {
  return new Promise((resolve) => {
    const resolver = new dns.Resolver();
    try {
      resolver.setServers([ip]);
    } catch {
      return resolve({ ipv4: [], ipv6: [] });
    }

    let ipv4: string[] = [];
    let ipv6: string[] = [];
    let completed = 0;
    let settled = false;

    const finalize = () => {
      if (!settled) {
        settled = true;
        resolve({ ipv4, ipv6 });
      }
    };

    const timer = setTimeout(finalize, timeout);

    resolver.resolve4(domain, (err, addrs) => {
      if (!err && addrs) ipv4 = addrs;
      completed++;
      if (completed === 2) {
        clearTimeout(timer);
        finalize();
      }
    });

    resolver.resolve6(domain, (err, addrs) => {
      if (!err && addrs) ipv6 = addrs;
      completed++;
      if (completed === 2) {
        clearTimeout(timer);
        finalize();
      }
    });
  });
}

export function mergeAndDeduplicate(existing: string[], incoming: string[]): string[] {
  const set = new Set([...existing, ...incoming]);
  return Array.from(set)
    .map((ip) => ip.trim())
    .filter(Boolean);
}
