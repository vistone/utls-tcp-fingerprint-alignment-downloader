"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { Sparkles, Terminal, Award, RefreshCw, Send, ChevronRight } from "lucide-react";

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

interface AiChatProps {
  chatHistory: ChatMessage[];
  isAiLoading: boolean;
  chatMessage: string;
  setChatMessage: (v: string) => void;
  handleSendPrompt: (predefinedMessage?: string) => void;
  browserPreset: string;
  tcpPreset: string;
  tcpTtl: number;
}

export default function AiChat({
  chatHistory,
  isAiLoading,
  chatMessage,
  setChatMessage,
  handleSendPrompt,
  browserPreset,
  tcpPreset,
  tcpTtl,
}: AiChatProps) {
  const t = useTranslations("AiChat");
  const QUICK_PROMPTS = [
    t("quickPrompts.0"),
    t("quickPrompts.1"),
    t("quickPrompts.2"),
  ];
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isAiLoading]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
      <div className="lg:col-span-4 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
            {t("expertTitle")}
          </h3>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          {t("currentConfig", { browser: browserPreset.toUpperCase(), os: tcpPreset.toUpperCase(), ttl: tcpTtl })}
        </p>

        <div className="space-y-2 text-left font-mono">
          {QUICK_PROMPTS.map((prompt, i) => {
            const icons = ["🚀", "💎", "⚡"];
            return (
              <button
                key={i}
                onClick={() => handleSendPrompt(prompt)}
                className="w-full text-left bg-[#050507] hover:bg-[#1a1a24] p-3 rounded border border-[#2d2d35] hover:border-[#00ffcc] transition text-[11px] text-gray-300 flex items-center justify-between group"
              >
                <span>
                  {icons[i]} {prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-[#00ffcc] transition" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-8 flex flex-col bg-[#050507] border border-[#2d2d35] rounded-lg overflow-hidden h-[440px] shadow-2xl relative">
        <div className="bg-[#0a0a0c] border-b border-[#1f1f27] p-3 flex justify-between items-center font-mono">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-gray-300 font-bold uppercase tracking-wider">{t("aiArchitect")}</span>
          </div>
          <span className="text-[10px] text-gray-500">{t("geminiLabel")}</span>
        </div>

        <div className="flex-grow p-4 overflow-y-auto space-y-4 font-normal text-xs text-gray-300 leading-relaxed">
          {chatHistory.map((item, index) => (
            <div
              key={index}
              className={`flex gap-3 max-w-[85%] ${
                item.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              }`}
            >
              <div
                className={`p-1.5 rounded-full h-8 w-8 flex items-center justify-center shrink-0 ${
                  item.role === "user" ? "bg-[#00ffcc]/10 text-[#00ffcc]" : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {item.role === "user" ? <Terminal className="w-4 h-4" /> : <Award className="w-4 h-4" />}
              </div>
              <div
                className={`p-3 rounded-lg leading-relaxed ${
                  item.role === "user"
                    ? "bg-[#00ffcc]/10 text-white border border-[#00ffcc]/20 rounded-tr-none"
                    : "bg-[#111116] text-gray-200 border border-[#1f1f27] rounded-tl-none whitespace-pre-wrap"
                }`}
              >
                {item.text}
              </div>
            </div>
          ))}

          {isAiLoading && (
            <div className="flex items-center gap-2 text-amber-400 font-mono text-xs italic">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              {t("analyzing", { ttl: tcpTtl })}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendPrompt();
          }}
          className="bg-[#0a0a0c] border-t border-[#1f1f27] p-3 flex gap-2"
        >
          <input
            type="text"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            placeholder={t("inputPlaceholder")}
            className="flex-1 bg-[#111116] border border-[#2d2d35] rounded px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00ffcc]"
          />
          <button
            type="submit"
            disabled={!chatMessage.trim() || isAiLoading}
            className="bg-amber-500/15 text-amber-400 border border-amber-500/40 hover:bg-amber-500/25 px-5 rounded text-xs font-mono transition flex items-center gap-2 font-bold disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <span>{t("send")}</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
