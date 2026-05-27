"use client";

import { Fingerprint, Radar, Cpu, Wifi } from "lucide-react";
import { BROWSER_TLS_SPECS } from "@/tsSource";

interface FingerprintPreviewProps {
  browserPreset: string;
  tcpTtl: number;
  tcpMss: number;
  tcpWindowSize: number;
  h2WindowIncrement: number;
  cdnType: string;
  connectionReuse: boolean;
  greasingEnabled: boolean;
  tcpPreset: string;
  preferHttp3: boolean;
  grpcEnabled: boolean;
}

const TCP_SCALE = 7; // Standard for modern OSes
const H2_MAX_FRAME = 16384;
const H2_HEADER_TABLE = 65536;

export default function FingerprintPreview({
  browserPreset,
  tcpTtl,
  tcpMss,
  tcpWindowSize,
  h2WindowIncrement,
  cdnType,
  connectionReuse,
  greasingEnabled,
  tcpPreset,
  preferHttp3,
  grpcEnabled,
}: FingerprintPreviewProps) {
  const spec = BROWSER_TLS_SPECS[browserPreset] || BROWSER_TLS_SPECS["chrome_124"];
  const extensionsList = spec?.extensionsList || [];
  const extensionsCount = spec?.extensionsCount || String(extensionsList.length);
  const isH2 = connectionReuse && browserPreset.startsWith("chrome") || browserPreset.startsWith("firefox") || browserPreset.startsWith("safari");

  // Infer OS from TTL
  const osFingerprint =
    tcpTtl === 128 ? "Windows 10/11" :
    tcpTtl === 64 ? "Linux / macOS / Android" :
    `Custom (TTL=${tcpTtl})`;

  // CDN-specific header
  const cdnMapping: Record<string, string> = {
    cloudflare: "CF-Ray / __cf_bm",
    akamai: "Akamai-Ghost / BotManager",
    incapsula: "X-Iinfo / Incap-Client-IP",
    custom: "X-Forwarded-For / AWSALB",
  };

  return (
    <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded space-y-5 shadow-xl">
      <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
        <Radar className="w-4 h-4 text-amber-400" />
        Server-View Fingerprint
      </h2>

      {/* JA4 Header */}
      <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">JA4 TLS Fingerprint</span>
          <span className="text-[9px] text-gray-600 font-mono">tls13 + sni + alpn + extensions</span>
        </div>
        <div className="font-mono text-[11px] text-[#00ffcc] break-all leading-relaxed bg-[#0a0a11] p-2.5 rounded border border-[#1f1f27]">
          <span className="text-gray-500">t13d</span>
          <span className="text-teal-400">1516</span>
          <span className="text-gray-600">_</span>
          <span className="text-amber-400">{extensionsCount.padStart(2, "0")}00</span>
          <span className="text-gray-600">_</span>
          <span className="text-purple-400">{greasingEnabled ? "da2b" : "0000"}</span>
          <span className="text-gray-600">_</span>
          <span className="text-cyan-400">{
            extensionsList.slice(0, 3).join("").replace(/\s/g, "").substring(0, 4)
          }</span>
        </div>
      </div>

      {/* TLS & HTTP/2 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2 flex items-center gap-1.5">
            <Fingerprint className="w-3 h-3 text-cyan-400" />
            TLS Profile
          </h3>
          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Version</span>
              <span className="text-white">TLS 1.3 (0x0304)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ciphers</span>
              <span className="text-teal-400">{spec.ciphersCount || "16"} suites</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Extensions</span>
              <span className="text-purple-400">{extensionsCount} ({extensionsList.length} unique)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">SNI</span>
              <span className="text-green-400">True (encrypted)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ALPN</span>
              <span className="text-white">{isH2 ? "h2, http/1.1" : "http/1.1"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Grease</span>
              <span className={greasingEnabled ? "text-[#00ffcc]" : "text-red-500"}>
                {greasingEnabled ? "✅ Enabled" : "❌ Disabled"}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2 flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-teal-400" />
            H2 Settings
          </h3>
          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">INITIAL_WINDOW</span>
              <span className="text-[#00ffcc]">{(h2WindowIncrement / 1048576).toFixed(1)} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">MAX_FRAME</span>
              <span className="text-white">{H2_MAX_FRAME.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">HEADER_TABLE</span>
              <span className="text-white">{(H2_HEADER_TABLE / 1024).toFixed(0)} KB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Multiplexing</span>
              <span className={isH2 ? "text-green-400" : "text-gray-500"}>
                {isH2 ? "Active" : "Fallback HTTP/1.1"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Streams</span>
              <span className="text-white">100+ concurrent</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">HTTP/3 (QUIC)</span>
              <span className={preferHttp3 ? "text-indigo-400 font-bold" : "text-gray-500"}>
                {preferHttp3 ? "✅ Preferred" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">gRPC Push</span>
              <span className={grpcEnabled ? "text-orange-400 font-bold" : "text-gray-500"}>
                {grpcEnabled ? "✅ Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* TCP/IP SYN Fingerprint */}
      <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3.5">
        <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2 flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-purple-400" />
          TCP/IP SYN Fingerprint
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 font-mono text-[10px]">
          <div className="flex justify-between">
            <span className="text-gray-500">TTL</span>
            <span className="text-amber-400 font-bold">{tcpTtl}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">MSS</span>
            <span className="text-purple-400">{tcpMss}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Window</span>
            <span className="text-cyan-400">{tcpWindowSize.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Window Scale</span>
            <span className="text-white">x{TCP_SCALE}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">SACK</span>
            <span className="text-green-400">Permitted</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Timestamps</span>
            <span className="text-green-400">Enabled</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">TCP_NODELAY</span>
            <span className="text-green-400">SetNoDelay(true)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">OS Signature</span>
            <span className="text-yellow-400 font-mono text-[9px]">{osFingerprint}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Platform ID</span>
            <span className="text-white uppercase text-[9px]">{tcpPreset}</span>
          </div>
        </div>
      </div>

      {/* Server-visible Headers + CDN target */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2">Target WAF/CDN</h3>
          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">CDN Engine</span>
              <span className="text-white font-bold">{cdnType.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Detection Key</span>
              <span className="text-gray-400 text-[9px]">{cdnMapping[cdnType] || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Bypass State</span>
              <span className="text-[#00ffcc] font-bold">OPTIMIZED_ON</span>
            </div>
          </div>
        </div>

        <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2">User-Agent</h3>
          <div className="font-mono text-[10px] text-gray-300 break-all">
            {spec?.userAgent || "Mozilla/5.0"}
          </div>
          <div className="mt-2 pt-2 border-t border-[#2d2d35]/40">
            <div className="flex justify-between font-mono text-[10px]">
              <span className="text-gray-500">Browser</span>
              <span className="text-white">{browserPreset.replace(/_/g, " v")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
