"use client";

import { useTranslations } from "next-intl";
import { useRef, useEffect, useState } from "react";
import { SlidersHorizontal, Play, RefreshCw, Network } from "lucide-react";

interface CachedDomain {
  domain: string;
  ipv4Count: number;
  ipv6Count: number;
}

interface GlobalDnsManagerProps {
  globalDnsStatus: {
    serverCount: number;
    cachedDomains: CachedDomain[];
    cacheContent: Record<string, { ipv4: string[]; ipv6: string[] }>;
    servers: Record<string, string>;
  } | null;
  batchDomainsInput: string;
  setBatchDomainsInput: (v: string) => void;
  batchTimeout: number;
  setBatchTimeout: (v: number) => void;
  batchConcurrency: number;
  setBatchConcurrency: (v: number) => void;
  batchResolving: boolean;
  batchLogs: string[];
  handleRunBatchDns: () => void;
  handleDeleteCacheDomain: (domain?: string) => void;
}

export default function GlobalDnsManager({
  globalDnsStatus,
  batchDomainsInput,
  setBatchDomainsInput,
  batchTimeout,
  setBatchTimeout,
  batchConcurrency,
  setBatchConcurrency,
  batchResolving,
  batchLogs,
  handleRunBatchDns,
  handleDeleteCacheDomain,
}: GlobalDnsManagerProps) {
  const t = useTranslations("GlobalDnsManager");
  const logRef = useRef<HTMLDivElement | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const selectedData = selectedDomain && globalDnsStatus?.cacheContent?.[selectedDomain]
    ? globalDnsStatus.cacheContent[selectedDomain]
    : null;

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [batchLogs]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4 font-mono text-xs">
        <div className="bg-[#050507] border border-[#2d2d35] p-4 rounded-lg space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider border-b border-gray-800 pb-1.5 flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" /> {t("batchSettings")}
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">{t("domainsLabel")}</label>
              <textarea
                rows={3}
                value={batchDomainsInput}
                onChange={(e) => setBatchDomainsInput(e.target.value)}
                placeholder="google.com, github.com, cloudflare.com"
                className="w-full bg-[#111116] border border-[#2d2d35] p-2 text-white text-xs rounded focus:outline-none focus:border-cyan-500 font-mono resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{t("timeout")}</label>
                <input
                  type="number"
                  min={100}
                  max={5000}
                  value={batchTimeout}
                  onChange={(e) => setBatchTimeout(Number(e.target.value))}
                  className="w-full bg-[#111116] border border-[#2d2d35] p-2 text-white text-xs rounded focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{t("concurrency")}</label>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={batchConcurrency}
                  onChange={(e) => setBatchConcurrency(Number(e.target.value))}
                  className="w-full bg-[#111116] border border-[#2d2d35] p-2 text-white text-xs rounded focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleRunBatchDns}
                disabled={batchResolving || !batchDomainsInput.trim()}
                className="w-full bg-cyan-700 hover:bg-cyan-600 text-white font-bold py-2.5 px-4 rounded text-xs select-none shadow transition cursor-pointer flex items-center justify-center gap-2 font-mono"
              >
                {batchResolving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {t("resolvingGlobally")}
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-cyan-200" />
                    {t("runBatchResolve")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[#050507] border border-[#2d2d35] p-4 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{t("cacheDatabase")}</span>
            <div className="flex items-center gap-1.5 text-[9px] bg-green-950/20 text-green-400 border border-green-900/30 px-1.5 py-0.2 rounded font-bold uppercase animate-pulse">
              {t("active")}
            </div>
          </div>

          <div className="divide-y divide-gray-800 text-[10px] bg-[#111116]/30 p-2 rounded">
            <div className="pb-1.5 flex justify-between">
              <span className="text-gray-500">{t("cachedDomains")}</span>
              <span className="text-cyan-400 font-bold">{globalDnsStatus?.cachedDomains?.length || 0}</span>
            </div>
            <div className="pt-1.5 flex justify-between">
              <span className="text-gray-500">{t("filePrefix")}</span>
              <span className="text-gray-400 font-mono text-[9px]">/dns_records/</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (globalDnsStatus?.cacheContent) {
                  navigator.clipboard.writeText(JSON.stringify(globalDnsStatus.cacheContent, null, 2));
                }
              }}
              disabled={!globalDnsStatus?.cacheContent || Object.keys(globalDnsStatus.cacheContent).length === 0}
              className="flex-1 bg-gray-950 hover:bg-gray-900 text-gray-300 border border-gray-800 py-1.5 rounded text-[10px] cursor-pointer font-bold"
            >
              {t("copyJson")}
            </button>
            <button
              onClick={() => handleDeleteCacheDomain()}
              disabled={!globalDnsStatus?.cachedDomains || globalDnsStatus.cachedDomains.length === 0}
              className="flex-1 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/45 py-1.5 rounded text-[10px] cursor-pointer font-bold"
            >
              {t("clearAll")}
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 space-y-4 font-mono">
        <div className="bg-[#050507] border border-[#2d2d35] p-4 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{t("batchLogs")}</h4>
            {batchResolving && (
              <div className="flex items-center gap-1.5 text-cyan-400 text-[10px]">
                <RefreshCw className="w-3 h-3 animate-spin text-cyan-500" />
                {t("resolving")}
              </div>
            )}
          </div>
          <div
            ref={logRef}
            className="bg-[#111116] p-3 rounded border border-gray-800 text-[10.5px] font-mono leading-relaxed space-y-1.5 overflow-y-auto w-full text-cyan-200"
            style={{ maxHeight: "min(160px, 13vh)" }}
          >
            {batchLogs.length === 0 ? (
              <div className="text-gray-500 italic">{t("noLogs")}</div>
            ) : (
              batchLogs.map((logLine, idx) => (
                <div key={idx} className="border-b border-gray-800/10 last:border-0 pb-1 flex items-start gap-1">
                  <span className="text-cyan-500 shrink-0">{">"}</span>
                  <span className="break-all text-[10px]">{logLine}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#050507] border border-[#2d2d35] p-4 rounded-lg space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{t("cachedDomainsTitle")}</h4>
            <span className="text-[9px] text-[#00ffcc] font-mono bg-[#00ffcc]/5 px-2 py-0.5 rounded border border-[#00ffcc]/20">
              {t("jsonLayer")}
            </span>
          </div>

          {globalDnsStatus?.cachedDomains && globalDnsStatus.cachedDomains.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto">
                {globalDnsStatus.cachedDomains.map((entry) => (
                  <button
                    key={entry.domain}
                    onClick={() => setSelectedDomain(selectedDomain === entry.domain ? null : entry.domain)}
                    className={`text-left bg-[#111116] border p-2.5 rounded flex flex-col justify-between transition cursor-pointer ${
                      selectedDomain === entry.domain
                        ? "border-cyan-500/50 bg-cyan-500/5"
                        : "border-gray-800 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold font-mono truncate max-w-[150px] ${
                        selectedDomain === entry.domain ? "text-cyan-300" : "text-white"
                      }`}>{entry.domain}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCacheDomain(entry.domain); }}
                        className="text-red-400 hover:text-red-300 text-[9px] font-mono hover:underline"
                      >
                        DELETE
                      </button>
                    </div>
                    <div className="flex gap-4 mt-1.5 font-mono text-[10px] text-gray-500">
                      <span>IPv4: <strong className="text-cyan-400">{entry.ipv4Count}</strong></span>
                      <span>IPv6: <strong className="text-pink-400">{entry.ipv6Count}</strong></span>
                    </div>
                  </button>
                ))}
              </div>

              {selectedData ? (
                <div className="space-y-2 border border-cyan-500/20 rounded-lg p-3 bg-[#111116]/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-cyan-400 font-mono">{selectedDomain}</span>
                    <button
                      onClick={() => setSelectedDomain(null)}
                      className="text-[9px] text-gray-500 hover:text-gray-300 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {selectedData.ipv4 && selectedData.ipv4.length > 0 && (
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase mb-1">IPv4 ({selectedData.ipv4.length})</div>
                      <div className="space-y-0.5">
                        {selectedData.ipv4.map((ip: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                            <span className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" />
                            <span className="text-gray-300">{ip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedData.ipv6 && selectedData.ipv6.length > 0 && (
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase mb-1">IPv6 ({selectedData.ipv6.length})</div>
                      <div className="space-y-0.5">
                        {selectedData.ipv6.map((ip: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                            <span className="w-1 h-1 rounded-full bg-pink-400 shrink-0" />
                            <span className="text-gray-300">{ip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!selectedData.ipv4 || selectedData.ipv4.length === 0) &&
                   (!selectedData.ipv6 || selectedData.ipv6.length === 0) && (
                    <div className="text-[10px] text-gray-500 italic">No IP records for this domain.</div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-[10px] text-gray-600 border border-dashed border-gray-800 rounded bg-[#111116]/30">
                  {t("selectDomainHint")}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 text-xs text-gray-500 border border-dashed border-gray-800 rounded bg-[#111116]/30">
              {t("noCachedDomains")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
