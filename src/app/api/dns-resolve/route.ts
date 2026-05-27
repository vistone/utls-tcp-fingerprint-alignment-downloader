import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { jsonResponse, errorResponse, handleCorsPreflight, createCorsHeaders } from "@/lib/sse-helper";
import {
  getLocalResolvedIps,
  getLocalIpInfo,
  resolveDnsCustom,
  selectBalancedIp,
  customDnsCache,
} from "@/lib/dns";

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
    const {
      host,
      dnsServers = "8.8.8.8, 114.114.114.114",
      dnsTimeout = 3000,
      dnsParallel = true,
      dnsCacheEnabled = true,
      dnsHosts = "",
      lbStrategy = "fastest",
      port = 443,
    } = body;

    if (!host) {
      return errorResponse("Missing Host target parameter", 400);
    }

    const logs: string[] = [];
    logs.push(`[DNS-SERVICE] Starting custom DNS resolution and load balancer engine...`);

    let resolvedIps: string[] = [];
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

    let cacheHit = false;

    if (isLocalMap) {
      logs.push(`[DNS-SERVICE] Static hosts match: ${host} -> ${resolvedIps[0]}`);
    } else {
      const localIps = getLocalResolvedIps(host);
      if (localIps.length > 0) {
        resolvedIps = localIps;
        cacheHit = true;
        logs.push(`[DNS-SERVICE] Local JSON cache hit: ${localIps.length} IPs: [${localIps.join(", ")}]`);
      } else if (dnsCacheEnabled && customDnsCache.has(host)) {
        const cacheEntry = customDnsCache.get(host)!;
        if (Date.now() - cacheEntry.timestamp < 60000) {
          resolvedIps = cacheEntry.ips;
          cacheHit = true;
          logs.push(`[DNS-SERVICE] Memory cache hit: [${resolvedIps.join(", ")}]`);
        } else {
          customDnsCache.delete(host);
          logs.push(`[DNS-SERVICE] Cache expired, re-resolving...`);
        }
      }

      if (resolvedIps.length === 0) {
        const upstreamList = dnsServers
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
        logs.push(
          `[DNS-SERVICE] Querying upstream servers [${upstreamList.join(", ")}], mode: ${dnsParallel ? "parallel" : "sequential"}`
        );

        const resv = await resolveDnsCustom(host, upstreamList, dnsTimeout, dnsParallel);
        resolvedIps = resv.addresses;
        logs.push(
          `[DNS-SERVICE] Resolved from [${resv.serverUsed}]: [${resolvedIps.join(", ")}] (${resv.ms}ms)`
        );

        if (dnsCacheEnabled) {
          customDnsCache.set(host, { ips: resolvedIps, timestamp: Date.now() });
        }
      }
    }

    if (!resolvedIps || resolvedIps.length === 0) {
      throw new Error(`Domain ${host} failed to resolve to any valid IP addresses.`);
    }

    const lbResult = await selectBalancedIp(host, resolvedIps, lbStrategy, port, 1500, logs);
    const selectedIp = lbResult.ip;

    logs.push(`[DNS-SERVICE] Load balancer selected IP: ${selectedIp} (${resolvedIps.length} total endpoints)`);

    if (resolvedIps.length > 1) {
      logs.push(`[DNS-SERVICE] High-concurrency connection shunting enabled with strategy: ${lbStrategy}`);
    } else {
      logs.push(`[DNS-SERVICE] Single IP in pool, no shunting needed.`);
    }

    let ipInfo: Record<string, any> | null = null;
    if (cacheHit) {
      ipInfo = getLocalIpInfo(host);
    }

    return jsonResponse({
      success: true,
      resolvedIps,
      selectedIp,
      latencies: lbResult.latencies || {},
      logs,
      cacheHit,
      ipInfo,
    });
  } catch (err: any) {
    console.error("[DNS-RESOLVE] Error:", err);
    return errorResponse(err.message || "DNS resolution failed", 500);
  }
}
