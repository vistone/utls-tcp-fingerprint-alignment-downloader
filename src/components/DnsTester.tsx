"use client";

import { useRef, useEffect } from "react";
import { Sliders, Play, RefreshCw, Compass, Zap } from "lucide-react";

interface DnsTestResult {
  success: boolean;
  resolvedIps: string[];
  selectedIp: string;
  latencies: Record<string, number>;
  logs: string[];
  cacheHit: boolean;
  error?: string;
  ipInfo?: Record<string, { city?: string; region?: string; country?: string; country_name?: string; org?: string; hostname?: string; loc?: string; timezone?: string; postal?: string; error?: string }>;
}

interface DnsTesterProps {
  dnsTestDomain: string;
  setDnsTestDomain: (v: string) => void;
  dnsTestLoading: boolean;
  dnsTestResult: DnsTestResult | null;
  dnsServers: string;
  dnsTimeout: number;
  dnsParallel: boolean;
  dnsCacheEnabled: boolean;
  dnsHosts: string;
  lbStrategy: string;
  handleRunDnsTest: () => void;
}

export default function DnsTester({
  dnsTestDomain,
  setDnsTestDomain,
  dnsTestLoading,
  dnsTestResult,
  dnsServers,
  dnsTimeout,
  dnsParallel,
  dnsCacheEnabled,
  dnsHosts,
  lbStrategy,
  handleRunDnsTest,
}: DnsTesterProps) {
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logRef.current && dnsTestResult) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [dnsTestResult]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4 font-mono text-xs">
        <div className="bg-[#050507] border border-[#2d2d35] p-4 rounded-lg space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider border-b border-gray-800 pb-1.5 flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-purple-400" /> Control Panel
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Test Domain:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dnsTestDomain}
                  onChange={(e) => setDnsTestDomain(e.target.value)}
                  placeholder="e.g. kh.google.com"
                  className="flex-grow bg-[#111116] border border-[#2d2d35] p-2 text-white text-xs rounded focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-1">
              <span className="text-[10px] text-gray-500 block mb-1">Quick Select:</span>
              <div className="flex flex-wrap gap-1.5">
                {["kh.google.com", "google.com", "example.com", "cloudflare.com"].map((dom) => (
                  <button
                    key={dom}
                    onClick={() => setDnsTestDomain(dom)}
                    className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer transition ${
                      dnsTestDomain === dom
                        ? "bg-purple-500/10 border-purple-500 text-purple-300 font-bold"
                        : "bg-transparent border-gray-800 text-gray-400 hover:border-gray-700"
                    }`}
                  >
                    {dom}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleRunDnsTest}
                disabled={dnsTestLoading || !dnsTestDomain.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-4 rounded text-xs select-none shadow transition cursor-pointer flex items-center justify-center gap-2 font-mono"
              >
                {dnsTestLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-purple-200" />
                    Resolve & Benchmark
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[#050507] border border-[#2d2d35] p-4 rounded-lg space-y-2">
          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active Strategy</h4>
          <div className="divide-y divide-gray-800 text-[10px]">
            <div className="py-1.5 flex justify-between">
              <span className="text-gray-500">Servers:</span>
              <span className="text-gray-300 text-right">{dnsServers}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-gray-500">Strategy:</span>
              <span className="text-purple-300 uppercase font-bold">{lbStrategy}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-gray-500">Timeout:</span>
              <span className="text-gray-300">{dnsTimeout} ms</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-gray-500">Parallel:</span>
              <span className="text-gray-300">{dnsParallel ? "Parallel" : "Serial"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 space-y-4 font-mono">
        {dnsTestResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#050507] border border-[#2d2d35] p-3 rounded-lg">
                <span className="text-[10px] text-gray-500 block">SELECTED WINNER IP</span>
                <span className="text-sm font-bold text-[#e0a7fc] mt-1 break-all flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-purple-400 shrink-0" />
                  {dnsTestResult.selectedIp || "N/A"}
                </span>
              </div>
              <div className="bg-[#050507] border border-[#2d2d35] p-3 rounded-lg">
                <span className="text-[10px] text-gray-500 block">RESOLUTION STATS</span>
                <span className="text-xs font-bold text-white mt-1">
                  {dnsTestResult.cacheHit ? (
                    <span className="text-cyan-400 font-bold flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" /> Cache Hit (TTL)
                    </span>
                  ) : (
                    <span className="text-green-400 font-bold">Cold Resolve</span>
                  )}
                </span>
              </div>
            </div>

            <div className="bg-[#050507] border border-[#2d2d35] p-4 rounded-lg space-y-3">
              <h4 className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">IP Map & Latency</h4>
              {dnsTestResult.resolvedIps.length === 0 ? (
                <div className="text-xs text-gray-500 py-4 text-center">No IP records resolved.</div>
              ) : (
                <div className="space-y-2.5">
                  {dnsTestResult.resolvedIps.map((ip) => {
                    const lat = dnsTestResult.latencies[ip];
                    const isWinner = dnsTestResult.selectedIp === ip;
                    const ipDetail = dnsTestResult.ipInfo?.[ip];
                    return (
                      <div key={ip} className="space-y-1.5">
                        <div
                          className={`p-2.5 rounded border flex items-center justify-between text-xs ${
                            isWinner ? "bg-purple-950/20 border-purple-500" : "bg-[#111116] border-gray-800"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isWinner ? "bg-purple-400 animate-pulse" : "bg-gray-600"}`} />
                            <span className="text-white font-bold">{ip}</span>
                            {isWinner && (
                              <span className="bg-purple-900/40 text-purple-300 border border-purple-500/30 text-[9px] px-1.5 py-0.2 rounded font-bold">
                                WINNER
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {lat !== undefined ? (
                              lat >= 0 ? (
                                <>
                                  <div className="w-16 h-1.5 bg-gray-800 rounded overflow-hidden">
                                    <div
                                      className={`h-full rounded ${lat < 10 ? "bg-green-500" : lat < 50 ? "bg-teal-400" : "bg-amber-500"}`}
                                      style={{ width: `${Math.min(100, (1 - lat / 1500) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="font-bold text-gray-300 text-[11px] min-w-[40px] text-right">{lat}ms</span>
                                </>
                              ) : (
                                <span className="text-red-500 text-[10px] font-bold">TIMEOUT</span>
                              )
                            ) : (
                              <span className="text-gray-500 text-[10px]">Pending...</span>
                            )}
                          </div>
                        </div>
                        {ipDetail && !ipDetail.error && (
                          <div className="ml-5 px-2.5 py-1.5 bg-[#0a0a10] border border-gray-800/50 rounded text-[10px] flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
                            {ipDetail.city && <span><span className="text-gray-500">City:</span> {ipDetail.city}{ipDetail.region ? `, ${ipDetail.region}` : ""}</span>}
                            {ipDetail.country && <span><span className="text-gray-500">Country:</span> {ipDetail.country}{ipDetail.country_name ? ` (${ipDetail.country_name})` : ""}</span>}
                            {ipDetail.org && <span><span className="text-gray-500">ISP:</span> <span className="text-cyan-400">{ipDetail.org}</span></span>}
                            {ipDetail.hostname && <span><span className="text-gray-500">Host:</span> <span className="text-teal-400">{ipDetail.hostname}</span></span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-[#050507] border border-[#2d2d35] p-4 rounded-lg">
              <h4 className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-2">Decision Tree Logs</h4>
              <div
                ref={logRef}
                className="bg-[#111116]/80 p-3 rounded border border-gray-800 text-[10.5px] font-mono leading-relaxed space-y-1.5 overflow-y-auto w-full text-gray-300"
                style={{ maxHeight: "min(170px, 14vh)" }}
              >
                {dnsTestResult.logs.map((logLine, idx) => (
                  <div key={idx} className="border-b border-gray-800/10 last:border-0 pb-1 flex items-start gap-1">
                    <span className="text-[#a855f7] shrink-0">{">"}</span>
                    <span className="break-all">{logLine}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#050507] border border-[#2d2d35] rounded-xl flex flex-col items-center justify-center p-12 min-h-[300px] text-center space-y-4">
            <div className="p-4 bg-purple-500/5 rounded-full border border-purple-500/15">
              <Compass className="w-10 h-10 text-purple-400/80" />
            </div>
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono">DNS Tester Ready</h4>
            <p className="text-[11px] text-gray-500 max-w-[340px] leading-relaxed">
              Enter a domain to test DNS resolution across your configured upstream servers with latency benchmarking.
            </p>
            <button
              onClick={handleRunDnsTest}
              className="bg-purple-950/30 text-purple-300 border border-purple-500/20 hover:bg-purple-900/30 px-5 py-2 rounded text-xs transition duration-150 font-bold uppercase tracking-wider cursor-pointer font-mono"
            >
              Quick Test kh.google.com
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
