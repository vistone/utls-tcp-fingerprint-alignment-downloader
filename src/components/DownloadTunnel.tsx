"use client";

import { useTranslations } from "next-intl";
import { useRef, useEffect } from "react";
import { Terminal, RefreshCw, TrendingUp } from "lucide-react";

interface DownloadTunnelProps {
  downloadState: "idle" | "handshake" | "requesting" | "downloading" | "completed" | "failed";
  downloadProgress: number;
  downloadSpeed: number;
  downloadLog: string[];
  targetUrl: string;
  startTestDownload: () => void;
  resetDownload: () => void;
}

export default function DownloadTunnel({
  downloadState,
  downloadProgress,
  downloadSpeed,
  downloadLog,
  targetUrl,
  startTestDownload,
  resetDownload,
}: DownloadTunnelProps) {
  const t = useTranslations("DownloadTunnel");
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [downloadLog]);

  const isRunning = downloadState !== "idle" && downloadState !== "completed" && downloadState !== "failed";

  return (
    <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded flex-grow flex flex-col shadow-2xl relative">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
          <Terminal className="w-4 h-4 text-[#00ffcc]" />
          {t("consoleTitle")}
        </h3>
        <div className="text-[10px] font-mono text-gray-400">
          {t("hostLabel")} {targetUrl.split("/")[2] || "target-cdn"}
        </div>
      </div>

      <div className="bg-[#050507] rounded p-4 border border-[#1f1f27] flex-1 flex flex-col justify-between">
        <div
          ref={logRef}
          className="space-y-1.5 font-mono text-[10.5px] overflow-y-auto flex-1 mb-4"
          style={{ maxHeight: "min(190px, 18vh)", minHeight: "min(120px, 12vh)" }}
        >
          {downloadLog.length === 0 ? (
            <div className="text-gray-500 italic text-center py-8">
              {t("idleText")}
            </div>
          ) : (
            downloadLog.map((log, i) => (
              <div key={i} className="flex gap-2 leading-relaxed">
                <span className="text-gray-600">[{i.toString().padStart(2, "0")}]</span>
                <span
                  className={
                    log.includes("✅") || log.includes("HTTP] 200")
                      ? "text-emerald-400"
                      : log.includes("❌") || log.includes("🚨")
                        ? "text-rose-400 font-bold"
                        : log.includes("[TLS]")
                          ? "text-cyan-400"
                          : "text-gray-300"
                  }
                >
                  {log}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-[#1f1f27] pt-4 space-y-3">
          <div className="flex justify-between items-center text-xs font-mono">
            <div className="flex items-center gap-1.5">
              {downloadState === "handshake" && (
                <RefreshCw className="w-3.5 h-3.5 text-[#00ffcc] animate-spin" />
              )}
              {downloadState === "downloading" && (
                <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
              )}
              <span className="text-white capitalize">{t("state")} {downloadState}</span>
            </div>
            {downloadState === "downloading" && (
              <span className="text-[#00ffcc] font-bold">{downloadSpeed} {t("mbPerSec")}</span>
            )}
          </div>

          <div className="h-2 bg-[#111116] rounded-full overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-[#00ffcc] transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
            <span>{t("progress")} {Math.round(downloadProgress)}%</span>
            <span>{t("alignment")}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={startTestDownload}
          disabled={isRunning}
          className="flex-1 bg-gradient-to-r from-teal-600 to-[#00ffcc] hover:from-teal-500 hover:to-[#00ffcc]/80 text-[#050507] py-2.5 rounded font-mono font-bold text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(0,255,204,0.25)] disabled:opacity-40 disabled:pointer-events-none active:scale-95 cursor-pointer"
        >
          {t("startButton")}
        </button>
        {(downloadState === "completed" || downloadState === "failed") && (
          <button
            onClick={resetDownload}
            className="bg-[#1f1f27] border border-[#2d2d35] hover:bg-[#252530] text-gray-300 px-4 py-2.5 rounded text-xs font-mono transition cursor-pointer"
          >
            {t("reset")}
          </button>
        )}
      </div>
    </div>
  );
}
