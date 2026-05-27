"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#050507] flex items-center justify-center p-6">
      <div className="bg-[#111116] border border-[#2d2d35] p-8 rounded-lg max-w-lg w-full text-center shadow-2xl">
        <div className="text-rose-400 text-4xl font-mono font-bold mb-4">
          SYSTEM FAULT
        </div>
        <h2 className="text-white text-lg font-mono font-bold mb-2">
          Unhandled Runtime Error
        </h2>
        <p className="text-gray-400 text-sm font-mono mb-6 break-all leading-relaxed">
          {error.message || "An unknown error occurred in the simulation engine."}
        </p>
        <button
          onClick={reset}
          className="bg-rose-500/15 text-rose-400 border border-rose-500/40 hover:bg-rose-500/25 px-6 py-2.5 rounded font-mono font-bold text-sm tracking-wider transition cursor-pointer"
        >
          RETRY REALIGNMENT
        </button>
      </div>
    </div>
  );
}
