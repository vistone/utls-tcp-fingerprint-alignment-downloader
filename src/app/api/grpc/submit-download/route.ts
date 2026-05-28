import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";
import { submitDownload } from "@/lib/grpc-client";
import "@/lib/hub-startup";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { hubAddress, targetUrl, browserPreset, cdnType, storageDeviceId } = await request.json();

  if (!hubAddress || !targetUrl) {
    return new Response(
      JSON.stringify({ error: "Missing hubAddress or targetUrl" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: any) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch (_) {}
      };

      submitDownload(
        hubAddress,
        { targetUrl, browserPreset, cdnType, storageDeviceId },
        (event) => send(event),
        (error) => { send({ type: "error", message: error }); closed = true; try { controller.close(); } catch (_) {} }
      );
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", ...corsHeaders },
  });
}
