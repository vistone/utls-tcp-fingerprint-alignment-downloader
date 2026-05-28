"use client";

import { useTranslations } from "next-intl";
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
}: FingerprintPreviewProps) {
  const t = useTranslations("FingerprintPreview");
  const spec = BROWSER_TLS_SPECS[browserPreset] || BROWSER_TLS_SPECS["chrome_124"];
  const extensionsList = spec?.extensionsList || [];
  const extensionsCount = spec?.extensionsCount || String(extensionsList.length);
  const isH2 = connectionReuse && (browserPreset.startsWith("chrome") || browserPreset.startsWith("firefox") || browserPreset.startsWith("safari"));

  // Infer OS from TTL
  const osFingerprint =
    tcpTtl === 128 ? t("osWindows") :
    tcpTtl === 64 ? t("osUnix") :
    `Custom (TTL=${tcpTtl})`;

  // CDN-specific header
  const cdnMapping: Record<string, string> = {
    cloudflare: t("cdnMapping.cloudflare"),
    akamai: t("cdnMapping.akamai"),
    incapsula: t("cdnMapping.incapsula"),
    custom: t("cdnMapping.custom"),
  };

  return (
    <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded space-y-5 shadow-xl">
      <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
        <Radar className="w-4 h-4 text-amber-400" />
        {t("sectionTitle")}
      </h2>

      {/* JA4 Header */}
      <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">{t("ja4Label")}</span>
          <span className="text-[9px] text-gray-600 font-mono">{t("ja4Sublabel")}</span>
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
            {t("tlsProfile")}
          </h3>
          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">{t("version")}</span>
              <span className="text-white">{t("tlsVersion")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("ciphers")}</span>
              <span className="text-teal-400">{spec.ciphersCount || "16"} suites</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("extensions")}</span>
              <span className="text-purple-400">{extensionsCount} ({extensionsList.length} unique)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("sni")}</span>
              <span className="text-green-400">{t("sniValue")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("alpn")}</span>
              <span className="text-white">{isH2 ? t("h2Alpn") : t("h11Alpn")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("grease")}</span>
              <span className={greasingEnabled ? "text-[#00ffcc]" : "text-red-500"}>
                {greasingEnabled ? t("greaseEnabled") : t("greaseDisabled")}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2 flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-teal-400" />
            {t("h2Settings")}
          </h3>
          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">{t("initialWindow")}</span>
              <span className="text-[#00ffcc]">{(h2WindowIncrement / 1048576).toFixed(1)} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("maxFrame")}</span>
              <span className="text-white">{H2_MAX_FRAME.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("headerTable")}</span>
              <span className="text-white">{(H2_HEADER_TABLE / 1024).toFixed(0)} KB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("multiplexing")}</span>
              <span className={isH2 ? "text-green-400" : "text-gray-500"}>
                {isH2 ? t("multiplexingActive") : t("multiplexingFallback")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("maxStreams")}</span>
              <span className="text-white">{t("maxStreamsValue")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("http3")}</span>
              <span className="text-gray-500">{t("http3Detect")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* TCP/IP SYN Fingerprint */}
      <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3.5">
        <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2 flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-purple-400" />
          {t("tcpSectionTitle")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 font-mono text-[10px]">
          <div className="flex justify-between">
            <span className="text-gray-500">{t("ttl")}</span>
            <span className="text-amber-400 font-bold">{tcpTtl}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("mss")}</span>
            <span className="text-purple-400">{tcpMss}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("window")}</span>
            <span className="text-cyan-400">{tcpWindowSize.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("windowScale")}</span>
            <span className="text-white">x{TCP_SCALE}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("sack")}</span>
            <span className="text-green-400">{t("sackValue")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("timestamps")}</span>
            <span className="text-green-400">{t("timestampsValue")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("tcpNodelay")}</span>
            <span className="text-green-400">{t("tcpNodelayValue")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("osSignature")}</span>
            <span className="text-yellow-400 font-mono text-[9px]">{osFingerprint}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("platformId")}</span>
            <span className="text-white uppercase text-[9px]">{tcpPreset}</span>
          </div>
        </div>
      </div>

      {/* Server-visible Headers + CDN target */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2">{t("targetWaf")}</h3>
          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">{t("cdnEngine")}</span>
              <span className="text-white font-bold">{cdnType.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("detectionKey")}</span>
              <span className="text-gray-400 text-[9px]">{cdnMapping[cdnType] || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("bypassState")}</span>
              <span className="text-[#00ffcc] font-bold">{t("bypassStateValue")}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#050507] border border-[#2d2d35]/60 rounded-lg p-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase font-mono mb-2">{t("userAgent")}</h3>
          <div className="font-mono text-[10px] text-gray-300 break-all">
            {spec?.userAgent || "Mozilla/5.0"}
          </div>
          <div className="mt-2 pt-2 border-t border-[#2d2d35]/40">
            <div className="flex justify-between font-mono text-[10px]">
              <span className="text-gray-500">{t("browser")}</span>
              <span className="text-white">{browserPreset.replace(/_/g, " v")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
