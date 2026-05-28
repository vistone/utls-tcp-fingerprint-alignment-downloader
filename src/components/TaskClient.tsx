"use client";

import { useState, useEffect, useCallback } from "react";
import { Terminal, Send, Server, Play, RefreshCw, ChevronRight } from "lucide-react";

interface TaskClientProps {
  grpcHubAddress: string;
  onRegister?: (deviceId: string) => void;
}

export default function TaskClient({ grpcHubAddress, onRegister }: TaskClientProps) {
  const [deviceName, setDeviceName] = useState("web-client");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const [storageId, setStorageId] = useState("");
  const [storageList, setStorageList] = useState<{ deviceId: string; name: string; ip: string }[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const fetchStorage = useCallback(async () => {
    try {
      const params = new URLSearchParams({ hub: grpcHubAddress });
      const res = await fetch(`/api/grpc/clients?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStorageList((data.devices || []).filter((d: any) => d.deviceType === "storage_server"));
      }
    } catch (_) {}
  }, [grpcHubAddress]);

  const connectToHub = async () => {
    if (!grpcHubAddress || !deviceName.trim()) return;
    setConnecting(true);
    addLog(`Connecting to Hub: ${grpcHubAddress} as "${deviceName}"...`);

    try {
      const res = await fetch("/api/grpc/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          hubAddress: grpcHubAddress,
          deviceType: "task_client",
          deviceName: deviceName.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDeviceId(data.deviceId);
        addLog(`Registered! Device ID: ${data.deviceId}`);
        onRegister?.(data.deviceId);
        fetchStorage();
      } else {
        addLog(`Registration failed: ${data.message}`);
      }
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
    }
    setConnecting(false);
  };

  const submitTask = async () => {
    if (!targetUrl.trim() || !deviceId || downloading) return;
    setDownloading(true);
    setProgress(0);
    addLog(`Submitting download: ${targetUrl}`);
    if (storageId) addLog(`Target storage: ${storageId}`);

    try {
      const res = await fetch("/api/grpc/submit-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hubAddress: grpcHubAddress,
          targetUrl: targetUrl.trim(),
          browserPreset: "chrome",
          cdnType: "cloudflare",
          storageDeviceId: storageId,
          clientId: deviceId,
        }),
      });
      if (!res.ok) {
        addLog(`Server error: HTTP ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { addLog("No response body"); return; }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === "progress") {
              setProgress(event.progress);
            } else if (event.type === "log") {
              addLog(event.message);
            } else if (event.type === "state") {
              addLog(`State: ${event.state} (${event.progress}%)`);
              if (event.state === "completed") setProgress(100);
              if (event.state === "completed" || event.state === "failed") setDownloading(false);
            } else if (event.type === "error") {
              addLog(`ERROR: ${event.message}`);
              setDownloading(false);
            }
          } catch (_) {}
        }
      }
    } catch (err: any) {
      addLog(`Download error: ${err.message}`);
    }
    setDownloading(false);
  };

  return (
    <div className="space-y-4">
      {/* Connection Panel */}
      <div className="bg-[#111116] border border-[#2d2d35] rounded-lg p-4">
        <h3 className="text-xs font-mono font-bold text-white flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-[#00ffcc]" />
          Task Client Connection
        </h3>
        <div className="flex items-center gap-2 text-xs font-mono">
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="Client name"
            className="w-40 bg-[#0a0a11] border border-[#2d2d35] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ffcc]"
            disabled={!!deviceId}
          />
          <input
            type="text"
            value={grpcHubAddress}
            readOnly
            className="flex-1 bg-[#0a0a11] border border-[#2d2d35] rounded px-2.5 py-1.5 text-gray-400"
          />
          <button
            onClick={connectToHub}
            disabled={connecting || !!deviceId}
            className="px-3 py-1.5 rounded bg-[#00ffcc]/10 text-[#00ffcc] font-bold border border-[#00ffcc]/30 text-[10px] hover:bg-[#00ffcc]/20 disabled:opacity-40 transition"
          >
            {connecting ? "Connecting..." : deviceId ? "Connected ✓" : "Connect"}
          </button>
          {deviceId && (
            <RefreshCw className="w-3.5 h-3.5 text-gray-500 cursor-pointer hover:text-white" onClick={fetchStorage} />
          )}
        </div>
        {deviceId && (
          <div className="mt-2 text-[10px] text-gray-500 font-mono">
            Device: <span className="text-[#00ffcc]">{deviceId}</span>
          </div>
        )}
      </div>

      {/* Task Submission */}
      {deviceId && (
        <>
          <div className="bg-[#111116] border border-[#2d2d35] rounded-lg p-4">
            <h3 className="text-xs font-mono font-bold text-white flex items-center gap-2 mb-3">
              <Send className="w-4 h-4 text-cyan-400" />
              New Download Task
            </h3>
            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Target URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://example.com/file.zip"
                    className="flex-1 bg-[#0a0a11] border border-[#2d2d35] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={submitTask}
                    disabled={!targetUrl.trim() || downloading}
                    className="px-4 py-1.5 rounded bg-cyan-600/30 text-cyan-300 font-bold border border-cyan-500/30 text-[10px] hover:bg-cyan-600/50 disabled:opacity-40 transition flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" />
                    {downloading ? "Downloading..." : "Submit"}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Target Storage Server (optional)</label>
                <select
                  value={storageId}
                  onChange={(e) => setStorageId(e.target.value)}
                  className="w-full bg-[#0a0a11] border border-[#2d2d35] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="">-- Local storage only --</option>
                  {storageList.map((s) => (
                    <option key={s.deviceId} value={s.deviceId}>
                      {s.name} ({s.ip}) - {s.deviceId}
                    </option>
                  ))}
                </select>
              </div>

              {/* Progress Bar */}
              {progress > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Progress</span>
                    <span>{progress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#0a0a11] rounded overflow-hidden border border-[#2d2d35]">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-[#00ffcc] rounded transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Log Output */}
          <div className="bg-[#0a0a11] border border-[#2d2d35] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-gray-500 uppercase">Task Log</span>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="text-[9px] text-gray-600 hover:text-white">Clear</button>
              )}
            </div>
            <div
              className="font-mono text-[10px] leading-relaxed space-y-1 overflow-y-auto"
              style={{ maxHeight: "min(200px, 20vh)" }}
            >
              {logs.length === 0 ? (
                <div className="text-gray-600 italic">No tasks submitted yet.</div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className={`${l.includes("ERROR") || l.includes("failed") ? "text-red-400" : l.includes("State: completed") ? "text-green-400" : "text-gray-300"}`}>
                    {l}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
