import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { validateApiKey } from "@/lib/auth";
import { jsonResponse, errorResponse, handleCorsPreflight, createCorsHeaders } from "@/lib/sse-helper";
import { validateOutboundUrl } from "@/lib/ssrf";

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
    const { manifestUrl } = body;

    if (!manifestUrl) {
      return errorResponse("Missing manifestUrl parameter", 400);
    }

    let jsonContent = "";

    if (manifestUrl.startsWith("/") || manifestUrl.startsWith("./") || !manifestUrl.startsWith("http")) {
      const publicDir = path.join(process.cwd(), "public");
      const cleanPath = manifestUrl.replace(/^\.\/|^\//, "");
      const fullPath = path.resolve(path.join(publicDir, cleanPath));

      if (!fullPath.startsWith(publicDir + path.sep) && fullPath !== publicDir) {
        return errorResponse("Security rejection: Path traversal detected", 403);
      }

      const fsPromises = await import("fs/promises");
      jsonContent = await fsPromises.readFile(fullPath, "utf-8");
    } else {
      const manifestValidation = await validateOutboundUrl(manifestUrl);
      if (!manifestValidation.valid) {
        return errorResponse(manifestValidation.error || "Manifest URL rejected", 403);
      }

      const abortController = new AbortController();
      const fetchTimeout = setTimeout(() => abortController.abort(), 15000);
      try {
        const fetchResponse = await fetch(manifestUrl, { signal: abortController.signal });
        clearTimeout(fetchTimeout);
        if (!fetchResponse.ok) {
          throw new Error(`Remote JSON load failed (HTTP status: ${fetchResponse.status})`);
        }
        jsonContent = await fetchResponse.text();
      } catch (fetchErr: any) {
        clearTimeout(fetchTimeout);
        if (fetchErr.name === "AbortError") {
          throw new Error("Remote manifest request timeout (15s)");
        }
        throw fetchErr;
      }
    }

    const parsed = JSON.parse(jsonContent);
    const urls: string[] = [];

    const extractUrls = (obj: any) => {
      if (!obj) return;
      if (typeof obj === "string") {
        if (obj.startsWith("http://") || obj.startsWith("https://")) {
          if (!urls.includes(obj)) {
            urls.push(obj);
          }
        }
      } else if (Array.isArray(obj)) {
        for (const item of obj) {
          extractUrls(item);
        }
      } else if (typeof obj === "object") {
        for (const key of Object.keys(obj)) {
          extractUrls(obj[key]);
        }
      }
    };

    extractUrls(parsed);

    return jsonResponse({
      success: true,
      urls,
      title: parsed.title || "Unnamed batch manifest",
      description: parsed.description || "Extracted asset links from loaded manifest",
      rawFormat: parsed,
    });
  } catch (err: any) {
    console.error("[PARSE-MANIFEST] Error:", err);
    return errorResponse(`Manifest parse error: ${err.message}`, 500);
  }
}
