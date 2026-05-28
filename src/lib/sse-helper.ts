export type SendLogFn = (type: string, message: string, extra?: Record<string, any>) => void;

export function createCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE",
    "Access-Control-Allow-Headers": "X-Requested-With, Content-Type, Authorization",
  };
}

export function createSSEStreamResponse(
  handler: (sendLog: SendLogFn, signal: AbortSignal) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  let isClosed = false;
  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const sendLog: SendLogFn = (type, message, extra) => {
        if (isClosed) return;
        try {
          const line = JSON.stringify({ type, message, ...extra }) + "\n";
          controller.enqueue(encoder.encode(line));
        } catch (e) {
          console.error("Stream write error:", e);
        }
      };

      try {
        await handler(sendLog, abortController.signal);
      } catch (err: any) {
        sendLog("error", `[SYSTEM] Fatal error: ${err.message}`);
        sendLog("state", "", { state: "failed" });
      }

      try {
        if (!isClosed) {
          controller.close();
        }
      } catch (_) {}
    },
    cancel() {
      isClosed = true;
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...createCorsHeaders(),
    },
  });
}

export function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...createCorsHeaders(),
    },
  });
}

export function errorResponse(message: string, status: number = 500): Response {
  return jsonResponse({ error: message }, status);
}

export function handleCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(),
  });
}
