import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { jsonResponse, errorResponse, handleCorsPreflight, createCorsHeaders } from "@/lib/sse-helper";
import { ipInfoCache } from "@/lib/ip-info";

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
    const { ips = [] } = body;

    if (!Array.isArray(ips) || ips.length === 0) {
      return errorResponse("No IP addresses provided", 400);
    }

    const IPINFO_TOKEN = process.env.IPINFO_TOKEN || "";

    if (!IPINFO_TOKEN) {
      return errorResponse("IPINFO_TOKEN not configured", 400);
    }

    const MAX_IPS = 50;
    if (ips.length > MAX_IPS) {
      return errorResponse(`Maximum ${MAX_IPS} IP addresses allowed`, 400);
    }

    const results: Record<string, any> = {};
    const now = Date.now();
    const CACHE_TTL = 600000;

    const uncachedIps: string[] = [];

    for (const ip of ips) {
      const cached = ipInfoCache.get(ip);
      if (cached && now - cached.timestamp < CACHE_TTL) {
        results[ip] = cached.data;
      } else {
        uncachedIps.push(ip);
        results[ip] = null;
      }
    }

    if (uncachedIps.length > 0) {
      const fetchPromises = uncachedIps.map(async (ip) => {
        try {
          const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${IPINFO_TOKEN}`;
          const resp = await fetch(url);
          if (!resp.ok) {
            console.error(`[IP-INFO] Failed to fetch ${ip}: HTTP ${resp.status}`);
            results[ip] = { error: `HTTP ${resp.status}` };
            return;
          }
          const data = await resp.json();
          ipInfoCache.set(ip, { data, timestamp: now });
          results[ip] = data;
        } catch (err: any) {
          console.error(`[IP-INFO] Error fetching ${ip}:`, err.message);
          results[ip] = { error: err.message };
        }
      });

      await Promise.allSettled(fetchPromises);
    }

    return jsonResponse({ success: true, results });
  } catch (e: any) {
    console.error("[IP-INFO] Error:", e);
    return errorResponse(e.message || "IP info lookup failed", 500);
  }
}
