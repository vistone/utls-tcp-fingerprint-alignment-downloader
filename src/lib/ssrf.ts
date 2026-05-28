import net from "net";
import dns from "dns";

export function isPrivateOrReservedIp(ip: string): boolean {
  const cleanIp = ip.trim().replace(/^\[(.*)\]$/, "$1").toLowerCase().replace(/^::ffff:/, "");

  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);

    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
    if (parts[0] >= 224 && parts[0] <= 239) return true;
    if (parts[0] >= 240) return true;
    if (parts[0] === 255 && parts[1] === 255 && parts[2] === 255 && parts[3] === 255) return true;
  }

  if (net.isIPv6(cleanIp)) {
    if (cleanIp === "::1") return true;
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true;
    if (cleanIp.startsWith("fe80") || cleanIp.startsWith("fe90") || cleanIp.startsWith("fea0") || cleanIp.startsWith("feb0")) return true;
    if (cleanIp.startsWith("::ffff:")) return true;
    if (cleanIp === "::") return true;
    if (cleanIp.startsWith("100::")) return true;
    if (cleanIp.startsWith("2001:db8")) return true;
    if (cleanIp.startsWith("ff")) return true;
  }

  return false;
}

export type OutboundUrlValidation = {
  valid: boolean;
  url?: URL;
  error?: string;
};

export async function validateOutboundUrl(rawUrl: string): Promise<OutboundUrlValidation> {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "Missing URL" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Only http and https URLs are allowed" };
  }

  const hostname = parsed.hostname;
  const cleanHostname = hostname.replace(/^\[(.*)\]$/, "$1");
  if (!cleanHostname) {
    return { valid: false, error: "URL hostname is required" };
  }

  if (net.isIPv4(cleanHostname) || net.isIPv6(cleanHostname)) {
    if (isPrivateOrReservedIp(cleanHostname)) {
      return { valid: false, error: "Security rejection: Cannot access private/reserved IP directly" };
    }
    return { valid: true, url: parsed };
  }

  const validation = await validateTargetNotPrivate(cleanHostname);
  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }

  return { valid: true, url: parsed };
}

export function validateResolvedIpsArePublic(ips: string[]): { valid: boolean; error?: string } {
  for (const ip of ips) {
    if (isPrivateOrReservedIp(ip)) {
      return { valid: false, error: `Security rejection: Resolved address is private/reserved (${ip})` };
    }
  }
  return { valid: true };
}

export async function validateTargetNotPrivate(hostname: string): Promise<{ valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err4, addresses4) => {
      dns.resolve6(hostname, (err6, addresses6) => {
        const allAddresses = [...(addresses4 || []), ...(addresses6 || [])];

        if (allAddresses.length === 0) {
          resolve({ valid: false, error: `Cannot resolve hostname: ${hostname}` });
          return;
        }

        for (const ip of allAddresses) {
          if (isPrivateOrReservedIp(ip)) {
            resolve({ valid: false, error: `Security rejection: Target resolves to private/reserved IP (${ip})` });
            return;
          }
        }

        resolve({ valid: true });
      });
    });
  });
}
