import fs from "fs";
import path from "path";

const IPINFO_TOKEN = process.env.IPINFO_TOKEN || "";

export const ipInfoCache = new Map<string, { data: any; timestamp: number }>();

export async function batchFetchIpInfo(ips: string[]): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  if (!IPINFO_TOKEN || ips.length === 0) return results;

  const now = Date.now();
  const CACHE_TTL = 600000;
  const uncachedIps: string[] = [];

  for (const ip of ips) {
    const cached = ipInfoCache.get(ip);
    if (cached && now - cached.timestamp < CACHE_TTL) {
      results[ip] = cached.data;
    } else {
      uncachedIps.push(ip);
    }
  }

  if (uncachedIps.length > 0) {
    const BATCH_SIZE = 10;
    for (let i = 0; i < uncachedIps.length; i += BATCH_SIZE) {
      const batch = uncachedIps.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (ip) => {
        try {
          const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${IPINFO_TOKEN}`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            ipInfoCache.set(ip, { data, timestamp: now });
            results[ip] = data;
          }
        } catch (err) {
          // silently skip failed IP lookups
        }
      });
      await Promise.allSettled(promises);
    }
  }

  return results;
}

export function mergeIpInfoToDomainFile(domain: string, newIpInfo: Record<string, any>) {
  try {
    const dnsDir = path.join(process.cwd(), "dns_records");
    const filePath = path.join(dnsDir, `${domain.toLowerCase().trim()}.json`);
    let existing: any = { ipv4: [], ipv6: [] };
    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {
        // use defaults
      }
    }
    const mergedIpInfo = { ...(existing.ipInfo || {}), ...newIpInfo };
    if (!fs.existsSync(dnsDir)) {
      fs.mkdirSync(dnsDir, { recursive: true });
    }
    fs.writeFileSync(
      filePath,
      JSON.stringify({ ...existing, ipInfo: mergedIpInfo }, null, 2),
      "utf-8"
    );
    console.log(`[IP-INFO] Updated ipInfo for domain ${domain}: ${Object.keys(mergedIpInfo).length} IPs`);
  } catch (e: any) {
    console.error(`[IP-INFO] Failed to merge ipInfo for ${domain}:`, e.message);
  }
}

export function getLocalIpInfo(host: string): Record<string, any> | null {
  try {
    const cleanDomain = host.toLowerCase().trim();
    const filePath = path.join(process.cwd(), "dns_records", `${cleanDomain}.json`);
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
