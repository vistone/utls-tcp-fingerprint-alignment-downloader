import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";
import { listDevices, registerDevice, sendHeartbeat, pingHub } from "@/lib/grpc-client";

export async function OPTIONS() {
  return handleCorsPreflight();
}

// GET - List all devices with status
export async function GET(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();
  const { searchParams } = new URL(request.url);
  const hubAddress = searchParams.get("hub") || "localhost:50051";
  const typeFilter = searchParams.get("type") || '';

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const [devices, pingResult] = await Promise.all([
      listDevices(hubAddress, typeFilter),
      pingHub(hubAddress),
    ]);

    return new Response(
      JSON.stringify({
        hub: {
          address: hubAddress,
          alive: pingResult.alive,
          uptime: pingResult.uptime,
          connectedClients: pingResult.connectedClients || 0,
          connectedStorage: pingResult.connectedStorage || 0,
        },
        devices,
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

// POST - Register device or send heartbeat
export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { action, hubAddress = "localhost:50051", deviceType, deviceName, deviceId, status } = await request.json();

  if (action === "register") {
    if (!deviceName) {
      return new Response(JSON.stringify({ error: "Missing deviceName" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const type = deviceType || 'task_client';
    const result = await registerDevice(type, { hubAddress, deviceName });
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (action === "heartbeat") {
    if (!deviceId) {
      return new Response(JSON.stringify({ error: "Missing deviceId" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const ok = await sendHeartbeat(hubAddress, deviceId, status || { state: 'online' });
    return new Response(JSON.stringify({ success: ok }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ error: "Invalid action. Use 'register' or 'heartbeat'" }), {
    status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
