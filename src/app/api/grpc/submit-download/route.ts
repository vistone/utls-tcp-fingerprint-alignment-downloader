import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Submit download task via gRPC to a remote file transfer server
export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { serverAddress, targetUrl, browserPreset, cdnType, grpcPushEnabled, grpcPushServer } = body;

  if (!serverAddress || !targetUrl) {
    return new Response(
      JSON.stringify({ error: "Missing serverAddress or targetUrl" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Use NDJSON streaming for progress
  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: any) => {
        if (streamClosed) return;
        try {
          const line = JSON.stringify(event) + "\n";
          controller.enqueue(encoder.encode(line));
        } catch (_) {}
      };

      const safeClose = () => {
        if (!streamClosed) {
          streamClosed = true;
          try { controller.close(); } catch (_) {}
        }
      };

      try {
        const { submitDownload } = await import("@/lib/grpc-client");
        submitDownload(
          serverAddress,
          {
            targetUrl,
            browserPreset,
            cdnType,
            grpcPushEnabled,
            grpcPushServer,
          },
          (event) => {
            sendEvent(event);
          },
          (error) => {
            sendEvent({ type: "error", message: error });
            safeClose();
          }
        );

        // Keep stream open for events
        await new Promise<void>((resolve) => {
          // Auto-close after 5 minutes
          const timer = setTimeout(() => { safeClose(); resolve(); }, 300000);
          // Resolve when we get a completed state
          const origController = controller;
          const origEnqueue = origController.enqueue.bind(origController);
        });

      } catch (err: any) {
        sendEvent({ type: "error", message: `gRPC submit failed: ${err.message}` });
      }
      safeClose();
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
