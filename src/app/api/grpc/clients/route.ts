import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";
import { listClients, listStorageServers, pingHub } from "@/lib/grpc-client";

export async function OPTIONS() {
  return handleCorsPreflight();
}

// GET - List all connected clients and storage servers
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
    const [clients, servers, pingResult] = await Promise.all([
      listClients(hubAddress),
      listStorageServers(hubAddress),
      pingHub(hubAddress),
    ]);

    return new Response(
      JSON.stringify({
        hub: { address: hubAddress, alive: pingResult.alive, uptime: pingResult.uptime },
        clients,
        storageServers: servers,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Failed to query hub: ${err.message}` }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
}
