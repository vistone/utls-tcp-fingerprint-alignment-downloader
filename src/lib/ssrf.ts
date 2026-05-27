import net from "net";
import dns from "dns";

export function isPrivateOrReservedIp(ip: string): boolean {
  const cleanIp = ip.replace(/^::ffff:/, "");

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
    if (cleanIp.startsWith("fe80")) return true;
    if (cleanIp.startsWith("::ffff:")) return true;
    if (cleanIp === "::") return true;
    if (cleanIp.startsWith("100::")) return true;
    if (cleanIp.startsWith("2001:db8")) return true;
    if (cleanIp.startsWith("ff")) return true;
  }

  return false;
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
