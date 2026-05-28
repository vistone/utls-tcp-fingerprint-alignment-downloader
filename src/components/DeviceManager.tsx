"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Server, Monitor, Smartphone, CheckCircle, AlertCircle, XCircle } from "lucide-react";

interface Device {
  deviceId: string;
  deviceType: string;
  deviceName: string;
  ip: string;
  os: string;
  hostname: string;
  version: string;
  state: string;
  statusMessage: string;
  registeredAt: number;
  lastHeartbeat: number;
  connectionState: string;
}

interface HubStatus {
  address: string;
  alive: boolean;
  uptime: number;
  connectedClients: number;
  connectedStorage: number;
}

interface DeviceManagerProps {
  grpcHubAddress: string;
}

const STATUS_ICONS: Record<string, any> = {
  online: CheckCircle,
  busy: AlertCircle,
  degraded: AlertCircle,
  offline: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  online: "text-green-400",
  busy: "text-amber-400",
  degraded: "text-orange-400",
  offline: "text-red-400",
};

export default function DeviceManager({ grpcHubAddress }: DeviceManagerProps) {
  const [hubStatus, setHubStatus] = useState<HubStatus | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "task_client" | "storage_server">("all");
  const [lastRefresh, setLastRefresh] = useState(0);

  const fetchDevices = useCallback(async () => {
    if (!grpcHubAddress) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ hub: grpcHubAddress });
      if (filter !== "all") params.set("type", filter);
      const res = await fetch(`/api/grpc/clients?${params}`);
      if (res.ok) {
        const data = await res.json();
        setHubStatus(data.hub);
        setDevices(data.devices || []);
        setLastRefresh(Date.now());
      }
    } catch (_) {}
    setLoading(false);
  }, [grpcHubAddress, filter]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!grpcHubAddress) return;
    const timer = setInterval(fetchDevices, 10000);
    return () => clearInterval(timer);
  }, [fetchDevices, grpcHubAddress]);

  const taskClients = devices.filter(d => d.deviceType === "task_client");
  const storageServers = devices.filter(d => d.deviceType === "storage_server");
  const onlineCount = devices.filter(d => d.connectionState === "online").length;

  const formatTime = (ts: number) => {
    if (!ts) return "—";
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="space-y-4">
      {/* Hub Status */}
      <div className="bg-[#111116] border border-[#2d2d35] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-mono font-bold uppercase text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-teal-400" />
            Hub Status
          </h3>
          <button
            onClick={fetchDevices}
            disabled={loading}
            className="p-1.5 rounded bg-[#1a1a24] hover:bg-[#222233] transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        
        {hubStatus ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] font-mono">
            <div className="bg-[#0a0a11] rounded p-2 border border-[#2d2d35]/50">
              <span className="text-gray-500 block">Address</span>
              <span className="text-white font-bold">{hubStatus.address}</span>
            </div>
            <div className="bg-[#0a0a11] rounded p-2 border border-[#2d2d35]/50">
              <span className="text-gray-500 block">Status</span>
              <span className={hubStatus.alive ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                {hubStatus.alive ? "● Online" : "● Offline"}
              </span>
            </div>
            <div className="bg-[#0a0a11] rounded p-2 border border-[#2d2d35]/50">
              <span className="text-gray-500 block">Clients</span>
              <span className="text-purple-400 font-bold">{hubStatus.connectedClients} / {taskClients.length}</span>
            </div>
            <div className="bg-[#0a0a11] rounded p-2 border border-[#2d2d35]/50">
              <span className="text-gray-500 block">Storage</span>
              <span className="text-cyan-400 font-bold">{hubStatus.connectedStorage} / {storageServers.length}</span>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 text-xs py-2">
            {grpcHubAddress ? "Connecting to hub..." : "No hub address configured"}
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-[#0a0a11] rounded p-1 border border-[#2d2d35]/50">
        {(["all", "task_client", "storage_server"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-1.5 px-3 text-[10px] font-mono font-bold uppercase rounded transition ${
              filter === tab
                ? "bg-[#00ffcc]/10 text-[#00ffcc] border border-[#00ffcc]/30"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "all" ? `All (${devices.length})` : tab === "task_client" ? `Clients (${taskClients.length})` : `Storage (${storageServers.length})`}
          </button>
        ))}
      </div>

      {/* Device List */}
      <div className="space-y-2">
        {devices.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-8">
            {loading ? "Loading devices..." : "No devices registered. Clients must call RegisterTaskClient/RegisterStorageServer to appear here."}
          </div>
        ) : (
          devices.map(device => {
            const StatusIcon = STATUS_ICONS[device.connectionState] || XCircle;
            const statusColor = STATUS_COLORS[device.connectionState] || "text-gray-500";
            const isStorage = device.deviceType === "storage_server";
            
            return (
              <div
                key={device.deviceId}
                className={`bg-[#111116] border rounded-lg p-3 text-xs font-mono transition ${
                  device.connectionState === "online"
                    ? "border-[#2d2d35]"
                    : "border-[#2d2d35]/50 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`w-3.5 h-3.5 ${statusColor}`} />
                    <span className="text-white font-bold">{device.deviceName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      isStorage ? "bg-cyan-900/40 text-cyan-300" : "bg-purple-900/40 text-purple-300"
                    }`}>
                      {isStorage ? "STORAGE" : "CLIENT"}
                    </span>
                  </div>
                  <span className={`text-[9px] font-bold uppercase ${statusColor}`}>
                    {device.connectionState}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-1 text-[10px]">
                  <div>
                    <span className="text-gray-500">ID:</span>
                    <span className="text-gray-300 ml-1">{device.deviceId}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">IP:</span>
                    <span className="text-cyan-400 ml-1">{device.ip}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">OS:</span>
                    <span className="text-gray-300 ml-1">{device.os}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Host:</span>
                    <span className="text-gray-300 ml-1">{device.hostname}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Ver:</span>
                    <span className="text-gray-300 ml-1">{device.version}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-2 text-[9px] text-gray-500">
                  <span>Registered: {formatTime(device.registeredAt)}</span>
                  <span>Last heartbeat: {formatTime(device.lastHeartbeat)}</span>
                  {device.statusMessage && <span className="text-gray-400">{device.statusMessage}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
