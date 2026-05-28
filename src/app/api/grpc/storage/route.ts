import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";
import { registerStorage, unregisterStorage, listStorageServers, pingHub } from "@/lib/grpc-client";

export async function OPTIONS() {
  return handleCorsPreflight();
}

// GET - list registered storage servers
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
      listStorageServers(hubAddress),
      pingHub(hubAddress),
    ]);

    return new Response(
      JSON.stringify({ hub: { address: hubAddress, alive: pingResult.alive, uptime: pingResult.uptime }, servers }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Failed to query hub: ${err.message}` }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
}

// POST - register/unregister storage server
export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { action, hubAddress = "localhost:50051", name, address, serverId } = await request.json();

  if (action === "register") {
    if (!name || !address) {
      return new Response(
        JSON.stringify({ error: "Missing name or address" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const result = await registerStorage({ hubAddress, name, address });
    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  if (action === "unregister") {
    if (!serverId) {
      return new Response(
        JSON.stringify({ error: "Missing serverId" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const result = await unregisterStorage(hubAddress, serverId);
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  return new Response(
    JSON.stringify({ error: "Invalid action. Use 'register' or 'unregister'" }),
    { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}
