import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";
import { registerDevice, listDevices, sendHeartbeat, pingHub } from "@/lib/grpc-client";
import "@/lib/hub-startup";

export async function OPTIONS() {
  return handleCorsPreflight();
}

// GET - List storage servers
export async function GET(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();
  const { searchParams } = new URL(request.url);
  const hubAddress = searchParams.get("hub") || "localhost:50051";

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const [servers, pingResult] = await Promise.all([
      listDevices(hubAddress, 'storage_server'),
      pingHub(hubAddress),
    ]);
    return new Response(
      JSON.stringify({ hub: { address: hubAddress, alive: pingResult.alive, uptime: pingResult.uptime }, servers }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to query hub: ${err.message}` }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

// POST - Register storage server
export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { hubAddress = "localhost:50051", deviceName } = await request.json();
  if (!deviceName) {
    return new Response(JSON.stringify({ error: "Missing deviceName" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const result = await registerDevice('storage_server', { hubAddress, deviceName });
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 400,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
