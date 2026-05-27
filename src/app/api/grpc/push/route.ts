import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";
import { pushFile, pingServer } from "@/lib/grpc-client";

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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { serverAddress, filename, data, mimeType, metadata = {} } = body;

  if (!serverAddress || !filename || !data) {
    return new Response(
      JSON.stringify({ error: "Missing serverAddress, filename, or data" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Check server health first
  const ping = await pingServer(serverAddress);
  if (!ping.alive) {
    return new Response(
      JSON.stringify({ error: `Server unreachable: ${serverAddress}` }),
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Push file
  const result = await pushFile({
    serverAddress,
    filename,
    data: Buffer.from(data, 'base64'),
    mimeType: mimeType || 'application/octet-stream',
    metadata,
  });

  return new Response(
    JSON.stringify(result),
    {
      status: result.success ? 200 : 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
}
