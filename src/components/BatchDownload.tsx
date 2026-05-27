"use client";

import { useRef, useEffect } from "react";
import { Terminal, RefreshCw, SlidersHorizontal } from "lucide-react";

interface BatchItem {
  id: number;
  url: string;
  filename: string;
  status: "idle" | "handshake" | "downloading" | "completed" | "failed";
  progress: number;
  speed: number;
  receivedSize: number;
  totalSize: number;
  logs: string[];
}

interface BatchDownloadProps {
  batchItems: BatchItem[];
  selectedBatchItemId: number;
  setSelectedBatchItemId: (id: number) => void;
  isBatchRunning: boolean;
  runAllBatchDownloads: () => void;
  startBatchItemDownload: (id: number) => void;
  browserPreset: string;
  tcpPreset: string;
  tcpTtl: number;
  tcpMss: number;
  tcpWindowSize: number;
  connectionReuse: boolean;
}

export default function BatchDownload({
  batchItems,
  selectedBatchItemId,
  setSelectedBatchItemId,
  isBatchRunning,
  runAllBatchDownloads,
  startBatchItemDownload,
  browserPreset,
  tcpPreset,
  tcpTtl,
  tcpMss,
  tcpWindowSize,
  connectionReuse,
}: BatchDownloadProps) {
  const logRef = useRef<HTMLDivElement | null>(null);
  const selectedItem = batchItems.find((x) => x.id === selectedBatchItemId) || batchItems[0];

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [batchItems, selectedBatchItemId]);

  return (
    <>
      <div className="lg:col-span-7 flex flex-col gap-6">
        <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded flex-grow flex flex-col shadow-2xl relative">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 mb-5 border-b border-[#2d2d35]/60 pb-4">
            <div>
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-teal-400" />
                Batch Dispatch Pool
              </h3>
              <p className="text-[10px] font-mono text-gray-500 mt-0.5">
                Concurrency: <span className="text-white font-bold">{batchItems.length} CHUNKS</span>
              </p>
            </div>
            <button
              onClick={runAllBatchDownloads}
              disabled={isBatchRunning}
              className={`px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-400 text-[#050507] font-mono font-extrabold text-[10.5px] rounded tracking-wider shadow-[0_0_15px_rgba(20,184,166,0.25)] transition active:scale-95 cursor-pointer uppercase shrink-0 ${
                isBatchRunning ? "opacity-50 cursor-not-allowed" : "hover:from-teal-400 hover:to-emerald-300"
              }`}
            >
              Start All
            </button>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[390px] pr-1.5">
            {batchItems.map((item, idx) => {
              const isSelected = selectedBatchItemId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedBatchItemId(item.id)}
                  className={`p-3.5 rounded border transition-all duration-200 cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? "border-[#00ffcc] bg-[#00ffcc]/5 shadow-[inset_0_0_12px_rgba(0,255,204,0.08)]"
                      : "border-[#2d2d35] bg-[#09090d] hover:border-gray-600 hover:bg-[#111116]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 font-mono text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-gray-600 font-bold shrink-0">
                        [{idx.toString().padStart(2, "0")}]
                      </span>
                      <div className="min-w-0">
                        <span className="text-white font-extrabold block truncate text-[11px]">{item.filename}</span>
                        <span className="text-gray-500 text-[9.5px] block truncate mt-0.5">{item.url}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === "idle" && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold border border-gray-800 bg-gray-900/40 text-gray-500">
                          IDLE
                        </span>
                      )}
                      {item.status === "handshake" && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold border border-cyan-500 bg-cyan-500/10 text-cyan-300 animate-pulse flex items-center gap-1">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          ALIGN
                        </span>
                      )}
                      {item.status === "downloading" && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold border border-teal-500 bg-teal-500/10 text-[#00ffcc]">
                          ACTIVE
                        </span>
                      )}
                      {item.status === "completed" && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold border border-emerald-500 bg-emerald-500/10 text-emerald-400">
                          DONE
                        </span>
                      )}
                      {item.status === "failed" && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold border border-rose-500 bg-rose-500/10 text-rose-300">
                          403
                        </span>
                      )}
                      {item.id >= 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startBatchItemDownload(item.id);
                          }}
                          disabled={item.status === "handshake" || item.status === "downloading"}
                          className="p-1 px-1.5 bg-teal-950/40 hover:bg-teal-900/60 border border-teal-500/30 text-teal-300 rounded text-[9px] font-extrabold transition disabled:opacity-30 cursor-pointer"
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono mt-1 border-t border-[#1f1f27] pt-2">
                    <div className="text-gray-500">
                      Speed: <span className="text-white font-bold">{item.speed ? `${item.speed} MB/s` : "0 B/s"}</span>
                    </div>
                    <div className="text-gray-500 text-center">
                      Size:{" "}
                      <span className="text-gray-300 font-bold">
                        {item.receivedSize > 1024 * 1024
                          ? `${(item.receivedSize / (1024 * 1024)).toFixed(2)} MB`
                          : `${(item.receivedSize / 1024).toFixed(1)} KB`}
                      </span>
                    </div>
                    <div className="text-right text-[#00ffcc] font-bold">{Math.round(item.progress)}%</div>
                  </div>

                  <div className="h-1.5 bg-[#111116] rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full bg-gradient-to-r from-teal-500 to-[#00ffcc] transition-all duration-300 ${
                        item.status === "failed" ? "from-rose-500 to-rose-400" : ""
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="lg:col-span-5 flex flex-col gap-6">
        <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded shadow-2xl relative overflow-hidden flex-1 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5 text-teal-400 border-b border-[#2d2d35] pb-2">
              <Terminal className="w-4 h-4 text-teal-500" />
              Log Trace Analyzer
            </h3>

            {!selectedItem ? (
              <div className="text-center text-gray-500 italic text-[11px] py-10 font-mono">
                No manifest loaded
              </div>
            ) : (
              <div className="space-y-4">
                <div className="font-mono text-xs p-2.5 bg-[#050507] border border-[#1f1f27] rounded">
                  <div className="text-[9px] uppercase text-gray-500 mb-0.5">
                    Target #{selectedItem.id >= 0 ? selectedItem.id + 1 : "ERR"}:
                  </div>
                  <div className="text-white font-extrabold truncate" title={selectedItem.filename}>
                    {selectedItem.filename}
                  </div>
                  <div className="text-gray-400 text-[10px] truncate mt-0.5">{selectedItem.url}</div>
                </div>

                <div
                  ref={logRef}
                  className="bg-[#050507] rounded p-3.5 border border-[#1f1f27] font-mono text-[9.5px] leading-relaxed overflow-y-auto space-y-1"
                  style={{ maxHeight: "min(290px, 24vh)", minHeight: "min(190px, 16vh)" }}
                >
                  {selectedItem.logs && selectedItem.logs.length > 0 ? (
                    selectedItem.logs.map((log, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-gray-600 shrink-0">[{i.toString().padStart(2, "0")}]</span>
                        <span
                          className={
                            log.includes("[NIC-HW]")
                              ? "text-fuchsia-300 font-bold"
                              : log.includes("[NIC-TRACK]")
                                ? "text-cyan-300 font-bold animate-pulse"
                                : log.includes("[H2-POOL]") || log.includes("[TCP-REUSE]")
                                  ? "text-[#00ffcc] font-bold"
                                  : log.includes("✅") || log.includes("HTTP] 200")
                                    ? "text-emerald-400"
                                    : log.includes("❌") || log.includes("ERROR")
                                      ? "text-rose-400 font-bold"
                                      : log.includes("[TLS]") || log.includes("[DNS]")
                                        ? "text-cyan-400"
                                        : "text-gray-300"
                          }
                        >
                          {log}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-600 italic text-center py-12">Not started.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#050507]/40 p-3 rounded-lg border border-[#1f1f27] mt-3 space-y-3">
            <div className="flex items-center justify-between border-b border-[#1f1f27]/60 pb-1.5">
              <div className="text-[10px] font-mono text-[#00ffcc] font-bold flex items-center gap-1.5 uppercase tracking-wide">
                <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
                NIC Fingerprint Alignment
              </div>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 rounded font-mono font-extrabold animate-pulse">
                ACTIVE
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 font-mono text-[10px] text-gray-400 pb-1.5 border-b border-[#1f1f27]/40">
              <div>TLS: <span className="text-teal-300 font-bold">{browserPreset.toUpperCase()}</span></div>
              <div>OS TCP: <span className="text-white font-bold">{tcpPreset.toUpperCase()}</span></div>
              <div>IP_TTL: <span className="text-yellow-400 font-bold">{tcpTtl}</span></div>
              <div>MSS: <span className="text-yellow-400 font-bold">{tcpMss}B</span></div>
            </div>
            <div className="space-y-1 text-[9px] font-mono text-gray-400">
              <div className="flex justify-between">
                <span>NIC:</span>
                <span className="text-fuchsia-300 font-bold">eth0 [10-Gbps]</span>
              </div>
              <div className="flex justify-between">
                <span>Window Size:</span>
                <span className="text-cyan-300 font-bold">{tcpWindowSize}</span>
              </div>
              <div className="flex justify-between">
                <span>Connection Reuse:</span>
                <span className={connectionReuse ? "text-[#00ffcc] font-bold" : "text-gray-500"}>
                  {connectionReuse ? "Ready (H2 Multiplexing)" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
