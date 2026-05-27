import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { validateApiKey } from "@/lib/auth";
import { jsonResponse, errorResponse, handleCorsPreflight, createCorsHeaders } from "@/lib/sse-helper";

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
    const { domain } = body;
    const dnsDir = path.join(process.cwd(), "dns_records");

    if (fs.existsSync(dnsDir)) {
      if (domain) {
        const cleanDomain = domain.toLowerCase().trim();

        const validDomainRegex = /^[a-z0-9.:\-\[\]]+$/;
        if (!validDomainRegex.test(cleanDomain)) {
          return errorResponse("Invalid domain format: only alphanumeric, dots, hyphens, and colons allowed", 400);
        }

        if (cleanDomain.includes("..") || cleanDomain.includes("/") || cleanDomain.includes("\\")) {
          return errorResponse("Security rejection: Path traversal detected", 403);
        }

        const filePath = path.join(dnsDir, `${cleanDomain}.json`);
        const resolvedPath = path.resolve(filePath);

        if (!resolvedPath.startsWith(dnsDir + path.sep)) {
          return errorResponse("Security rejection: Path outside allowed range", 403);
        }

        if (fs.existsSync(resolvedPath)) {
          fs.unlinkSync(resolvedPath);
        }
      } else {
        const files = fs.readdirSync(dnsDir);
        files.forEach((file) => {
          if (file.endsWith(".json")) {
            fs.unlinkSync(path.join(dnsDir, file));
          }
        });
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

    return jsonResponse({ success: true, cacheContent: cacheData });
  } catch (e: any) {
    console.error("[GLOBAL-DNS-DELETE-CACHE] Error:", e);
    return errorResponse(e.message || "Failed to delete cache", 500);
  }
}
