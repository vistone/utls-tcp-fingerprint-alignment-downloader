import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { jsonResponse, errorResponse, handleCorsPreflight, createCorsHeaders } from "@/lib/sse-helper";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid API key" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const body = await request.json();
    const { message, history, fingerprintConfig } = body;

    if (!message) {
      return errorResponse("Missing message parameter", 400);
    }

    const MIMO_API_KEY = process.env.MIMO_API_KEY || "";
    const MIMO_BASE_URL = process.env.MIMO_BASE_URL || "https://token-plan-cn.xiaomimimo.com/v1";
    const MIMO_MODEL = process.env.MIMO_MODEL || "mimo-v2.5-pro";

    const configStr = fingerprintConfig
      ? `[Current Fingerprint Set - Target CDN Shield: ${fingerprintConfig.targetCdn || "cloudflare"}, User-Agent: ${fingerprintConfig.userAgent}, TLS Profile (JA4): ${fingerprintConfig.tlsProfile}, TCP/IP System: ${fingerprintConfig.tcpSystem}, TTL: ${fingerprintConfig.tcpTtl}, TCP Window Size: ${fingerprintConfig.tcpWindowSize}, Align Level: ${fingerprintConfig.alignLevel}%]`
      : "";

    const systemInstruction =
      "You are an elite cybersecurity engineer, anti-bot bypass expert, and low-level network system architect. " +
      "You are a master at defeating Cloudflare (WAF/Turnstile), Akamai, Imperva, and Datadome. " +
      "You specialize in TLS fingerprinting (JA3, JA3S, JA4, JA4H, JA4T), HTTP/2 fingerprinting (Settings frames, window increments), " +
      "and uTLS (Chrome, Firefox, Safari ClientHello spoofing). " +
      "Crucially, you understand *Fingerprint Alignment*: how WAFs detect automation by comparing " +
      "the OS-level TCP/IP stack (TTL, TCP window size, MSS, SACK/timestamp TCP option structures) " +
      "with the browser TLS extensions and the User-Agent header (for example, a Chrome User-Agent on Linux " +
      "having a Windows TCP/IP SYN signature instantly triggers a 403 block). " +
      "Provide precise, expert assistance in Go, Rust, and Node.js (TLS socket tuning) showing how to patch " +
      "and construct aligned sockets to avoid 403 blocks.";

    const messages = [
      { role: "system", content: systemInstruction },
      ...(history || []).map((h: { role: string; text: string }) => ({
        role: h.role === "model" ? "assistant" : h.role,
        content: h.text,
      })),
      { role: "user", content: `${configStr}\n\nUser Question: ${message}` },
    ];

    const response = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MIMO_API_KEY}`,
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`MiMo API error: ${response.status} - ${errorData}`);
    }

    const data = (await response.json()) as any;
    const text = data.choices?.[0]?.message?.content || "No response generated.";

    return jsonResponse({ text });
  } catch (error: any) {
    console.error("MiMo API Error:", error);
    return errorResponse(error.message || "Failed to generate response from bypass specialist.", 500);
  }
}
