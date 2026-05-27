import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { createCorsHeaders, handleCorsPreflight } from "@/lib/sse-helper";
import { startGrpcServer, stopGrpcServer, getSavedFiles } from "@/lib/grpc-server";

let grpcServerRunning = false;

export async function OPTIONS() {
  return handleCorsPreflight();
}

// GET - Check server status and list saved files
export async function GET(): Promise<Response> {
  const corsHeaders = createCorsHeaders();
  return new Response(
    JSON.stringify({
      running: grpcServerRunning,
      savedFiles: Object.values(getSavedFiles()),
      pid: process.pid,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
}

// POST - Start/stop the gRPC receiver server
export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { action, port = 50051 } = await request.json();

  if (action === "start") {
    if (grpcServerRunning) {
      return new Response(
        JSON.stringify({ status: "already_running", message: "gRPC server is already running" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    try {
      await startGrpcServer(port);
      grpcServerRunning = true;
      return new Response(
        JSON.stringify({ status: "started", port, message: `gRPC server listening on port ${port}` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: `Failed to start: ${err.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }

  if (action === "stop") {
    try {
      await stopGrpcServer();
      grpcServerRunning = false;
      return new Response(
        JSON.stringify({ status: "stopped", message: "gRPC server stopped" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: `Failed to stop: ${err.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: "Invalid action. Use 'start' or 'stop'" }),
    { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}
