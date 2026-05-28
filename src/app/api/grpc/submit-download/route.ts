import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";
import { submitDownload } from "@/lib/grpc-client";

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Submit download task to the Hub via gRPC
// Streams progress events back as NDJSON
export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { hubAddress, targetUrl, browserPreset, cdnType, storageServerId } = await request.json();

  if (!hubAddress || !targetUrl) {
    return new Response(
      JSON.stringify({ error: "Missing hubAddress or targetUrl" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: any) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch (_) {}
      };

      submitDownload(
        hubAddress,
        { targetUrl, browserPreset, cdnType, storageServerId },
        (event) => sendEvent(event),
        (error) => {
          sendEvent({ type: "error", message: error });
          streamClosed = true;
          try { controller.close(); } catch (_) {}
        }
      );
    },
    cancel() {
      streamClosed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      ...corsHeaders,
    },
  });
}
