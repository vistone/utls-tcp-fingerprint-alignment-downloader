import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { validateApiKey } from "@/lib/auth";
import { jsonResponse, errorResponse, handleCorsPreflight, createCorsHeaders } from "@/lib/sse-helper";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid API key" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    let serversMap: Record<string, string> = {};
    let cacheData: Record<string, { ipv4: string[]; ipv6: string[] }> = {};

    const serverPath = path.join(process.cwd(), "global_dns_servers.json");
    if (fs.existsSync(serverPath)) {
      const p = JSON.parse(fs.readFileSync(serverPath, "utf-8"));
      serversMap = p.servers || {};
    }

    const dnsDir = path.join(process.cwd(), "dns_records");
    if (fs.existsSync(dnsDir)) {
      const files = fs.readdirSync(dnsDir);
      files.forEach((file) => {
        if (file.endsWith(".json")) {
          const dom = file.slice(0, -5);
          try {
            const content = fs.readFileSync(path.join(dnsDir, file), "utf-8");
            cacheData[dom] = JSON.parse(content);
          } catch {
            // ignore malformed files
          }
        }
      });
    }

    const serverCount = Object.keys(serversMap).length;
    const cachedEntries = Object.keys(cacheData).map((domain) => ({
      domain,
      ipv4Count: cacheData[domain].ipv4?.length || 0,
      ipv6Count: cacheData[domain].ipv6?.length || 0,
    }));

    return jsonResponse({
      success: true,
      serverCount,
      cachedDomains: cachedEntries,
      servers: serversMap,
      cacheContent: cacheData,
    });
  } catch (e: any) {
    console.error("[GLOBAL-DNS-STATUS] Error:", e);
    return errorResponse(e.message || "Failed to load DNS status", 500);
  }
}
