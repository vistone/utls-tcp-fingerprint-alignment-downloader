"use client";

import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";

interface AlignmentReportProps {
  score: number;
  warnings: string[];
  tcpTtl: number;
}

export default function AlignmentReport({ score, warnings, tcpTtl }: AlignmentReportProps) {
  return (
    <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded flex flex-col relative overflow-hidden shadow-2xl">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-1 font-bold">
            Fingerprint Alignment Score
          </h3>
          <div className="text-3xl font-extrabold text-white font-mono flex items-baseline gap-1">
            {score}
            <span className="text-xs font-normal text-gray-500">/ 100 PTS</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {score >= 75 ? (
            <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-mono font-bold">
              <ShieldCheck className="w-4 h-4" />
              Aligned (Bypass Ready)
            </div>
          ) : (
            <div className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-mono font-bold animate-pulse">
              <ShieldAlert className="w-4 h-4" />
              High Risk (403 Detection)
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-2 bg-[#050507] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              score >= 75
                ? "bg-gradient-to-r from-emerald-500 to-[#00ffcc]"
                : "bg-rose-500"
            }`}
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </div>

        <div className="mt-3 space-y-2 font-mono text-[11px]">
          {warnings.length === 0 ? (
            <div className="text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 p-3 rounded flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>
                Perfect alignment! TCP TTL [{tcpTtl}], MSS, and browser TLS profile show 100% natural fingerprint matching.
              </span>
            </div>
          ) : (
            warnings.map((warn, i) => (
              <div
                key={i}
                className="text-rose-400 bg-rose-500/5 border border-rose-500/20 p-2.5 rounded flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{warn}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
