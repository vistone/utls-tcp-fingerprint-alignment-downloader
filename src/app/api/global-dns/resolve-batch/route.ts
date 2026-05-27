import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { validateApiKey } from "@/lib/auth";
import { jsonResponse, errorResponse, handleCorsPreflight, createCorsHeaders } from "@/lib/sse-helper";
import { resolveOnSingleServer, mergeAndDeduplicate } from "@/lib/dns";
import { batchFetchIpInfo, mergeIpInfoToDomainFile } from "@/lib/ip-info";

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

  try {
    const body = await request.json();
    const { domains = [], timeout = 1000, concurrency = 60 } = body;

    const MAX_DOMAINS = 50;
    const MAX_CONCURRENCY = 100;
    const MIN_TIMEOUT = 500;
    const MAX_TIMEOUT = 10000;

    if (!Array.isArray(domains) || domains.length === 0) {
      return errorResponse("No target domains list provided", 400);
    }

    if (domains.length > MAX_DOMAINS) {
      return errorResponse(`Maximum ${MAX_DOMAINS} domains allowed`, 400);
    }

    const safeConcurrency = Math.min(Math.max(1, Number(concurrency) || 60), MAX_CONCURRENCY);
    const safeTimeout = Math.min(Math.max(MIN_TIMEOUT, Number(timeout) || 1000), MAX_TIMEOUT);

    const validDomainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    for (const domain of domains) {
      const d = String(domain).trim();
      if (d.length > 253 || !validDomainRegex.test(d)) {
        return errorResponse(`Invalid domain format: ${d}`, 400);
      }
    }

    let serversMap: Record<string, string> = {};
    const serverPath = path.join(process.cwd(), "global_dns_servers.json");
    if (fs.existsSync(serverPath)) {
      const p = JSON.parse(fs.readFileSync(serverPath, "utf-8"));
      serversMap = p.servers || {};
    }

    const serverIps = Object.values(serversMap).filter(Boolean);
    if (serverIps.length === 0) {
      serverIps.push("1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4", "114.114.114.114");
    }

    const results: Record<string, { ipv4: string[]; ipv6: string[]; serversQueried: number; serversSucceeded: number }> = {};
    const batchLogs: string[] = [];

    batchLogs.push(
      `[Global-DNS] Starting batch resolution for domains: [${domains.join(", ")}] across ${serverIps.length} servers`
    );

    for (const domain of domains) {
      const cleanDomain = domain.trim().toLowerCase();
      if (!cleanDomain) continue;

      const allIpv4 = new Set<string>();
      const allIpv6 = new Set<string>();
      let successCount = 0;

      for (let i = 0; i < serverIps.length; i += safeConcurrency) {
        const chunk = serverIps.slice(i, i + safeConcurrency);
        const chunkPromises = chunk.map(async (ip) => {
          const resv = await resolveOnSingleServer(cleanDomain, ip, safeTimeout);
          if (resv.ipv4.length > 0 || resv.ipv6.length > 0) {
            resv.ipv4.forEach((addr) => allIpv4.add(addr));
            resv.ipv6.forEach((addr) => allIpv6.add(addr));
            return true;
          }
          return false;
        });

        const chunkResults = await Promise.all(chunkPromises);
        successCount += chunkResults.filter(Boolean).length;
      }

      results[cleanDomain] = {
        ipv4: Array.from(allIpv4),
        ipv6: Array.from(allIpv6),
        serversQueried: serverIps.length,
        serversSucceeded: successCount,
      };

      batchLogs.push(
        `[Global-DNS] Resolved ${cleanDomain}: ${allIpv4.size} IPv4, ${allIpv6.size} IPv6 (${successCount}/${serverIps.length} servers succeeded)`
      );
    }

    const dnsDir = path.join(process.cwd(), "dns_records");
    if (!fs.existsSync(dnsDir)) {
      fs.mkdirSync(dnsDir, { recursive: true });
    }

    for (const dom of Object.keys(results)) {
      const filePath = path.join(dnsDir, `${dom}.json`);
      let existingIpv4: string[] = [];
      let existingIpv6: string[] = [];

      if (fs.existsSync(filePath)) {
        try {
          const fileContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          existingIpv4 = fileContent.ipv4 || [];
          existingIpv6 = fileContent.ipv6 || [];
        } catch {
          // ignore malformed
        }
      }

      const mergedIpv4 = mergeAndDeduplicate(existingIpv4, results[dom].ipv4);
      const mergedIpv6 = mergeAndDeduplicate(existingIpv6, results[dom].ipv6);

      fs.writeFileSync(
        filePath,
        JSON.stringify({ ipv4: mergedIpv4, ipv6: mergedIpv6 }, null, 2),
        "utf-8"
      );
      batchLogs.push(
        `[Global-DNS] Updated dns_records/${dom}.json (IPv4: ${mergedIpv4.length}, IPv6: ${mergedIpv6.length})`
      );

      const allIps = [...mergedIpv4, ...mergedIpv6];
      if (allIps.length > 0) {
        const ipInfo = await batchFetchIpInfo(allIps);
        if (Object.keys(ipInfo).length > 0) {
          mergeIpInfoToDomainFile(dom, ipInfo);
          batchLogs.push(`[Global-DNS] IP info enriched for ${dom}: ${Object.keys(ipInfo).length} IPs`);
        }
      }
    }

    let cacheData: Record<string, { ipv4: string[]; ipv6: string[] }> = {};
    if (fs.existsSync(dnsDir)) {
      const files = fs.readdirSync(dnsDir);
      files.forEach((file) => {
        if (file.endsWith(".json")) {
          const dom = file.slice(0, -5);
          try {
            const content = fs.readFileSync(path.join(dnsDir, file), "utf-8");
            cacheData[dom] = JSON.parse(content);
          } catch {
            // ignore
          }
        }
      });
    }

    return jsonResponse({
      success: true,
      results,
      logs: batchLogs,
      cacheContent: cacheData,
    });
  } catch (e: any) {
    console.error("[GLOBAL-DNS-RESOLVE-BATCH] Error:", e);
    return errorResponse(e.message || "Batch DNS resolution failed", 500);
  }
}
