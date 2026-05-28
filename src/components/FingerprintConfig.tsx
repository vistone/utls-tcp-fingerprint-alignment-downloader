"use client";

import { useTranslations } from "next-intl";
import { Network, Lock, SlidersHorizontal } from "lucide-react";

interface FingerprintConfigProps {
  browserPreset: string;
  setBrowserPreset: (v: string) => void;
  cdnType: string;
  setCdnType: (v: "cloudflare" | "akamai" | "incapsula" | "custom") => void;
  tcpTtl: number;
  setTcpTtl: (v: number) => void;
  tcpMss: number;
  setTcpMss: (v: number) => void;
  tcpWindowSize: number;
  setTcpWindowSize: (v: number) => void;
  h2WindowIncrement: number;
  setH2WindowIncrement: (v: number) => void;
  greasingEnabled: boolean;
  setGreasingEnabled: (v: boolean) => void;
  connectionReuse: boolean;
  setConnectionReuse: (v: boolean) => void;
  useProxy: boolean;
  setUseProxy: (v: boolean) => void;
  proxyHost: string;
  setProxyHost: (v: string) => void;
  proxyPort: string;
  setProxyPort: (v: string) => void;
  downloadMode: "single" | "batch";
  setDownloadMode: (v: "single" | "batch") => void;
  targetUrl: string;
  setTargetUrl: (v: string) => void;
  batchManifestUrl: string;
  setBatchManifestUrl: (v: string) => void;
  isParsingManifest: boolean;
  loadBatchManifest: (url: string) => void;
  tcpPreset: string;
  applyPresetConfig: (preset: string) => void;
  grpcEnabled: boolean;
  setGrpcEnabled: (v: boolean) => void;
  grpcHubAddress: string;
  setGrpcHubAddress: (v: string) => void;
  grpcStorageServerId: string;
  setGrpcStorageServerId: (v: string) => void;
  storageServers: { serverId: string; name: string; address: string }[];
}

export default function FingerprintConfig({
  browserPreset,
  setBrowserPreset,
  cdnType,
  setCdnType,
  tcpTtl,
  setTcpTtl,
  tcpMss,
  setTcpMss,
  tcpWindowSize,
  setTcpWindowSize,
  h2WindowIncrement,
  setH2WindowIncrement,
  greasingEnabled,
  setGreasingEnabled,
  connectionReuse,
  setConnectionReuse,
  useProxy,
  setUseProxy,
  proxyHost,
  setProxyHost,
  proxyPort,
  setProxyPort,
  downloadMode,
  setDownloadMode,
  targetUrl,
  setTargetUrl,
  batchManifestUrl,
  setBatchManifestUrl,
  isParsingManifest,
  loadBatchManifest,
  tcpPreset,
  applyPresetConfig,
  grpcEnabled,
  setGrpcEnabled,
  grpcHubAddress,
  setGrpcHubAddress,
  grpcStorageServerId,
  setGrpcStorageServerId,
  storageServers,
}: FingerprintConfigProps) {
  const t = useTranslations("FingerprintConfig");
  return (
    <div className="flex flex-col gap-5">
      {/* Target Host Settings */}
      <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-teal-400 to-[#00ffcc]" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2 mb-4">
          <Network className="w-4 h-4 text-[#00ffcc]" />
          {t("section1Title")}
        </h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono text-gray-500">{t("mode")}</label>
            <div className="grid grid-cols-2 gap-1.5 text-center font-mono text-[10px]">
              <button
                onClick={() => setDownloadMode("single")}
                className={`p-2 border rounded transition ${
                  downloadMode === "single"
                    ? "border-[#00ffcc] bg-[#00ffcc]/10 text-white font-bold"
                    : "border-[#2d2d35] text-gray-400 hover:border-gray-500"
                }`}
              >
                {t("single")}
              </button>
              <button
                onClick={() => setDownloadMode("batch")}
                className={`p-2 border rounded transition ${
                  downloadMode === "batch"
                    ? "border-teal-400 bg-teal-400/10 text-white font-bold"
                    : "border-[#2d2d35] text-gray-400 hover:border-gray-500"
                }`}
              >
                {t("batch")}
              </button>
            </div>
          </div>

          {downloadMode === "single" ? (
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-mono text-gray-400">{t("targetUrl")}</label>
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="w-full bg-[#050507] border border-[#2d2d35] rounded p-2.5 text-xs text-teal-300 focus:outline-none focus:border-[#00ffcc] font-mono"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono text-gray-400">{t("manifestUrl")}</label>
                <input
                  type="text"
                  value={batchManifestUrl}
                  onChange={(e) => setBatchManifestUrl(e.target.value)}
                  className="w-full bg-[#050507] border border-[#2d2d35] rounded p-2.5 text-xs text-teal-300 focus:outline-none focus:border-teal-400 font-mono"
                  placeholder={t("manifestPlaceholder")}
                />
              </div>
              <button
                onClick={() => loadBatchManifest(batchManifestUrl)}
                disabled={isParsingManifest}
                className="w-full bg-teal-600/30 font-bold border border-teal-500/50 text-teal-300 px-3 py-2 rounded text-[10.5px] font-mono transition hover:bg-teal-600/50 disabled:opacity-40"
              >
                {isParsingManifest ? t("parsing") : t("loadManifest")}
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono text-gray-400">{t("cdnType")}</label>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
              {(["cloudflare", "akamai", "incapsula", "custom"] as const).map((cdn) => {
                const colors: Record<string, string> = {
                  cloudflare: "border-amber-500 bg-amber-500/10 text-amber-300",
                  akamai: "border-sky-500 bg-sky-500/10 text-sky-300",
                  incapsula: "border-purple-500 bg-purple-500/10 text-purple-300",
                  custom: "border-teal-500 bg-teal-500/10 text-teal-300",
                };
                const labels: Record<string, string> = {
                  cloudflare: t("cdnOptions.cloudflare"),
                  akamai: t("cdnOptions.akamai"),
                  incapsula: t("cdnOptions.incapsula"),
                  custom: t("cdnOptions.custom"),
                };
                return (
                  <button
                    key={cdn}
                    onClick={() => setCdnType(cdn)}
                    className={`p-2 border rounded transition ${
                      cdnType === cdn ? colors[cdn] : "border-[#2d2d35] text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {labels[cdn]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 p-3 bg-[#050507] border border-[#2d2d35]/60 rounded">
            <div className="flex items-center justify-between">
              <div className="max-w-[75%]">
                <span className="text-[10px] uppercase font-mono text-cyan-300 font-bold">
                  {t("connectionReuse")}
                </span>
              </div>
              <button
                onClick={() => setConnectionReuse(!connectionReuse)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  connectionReuse ? "bg-[#00ffcc]" : "bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-[#111116] shadow-lg transition ${
                    connectionReuse ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="space-y-3 p-3 bg-[#050507] border border-[#2d2d35]/60 rounded">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono text-amber-400 font-bold">{t("proxyTunnel")}</span>
              <button
                onClick={() => setUseProxy(!useProxy)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  useProxy ? "bg-amber-500" : "bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-[#111116] shadow-lg transition ${
                    useProxy ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {useProxy && (
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[10px]">
                <div className="col-span-2">
                  <label className="text-[9px] text-gray-500 block mb-1">{t("host")}</label>
                  <input
                    type="text"
                    value={proxyHost}
                    onChange={(e) => setProxyHost(e.target.value)}
                    placeholder={t("hostPlaceholder")}
                    className="w-full bg-[#111116] border border-[#2d2d35] rounded px-2.5 py-1.5 text-amber-300 focus:outline-none focus:border-amber-500 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 block mb-1">{t("port")}</label>
                  <input
                    type="text"
                    value={proxyPort}
                    onChange={(e) => setProxyPort(e.target.value)}
                    placeholder={t("portPlaceholder")}
                    className="w-full bg-[#111116] border border-[#2d2d35] rounded px-2.5 py-1.5 text-amber-300 focus:outline-none focus:border-amber-500 text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* gRPC Distributed Storage */}
      <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded relative overflow-hidden shadow-xl">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2 mb-4">
          <span className="w-4 h-4 text-orange-400">⬡</span>
          {t("sectionGrpcTitle")}
        </h2>
        <div className="space-y-3 font-mono text-xs">
          <div className="space-y-1.5 p-3 bg-[#050507] border border-[#2d2d35]/60 rounded">
            <div className="flex items-center justify-between">
              <div className="max-w-[75%]">
                <span className="text-[10px] uppercase font-mono text-orange-400 font-bold">
                  gRPC Push
                </span>
              </div>
              <button
                onClick={() => setGrpcEnabled(!grpcEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  grpcEnabled ? "bg-orange-500" : "bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-[#111116] shadow-lg transition ${
                    grpcEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {grpcEnabled && (
              <div className="space-y-1.5 pt-2">
                <label className="text-[9px] text-gray-500 block">{t("grpcHubAddress")}</label>
                <input
                  type="text"
                  value={grpcHubAddress}
                  onChange={(e) => setGrpcHubAddress(e.target.value)}
                  placeholder="localhost:50051"
                  className="w-full bg-[#111116] border border-[#2d2d35] rounded px-2.5 py-1.5 text-orange-300 focus:outline-none focus:border-orange-500 text-xs font-mono"
                />
                <label className="text-[9px] text-gray-500 block">{t("grpcStorageServer")}</label>
                <select
                  value={grpcStorageServerId}
                  onChange={(e) => setGrpcStorageServerId(e.target.value)}
                  className="w-full bg-[#111116] border border-[#2d2d35] rounded px-2.5 py-1.5 text-orange-300 focus:outline-none focus:border-orange-500 text-xs font-mono"
                >
                  <option value="">{t("grpcSelectStorage")}</option>
                  {storageServers.map((s) => (
                    <option key={s.serverId} value={s.serverId}>{s.name} ({s.address})</option>
                  ))}
                </select>
                <p className="text-[9px] text-gray-600">{t("grpcHint")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TLS Profile */}
      <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded relative overflow-hidden shadow-xl">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-cyan-400" />
          {t("section2Title")}
        </h2>
        <div className="space-y-4 font-mono text-xs">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-400 block">{t("browserPreset")}</label>
            <select
              value={browserPreset}
              onChange={(e) => setBrowserPreset(e.target.value)}
              className="w-full bg-[#111116] border border-[#2d2d35] text-white p-2.5 rounded text-xs focus:ring-1 focus:ring-[#00ffcc] focus:outline-none"
            >
              <optgroup label={t("chromeGroup")}>
                <option value="chrome_124">{t("chromeOptions.chrome_124")}</option>
                <option value="chrome_115">{t("chromeOptions.chrome_115")}</option>
                <option value="chrome_100">{t("chromeOptions.chrome_100")}</option>
                <option value="chrome_88">{t("chromeOptions.chrome_88")}</option>
              </optgroup>
              <optgroup label={t("firefoxGroup")}>
                <option value="firefox_120">{t("firefoxOptions.firefox_120")}</option>
                <option value="firefox_110">{t("firefoxOptions.firefox_110")}</option>
                <option value="firefox_90">{t("firefoxOptions.firefox_90")}</option>
              </optgroup>
              <optgroup label={t("safariGroup")}>
                <option value="safari_17">{t("safariOptions.safari_17")}</option>
                <option value="safari_15">{t("safariOptions.safari_15")}</option>
                <option value="safari_13">{t("safariOptions.safari_13")}</option>
              </optgroup>
              <optgroup label={t("utilitiesGroup")}>
                <option value="python_310">{t("utilitiesOptions.python_310")}</option>
                <option value="curl_8">{t("utilitiesOptions.curl_8")}</option>
              </optgroup>
            </select>
          </div>

          <div className="bg-[#050507] p-3 rounded border border-[#1a1a24] space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-400">{t("tlsGrease")}</span>
              <button
                onClick={() => setGreasingEnabled(!greasingEnabled)}
                className={`px-2 py-0.5 rounded text-[10px] border tracking-wider transition ${
                  greasingEnabled
                    ? "border-[#00ffcc] text-[#00ffcc] bg-[#00ffcc]/5"
                    : "border-gray-600 text-gray-500"
                }`}
              >
                {greasingEnabled ? t("greaseEnabled") : t("greaseDisabled")}
              </button>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-400">{t("h2Window")}</span>
              <select
                value={h2WindowIncrement}
                onChange={(e) => setH2WindowIncrement(Number(e.target.value))}
                className="bg-[#111116] border border-[#2d2d35] text-white rounded text-[10px] focus:outline-none p-1"
              >
                <option value={6291456}>{t("h2WindowOptions.chrome")}</option>
                <option value={1048576}>{t("h2WindowOptions.safari")}</option>
                <option value={65535}>{t("h2WindowOptions.http11")}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* TCP/IP Stack */}
      <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded relative overflow-hidden shadow-xl">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2 mb-4">
          <SlidersHorizontal className="w-4 h-4 text-purple-400" />
          {t("section3Title")}
        </h2>

        <div className="space-y-4 font-mono text-xs">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-400 block">{t("tcpStackPreset")}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["windows", "macos", "linux"] as const).map((os) => (
                <button
                  key={os}
                  onClick={() => applyPresetConfig(os)}
                  className={`p-1.5 border rounded cursor-pointer ${
                    tcpPreset === os
                      ? "border-purple-500 bg-purple-500/10 text-white"
                      : "border-[#2d2d35] text-gray-400"
                  }`}
                >
                  {os === "windows" ? t("osPresets.windows") : os === "macos" ? t("osPresets.macos") : t("osPresets.linux")}
                </button>
              ))}
              <button
                onClick={() => applyPresetConfig("mismatched")}
                className="p-1.5 border border-rose-500/30 text-rose-400 bg-rose-500/5 rounded cursor-pointer"
              >
                {t("mismatched")}
              </button>
            </div>
          </div>

          <div className="space-y-3 bg-[#050507] p-3 rounded border border-[#1a1a24]">
            <div>
              <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                <span>{t("ipTtl")}</span>
                <span className="text-[#00ffcc] font-bold">{tcpTtl}</span>
              </div>
              <input
                type="range"
                min={32}
                max={255}
                value={tcpTtl}
                onChange={(e) => setTcpTtl(Number(e.target.value))}
                className="w-full accent-[#00ffcc]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                <span>{t("mss")}</span>
                <span className="text-purple-400 font-bold">{tcpMss} {t("mssUnit")}</span>
              </div>
              <input
                type="range"
                min={1200}
                max={1500}
                value={tcpMss}
                onChange={(e) => setTcpMss(Number(e.target.value))}
                className="w-full accent-purple-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                <span>{t("windowSize")}</span>
                <span className="text-cyan-400 font-bold">{tcpWindowSize.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={8192}
                max={262144}
                step={1024}
                value={tcpWindowSize}
                onChange={(e) => setTcpWindowSize(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
