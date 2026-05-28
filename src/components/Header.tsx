"use client";

import { useTranslations } from "next-intl";
import LocaleSwitcher from "./LocaleSwitcher";

interface HeaderProps {
  tcpPreset: string;
  downloadMode: "single" | "batch";
  setDownloadMode: (mode: "single" | "batch") => void;
  cdnType: string;
}

export default function Header({ tcpPreset, downloadMode, setDownloadMode, cdnType }: HeaderProps) {
  const t = useTranslations("Header");
  const CDN_LABELS: Record<string, string> = {
    cloudflare: t("cdnLabels.cloudflare"),
    akamai: t("cdnLabels.akamai"),
    incapsula: t("cdnLabels.incapsula"),
    custom: t("cdnLabels.custom"),
  };
  return (
    <header className="border-b border-[#2d2d35]/70 bg-[#09090d] px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center">
          <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-[#00ffcc] opacity-75" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#00ffcc]" />
        </div>
        <div>
          <div className="text-[#00ffcc] font-mono text-[9px] tracking-widest mb-0.5 font-bold">
            {t("sysStatus")}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2 font-mono">
            {t("title")}
          </h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
        <div className="bg-[#111116] border border-[#2d2d35] px-3.5 py-1.5 rounded flex items-center gap-2 shadow-inner">
          <span className="text-[#666] uppercase">{t("wafEng")}</span>
          <span className="text-[#00ffcc] font-bold">{CDN_LABELS[cdnType] || CDN_LABELS.cloudflare}</span>
        </div>
        <div className="bg-[#111116] border border-[#2d2d35] px-3.5 py-1.5 rounded flex items-center gap-2">
          <span className="text-[#666] uppercase">{t("sysJa4")}</span>
          <span className="text-teal-300 font-bold font-mono">{t("ja4Active")}</span>
        </div>
        <div className="bg-[#111116] border border-[#2d2d35] px-3.5 py-1.5 rounded flex items-center gap-2">
          <span className="text-[#666] uppercase">{t("osTune")}</span>
          <span className="text-white font-bold uppercase">{tcpPreset}</span>
        </div>
        <div className="bg-[#111116] border border-[#2d2d35] px-3.5 py-1.5 rounded flex items-center gap-1">
          <span className="text-[#666] uppercase">{t("mode")}</span>
          <button
            onClick={() => setDownloadMode("single")}
            className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
              downloadMode === "single"
                ? "bg-[#00ffcc]/10 text-[#00ffcc] border border-[#00ffcc]/30"
                : "text-gray-500"
            }`}
          >
            {t("single")}
          </button>
          <button
            onClick={() => setDownloadMode("batch")}
            className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
              downloadMode === "batch"
                ? "bg-teal-400/10 text-teal-400 border border-teal-400/30"
                : "text-gray-500"
            }`}
          >
            {t("batch")}
          </button>
        </div>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
