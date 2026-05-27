"use client";

import { Compass } from "lucide-react";

interface DnsConfigProps {
  dnsEnabled: boolean;
  setDnsEnabled: (v: boolean) => void;
  dnsServers: string;
  setDnsServers: (v: string) => void;
  dnsTimeout: number;
  setDnsTimeout: (v: number) => void;
  dnsParallel: boolean;
  setDnsParallel: (v: boolean) => void;
  dnsCacheEnabled: boolean;
  setDnsCacheEnabled: (v: boolean) => void;
  dnsHosts: string;
  setDnsHosts: (v: string) => void;
  lbStrategy: string;
  setLbStrategy: (v: "round_robin" | "random" | "fastest" | "priority") => void;
}

export default function DnsConfig({
  dnsEnabled,
  setDnsEnabled,
  dnsServers,
  setDnsServers,
  dnsTimeout,
  setDnsTimeout,
  dnsParallel,
  setDnsParallel,
  dnsCacheEnabled,
  setDnsCacheEnabled,
  dnsHosts,
  setDnsHosts,
  lbStrategy,
  setLbStrategy,
}: DnsConfigProps) {
  return (
    <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded relative overflow-hidden shadow-xl">
      <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2 mb-4">
        <Compass className="w-4 h-4 text-purple-400" />
        4. DNS & Load Balancer
      </h2>

      <div className="space-y-4 font-mono text-xs">
        <div className="flex justify-between items-center bg-[#050507] p-2 rounded border border-[#1a1a24]">
          <span className="text-gray-400">DNS Override:</span>
          <button
            onClick={() => setDnsEnabled(!dnsEnabled)}
            className={`px-3 py-1 rounded text-[10px] uppercase font-bold border transition ${
              dnsEnabled
                ? "border-purple-500 bg-purple-500/10 text-purple-300"
                : "border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
          >
            {dnsEnabled ? "ACTIVE" : "BYPASS"}
          </button>
        </div>

        {dnsEnabled && (
          <div className="space-y-3 bg-[#050507] p-3 rounded border border-[#1a1a24]">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">DNS Servers:</label>
              <input
                type="text"
                value={dnsServers}
                onChange={(e) => setDnsServers(e.target.value)}
                placeholder="8.8.8.8, 114.114.114.114"
                className="w-full bg-[#111116] border border-[#2d2d35] p-1.5 text-white text-[10px] rounded focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Timeout (ms):</label>
              <input
                type="number"
                value={dnsTimeout}
                onChange={(e) => setDnsTimeout(Number(e.target.value))}
                min={100}
                max={10000}
                className="w-full bg-[#111116] border border-[#2d2d35] p-1.5 text-white text-[10px] rounded focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-400 block mb-1">LB Strategy:</label>
              <select
                value={lbStrategy}
                onChange={(e) => setLbStrategy(e.target.value as "round_robin" | "random" | "fastest" | "priority")}
                className="w-full bg-[#111116] border border-[#2d2d35] p-1.5 text-white text-[10px] rounded focus:outline-none focus:border-purple-500 font-mono"
              >
                <option value="fastest">Lowest Latency</option>
                <option value="round_robin">Round Robin</option>
                <option value="random">Random</option>
                <option value="priority">Priority</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Hosts Override:</label>
              <textarea
                rows={2}
                value={dnsHosts}
                onChange={(e) => setDnsHosts(e.target.value)}
                placeholder="example.com:127.0.0.1"
                className="w-full bg-[#111116] border border-[#2d2d35] p-1.5 text-white text-[10px] rounded focus:outline-none focus:border-purple-500 font-mono resize-none"
              />
            </div>

            <div className="flex justify-between items-center text-[10px]">
              <span className="text-gray-400">DNS Cache:</span>
              <button
                onClick={() => setDnsCacheEnabled(!dnsCacheEnabled)}
                className={`px-1.5 py-0.5 rounded border ${
                  dnsCacheEnabled ? "border-purple-500 bg-purple-500/5 text-purple-400" : "border-gray-700 text-gray-500"
                }`}
              >
                {dnsCacheEnabled ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            <div className="flex justify-between items-center text-[10px]">
              <span className="text-gray-400">Parallel:</span>
              <button
                onClick={() => setDnsParallel(!dnsParallel)}
                className={`px-1.5 py-0.5 rounded border ${
                  dnsParallel ? "border-purple-500 bg-purple-500/5 text-purple-400" : "border-gray-700 text-gray-500"
                }`}
              >
                {dnsParallel ? "PARALLEL" : "SERIAL"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
