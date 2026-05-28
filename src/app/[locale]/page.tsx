"use client";

import { useState, useEffect, useRef } from "react";
import {
  Download,
  FileCode,
  Compass,
  Sparkles,
  Network,
  Terminal,
  Check,
  Copy,
  Server,
  Send,
} from "lucide-react";
import Header from "@/components/Header";
import FingerprintConfig from "@/components/FingerprintConfig";
import DnsConfig from "@/components/DnsConfig";
import DownloadTunnel from "@/components/DownloadTunnel";
import BatchDownload from "@/components/BatchDownload";
import DnsTester from "@/components/DnsTester";
import GlobalDnsManager from "@/components/GlobalDnsManager";
import AiChat from "@/components/AiChat";
import AlignmentReport from "@/components/AlignmentReport";
import DeviceManager from "@/components/DeviceManager";
import TaskClient from "@/components/TaskClient";
import FingerprintPreview from "@/components/FingerprintPreview";
import { tsSourceFiles, BROWSER_TLS_SPECS, buildJA4Fingerprint } from "@/tsSource";

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

interface DnsTestResult {
  success: boolean;
  resolvedIps: string[];
  selectedIp: string;
  latencies: Record<string, number>;
  logs: string[];
  cacheHit: boolean;
  error?: string;
  ipInfo?: Record<string, any>;
}

interface GlobalDnsStatus {
  serverCount: number;
  cachedDomains: Array<{ domain: string; ipv4Count: number; ipv6Count: number }>;
  cacheContent: Record<string, { ipv4: string[]; ipv6: string[] }>;
  servers: Record<string, string>;
}

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

const DEFAULT_BATCH_ITEMS: BatchItem[] = [
  {
    id: 0,
    url: "https://kh.google.com/rt/earth/PlanetoidMetadata",
    filename: "PlanetoidMetadata",
    status: "idle",
    progress: 0,
    speed: 0,
    receivedSize: 0,
    totalSize: 0,
    logs: ["Ready. Parsed from default config."],
  },
  {
    id: 1,
    url: "https://raw.githubusercontent.com/google/gson/master/README.md",
    filename: "GSON_README.md",
    status: "idle",
    progress: 0,
    speed: 0,
    receivedSize: 0,
    totalSize: 0,
    logs: ["Ready. Parsed from default config."],
  },
  {
    id: 2,
    url: "https://raw.githubusercontent.com/facebook/react/main/README.md",
    filename: "React_README.md",
    status: "idle",
    progress: 0,
    speed: 0,
    receivedSize: 0,
    totalSize: 0,
    logs: ["Ready. Parsed from default config."],
  },
  {
    id: 3,
    url: "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png",
    filename: "googlelogo_color_272x92dp.png",
    status: "idle",
    progress: 0,
    speed: 0,
    receivedSize: 0,
    totalSize: 0,
    logs: ["Ready. Parsed from default config."],
  },
];

export default function Page() {
  const [activeTab, setActiveTab] = useState<
    "downloader" | "ja4_builder" | "tcp_alignment" | "dns_resolver" | "ai_architect" | "device_manager" | "task_client"
  >("downloader");

  const [targetUrl, setTargetUrl] = useState("https://kh.google.com/rt/earth/PlanetoidMetadata");
  const [cdnType, setCdnType] = useState<"cloudflare" | "akamai" | "incapsula" | "custom">("cloudflare");
  const [browserPreset, setBrowserPreset] = useState("chrome_124");
  const [tcpPreset, setTcpPreset] = useState<"windows" | "macos" | "linux" | "mismatched">("windows");

  const [dnsEnabled, setDnsEnabled] = useState(false);
  const [dnsServers, setDnsServers] = useState("8.8.8.8, 114.114.114.114, 223.5.5.5");
  const [dnsTimeout, setDnsTimeout] = useState(3000);
  const [dnsParallel, setDnsParallel] = useState(true);
  const [dnsCacheEnabled, setDnsCacheEnabled] = useState(true);
  const [dnsHosts, setDnsHosts] = useState("example.com:127.0.0.1, internal-vip.com:104.16.124.96");
  const [lbStrategy, setLbStrategy] = useState<"round_robin" | "random" | "fastest" | "priority">("fastest");

  const [dnsTestDomain, setDnsTestDomain] = useState("kh.google.com");
  const [dnsTestLoading, setDnsTestLoading] = useState(false);
  const [dnsTestResult, setDnsTestResult] = useState<DnsTestResult | null>(null);

  const [tcpTtl, setTcpTtl] = useState(128);
  const [tcpMss, setTcpMss] = useState(1460);
  const [tcpWindowSize, setTcpWindowSize] = useState(65535);
  const [h2WindowIncrement, setH2WindowIncrement] = useState(6291456);
  const [greasingEnabled, setGreasingEnabled] = useState(true);
  const [connectionReuse, setConnectionReuse] = useState(true);
  const [useProxy, setUseProxy] = useState(false);
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");

  const [globalDnsStatus, setGlobalDnsStatus] = useState<GlobalDnsStatus | null>(null);
  const [batchDomainsInput, setBatchDomainsInput] = useState("google.com, clouflare.com, github.com");
  const [batchTimeout, setBatchTimeout] = useState(1000);
  const [batchConcurrency, setBatchConcurrency] = useState(60);
  const [batchResolving, setBatchResolving] = useState(false);
  const [batchLogs, setBatchLogs] = useState<string[]>([]);
  const [activeDnsSubTab, setActiveDnsSubTab] = useState<"diagnostic" | "global_batch" | "server_list">("diagnostic");

  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [downloadState, setDownloadState] = useState<
    "idle" | "handshake" | "requesting" | "downloading" | "completed" | "failed"
  >("idle");
  const [downloadLog, setDownloadLog] = useState<string[]>([]);
  const [grpcEnabled, setGrpcEnabled] = useState(false);
  const [grpcHubAddress, setGrpcHubAddress] = useState("localhost:50051");
  const [grpcStorageServerId, setGrpcStorageServerId] = useState("");
  const [storageServers, setStorageServers] = useState<{ serverId: string; name: string; address: string }[]>([]);

  const [downloadMode, setDownloadMode] = useState<"single" | "batch">("single");
  const [batchManifestUrl, setBatchManifestUrl] = useState("/example-manifest.json");
  const [isParsingManifest, setIsParsingManifest] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>(DEFAULT_BATCH_ITEMS);
  const [selectedBatchItemId, setSelectedBatchItemId] = useState(0);

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: "model",
      text: "Welcome! I'm a CDN bypass & network protocol alignment specialist. Many high-concurrency scrapers and distributed downloaders only change User-Agent and think they're safe, but TCP-Fingerprint + TLS JA3/JA4 + HTTP/2 misalignment leads to instant 403 blocking. Ask me about precise uTLS fingerprinting, TCP/IP system-level TTL tuning, and Window Scale alignment.",
    },
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [alignmentReport, setAlignmentReport] = useState({
    isAligned: true,
    score: 100,
    warnings: [] as string[],
  });

  const [copiedFileKey, setCopiedFileKey] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getUserAgent = () => {
    return BROWSER_TLS_SPECS[browserPreset]?.userAgent || BROWSER_TLS_SPECS["chrome_124"].userAgent;
  };

  const getCompiledJA4 = () => {
    const spec = BROWSER_TLS_SPECS[browserPreset] || BROWSER_TLS_SPECS["chrome_124"];
    return buildJA4Fingerprint({
      protocol: "t",
      tlsVersion: "13",
      sniIndicator: "d",
      ciphersCount: spec.ciphersCount,
      extensionsCount: spec.extensionsCount,
      alpnFirstChars: spec.alpn === "00" ? "00" : "h2",
    });
  };

  useEffect(() => {
    const spec = BROWSER_TLS_SPECS[browserPreset];
    if (spec) {
      setH2WindowIncrement(spec.defaultH2Window);
      setGreasingEnabled(spec.defaultGrease);
    }
  }, [browserPreset]);

  useEffect(() => {
    let score = 100;
    const warnings: string[] = [];
    const currentUa = getUserAgent().toLowerCase();

    if (tcpPreset === "windows" && !currentUa.includes("windows")) {
      if (cdnType === "akamai") {
        warnings.push("[Akamai] TCP TTL(128)=Windows but User-Agent is non-Windows. 100% 403 block trigger.");
        score -= 40;
      } else {
        warnings.push("[TCP Mismatch] SYN TTL(128) indicates Windows, but User-Agent does not match. High-risk spoof.");
        score -= 30;
      }
    }
    if (tcpPreset === "macos" && !currentUa.includes("macintosh")) {
      if (cdnType === "akamai") {
        warnings.push("[Akamai] macOS MSS(1440)/TTL(64) with non-macOS User-Agent. Highly suspicious.");
        score -= 40;
      } else {
        warnings.push("[TCP OS Mismatch] SYN frame MSS/TTL indicates macOS, but User-Agent declares non-macOS.");
        score -= 30;
      }
    }
    if (tcpPreset === "linux" && (currentUa.includes("windows") || currentUa.includes("macintosh"))) {
      warnings.push("[Linux Residual] Standard Linux TCP/IP Window Scale detected with commercial desktop UA.");
      score -= 25;
    }

    if (tcpPreset === "windows" && tcpTtl !== 128) {
      warnings.push("[TTL Anomaly] Windows TCP preset overridden, TTL deviates from native 128.");
      score -= 10;
    }
    if ((tcpPreset === "macos" || tcpPreset === "linux") && tcpTtl === 128) {
      warnings.push("[TTL Anomaly] Unix kernel fingerprint detected with Windows TTL (128).");
      score -= 15;
    }

    if (browserPreset.startsWith("python")) {
      if (cdnType === "incapsula") {
        warnings.push("[Imperva] Python urllib/requests native sockets sensitive to detection. TLS cipher mismatch triggers block.");
        score -= 50;
      } else {
        warnings.push("[Automation Detection] TLS fingerprint lacks ALPN/H2. Matches Python urllib. 100% CDN rejection.");
        score -= 40;
      }
    }

    if (browserPreset.startsWith("chrome") && h2WindowIncrement !== 6291456) {
      if (cdnType === "cloudflare") {
        warnings.push("[Cloudflare WAF] Chrome HTTP/2 SETTINGS initial window must be exactly 6291456. Blocked.");
        score -= 30;
      } else {
        warnings.push("[HTTP/2 Window] Chrome 120+ allocates precisely 6291456 window increment. Your setting is flagged.");
        score -= 15;
      }
    }

    if (!greasingEnabled && browserPreset.startsWith("chrome")) {
      if (cdnType === "cloudflare") {
        warnings.push("[Cloudflare] Missing GREASE extensions (0x0a0a) on Chrome profile. Marked as spoofed traffic.");
        score -= 25;
      } else {
        warnings.push("[TLS Grease] Chrome v70+ uses random TLS extension grease. Missing = fake TLS simulator.");
        score -= 15;
      }
    }

    if (cdnType === "custom" && !connectionReuse) {
      warnings.push("[AWS/F5] Without Connection Multiplexing, unaligned concurrent downloads trigger CC attack detection.");
      score -= 15;
    }

    setAlignmentReport({
      isAligned: score >= 75,
      score: Math.max(5, score),
      warnings,
    });
  }, [browserPreset, tcpPreset, tcpTtl, tcpMss, tcpWindowSize, h2WindowIncrement, greasingEnabled, cdnType, connectionReuse]);

  const applyPresetConfig = (preset: string) => {
    setTcpPreset(preset as "windows" | "macos" | "linux" | "mismatched");
    if (preset === "windows") {
      setTcpTtl(128);
      setTcpMss(1460);
      setTcpWindowSize(65535);
    } else if (preset === "macos") {
      setTcpTtl(64);
      setTcpMss(1440);
      setTcpWindowSize(131072);
    } else if (preset === "linux") {
      setTcpTtl(64);
      setTcpMss(1460);
      setTcpWindowSize(87380);
    } else {
      setTcpTtl(128);
      setTcpMss(1380);
      setTcpWindowSize(32768);
    }
  };

  // Auto-set TCP params based on browser preset platform
  useEffect(() => {
    const platformMap: Record<string, { preset: string; ttl: number; mss: number; window: number }> = {
      chrome_124:  { preset: "windows", ttl: 128, mss: 1460, window: 65535 },
      chrome_115:  { preset: "windows", ttl: 128, mss: 1460, window: 65535 },
      chrome_100:  { preset: "windows", ttl: 128, mss: 1460, window: 65535 },
      chrome_88:   { preset: "windows", ttl: 128, mss: 1460, window: 65535 },
      firefox_120: { preset: "linux",   ttl: 64,  mss: 1460, window: 87380 },
      firefox_110: { preset: "linux",   ttl: 64,  mss: 1460, window: 87380 },
      firefox_90:  { preset: "linux",   ttl: 64,  mss: 1460, window: 87380 },
      safari_17:   { preset: "macos",   ttl: 64,  mss: 1440, window: 131072 },
      safari_15:   { preset: "macos",   ttl: 64,  mss: 1440, window: 131072 },
      safari_13:   { preset: "macos",   ttl: 64,  mss: 1440, window: 131072 },
      python_310:  { preset: "linux",   ttl: 64,  mss: 1460, window: 87380 },
      curl_8:      { preset: "linux",   ttl: 64,  mss: 1460, window: 87380 },
    };
    const cfg = platformMap[browserPreset];
    if (cfg) {
      setTcpPreset(cfg.preset as "windows" | "macos" | "linux");
      setTcpTtl(cfg.ttl);
      setTcpMss(cfg.mss);
      setTcpWindowSize(cfg.window);
    }
  }, [browserPreset]);

  const fetchGlobalDnsStatus = async () => {
    try {
      const res = await fetch("/api/global-dns/status");
      const data = await res.json();
      if (data.success) {
        setGlobalDnsStatus({
          serverCount: data.serverCount,
          cachedDomains: data.cachedDomains,
          cacheContent: data.cacheContent,
          servers: data.servers,
        });
      }
    } catch (e) {
      console.error("Failed to fetch global DNS status:", e);
    }
  };

  useEffect(() => {
    fetchGlobalDnsStatus();
  }, []);

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => {
      abortControllerRef.current?.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const loadBatchManifest = async (urlStr: string) => {
    setIsParsingManifest(true);
    try {
      const response = await fetch("/api/parse-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl: urlStr }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.success && data.urls && data.urls.length > 0) {
        const newItems: BatchItem[] = data.urls.map((rawUrl: string, idx: number) => {
          let fname = "asset_file";
          try {
            const parsed = new URL(rawUrl);
            const pathParts = parsed.pathname.split("/");
            fname = pathParts[pathParts.length - 1] || `asset_${idx + 1}`;
          } catch {
            fname = `asset_${idx + 1}`;
          }
          return {
            id: idx,
            url: rawUrl,
            filename: fname,
            status: "idle" as const,
            progress: 0,
            speed: 0,
            receivedSize: 0,
            totalSize: 0,
            logs: [`Extracted from manifest [${urlStr}]`],
          };
        });
        setBatchItems(newItems);
      } else {
        throw new Error("No valid HTTP resources found in manifest.");
      }
    } catch (err: any) {
      setBatchItems([
        {
          id: -1,
          url: urlStr,
          filename: "Manifest Error",
          status: "failed",
          progress: 0,
          speed: 0,
          receivedSize: 0,
          totalSize: 0,
          logs: [`[FATAL]: ${err.message}`],
        },
      ]);
    } finally {
      setIsParsingManifest(false);
    }
  };

  const startBatchItemDownload = async (itemId: number) => {
    const item = batchItems.find((x) => x.id === itemId);
    if (!item) return;

    setBatchItems((prev) =>
      prev.map((x) =>
        x.id === itemId
          ? { ...x, status: "handshake" as const, progress: 0, speed: 0, receivedSize: 0, logs: [`[ALIGN]: ${x.url}`] }
          : x
      )
    );

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({
          targetUrl: item.url,
          userAgent: getUserAgent(),
          browserPreset,
          tcpTtl,
          tcpMss,
          tcpWindowSize,
          h2WindowIncrement,
          connectionReuse,
          useProxy,
          proxyHost,
          proxyPort,
          cdnType,
          dnsEnabled,
          dnsServers,
          dnsTimeout,
          dnsParallel,
          dnsCacheEnabled,
          dnsHosts,
          lbStrategy,
        }),
      });

      if (!response.ok) throw new Error(`Relay refused connection (HTTP ${response.status})`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) throw new Error("Stream reader unavailable");

      let partialLine = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const rawText = decoder.decode(value, { stream: true });
        const lines = (partialLine + rawText).split("\n");
        partialLine = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "log") {
              setBatchItems((prev) =>
                prev.map((x) => (x.id === itemId ? { ...x, logs: [...x.logs, data.message] } : x))
              );
            } else if (data.type === "error") {
              setBatchItems((prev) =>
                prev.map((x) =>
                  x.id === itemId ? { ...x, status: "failed" as const, logs: [...x.logs, data.message] } : x
                )
              );
            } else if (data.type === "progress") {
              setBatchItems((prev) =>
                prev.map((x) =>
                  x.id === itemId
                    ? {
                        ...x,
                        progress: data.progress ?? x.progress,
                        speed: data.speed ?? x.speed,
                        receivedSize: data.received ?? x.receivedSize,
                        totalSize: data.total ?? x.totalSize,
                      }
                    : x
                )
              );
            } else if (data.type === "state" && data.state) {
              setBatchItems((prev) =>
                prev.map((x) => (x.id === itemId ? { ...x, status: data.state as BatchItem["status"] } : x))
              );
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }
    } catch (err: any) {
      setBatchItems((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? { ...x, status: "failed" as const, logs: [...x.logs, `[ABORT]: ${err.message}`] }
            : x
        )
      );
    }
  };

  const runAllBatchDownloads = async () => {
    if (isBatchRunning) return;
    setIsBatchRunning(true);
    try {
      await Promise.all(batchItems.map((item) => (item.id >= 0 ? startBatchItemDownload(item.id) : Promise.resolve())));
    } finally {
      setIsBatchRunning(false);
    }
  };

  const startTestDownload = async () => {
    if (downloadState !== "idle" && downloadState !== "completed" && downloadState !== "failed") return;
    setDownloadState("handshake");
    setDownloadProgress(0);
    setDownloadSpeed(0);
    setDownloadLog(["[ALIGN] Channel ready. Initiating relay handshake..."]);

    const useGrpc = grpcEnabled && grpcHubAddress;
    const apiUrl = useGrpc ? "/api/grpc/submit-download" : "/api/download";
    const bodyPayload = useGrpc ? {
      hubAddress: grpcHubAddress,
      targetUrl,
      browserPreset,
      cdnType,
      storageServerId: grpcStorageServerId,
    } : {
      targetUrl,
      userAgent: getUserAgent(),
      browserPreset,
      tcpTtl,
      tcpMss,
      tcpWindowSize,
      h2WindowIncrement,
      connectionReuse,
      useProxy,
      proxyHost,
      proxyPort,
      cdnType,
      dnsEnabled,
      dnsServers,
      dnsTimeout,
      dnsParallel,
      dnsCacheEnabled,
      dnsHosts,
      lbStrategy,
    };

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) throw new Error(`Relay node response abnormal (HTTP ${response.status})`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) throw new Error("Stream reader init failed");

      let partialLine = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const rawText = decoder.decode(value, { stream: true });
        const lines = (partialLine + rawText).split("\n");
        partialLine = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "log") {
              setDownloadLog((prev) => [...prev, data.message]);
            } else if (data.type === "error") {
              setDownloadLog((prev) => [...prev, data.message]);
              setDownloadState("failed");
            } else if (data.type === "progress") {
              if (data.progress !== undefined) setDownloadProgress(data.progress);
              if (data.speed !== undefined) setDownloadSpeed(data.speed);
            } else if (data.type === "state" && data.state) {
              setDownloadState(data.state);
              if (data.progress !== undefined) setDownloadProgress(data.progress);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err: any) {
      setDownloadState("failed");
      setDownloadLog((prev) => [...prev, `[SYSTEM]: ${err.message || "Connection refused"}`]);
    }
  };

  const resetDownload = () => {
    setDownloadState("idle");
    setDownloadLog([]);
    setDownloadProgress(0);
    setDownloadSpeed(0);
  };

  const handleSendPrompt = async (predefinedMessage?: string) => {
    const textToSend = predefinedMessage || chatMessage;
    if (!textToSend.trim() || isAiLoading) return;

    const userMsg: ChatMessage = { role: "user", text: textToSend };
    setChatHistory((prev) => [...prev, userMsg]);
    if (!predefinedMessage) setChatMessage("");
    setIsAiLoading(true);

    try {
      const response = await fetch("/api/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({
          message: textToSend,
          history: [...chatHistory, userMsg],
          fingerprintConfig: {
            userAgent: getUserAgent(),
            tlsProfile: getCompiledJA4(),
            tcpSystem: tcpPreset,
            tcpTtl,
            tcpWindowSize,
            alignLevel: alignmentReport.score,
            targetCdn: cdnType,
          },
        }),
      });

      if (!response.ok) throw new Error("Architect API communication failed.");

      const data = await response.json();
      setChatHistory((prev) => [...prev, { role: "model", text: data.text }]);
    } catch (err: any) {
      setChatHistory((prev) => [...prev, { role: "model", text: `API Error: ${err.message}` }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleRunDnsTest = async () => {
    if (!dnsTestDomain.trim() || dnsTestLoading) return;
    setDnsTestLoading(true);
    setDnsTestResult(null);

    try {
      const response = await fetch("/api/dns-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({
          host: dnsTestDomain,
          dnsServers,
          dnsTimeout,
          dnsParallel,
          dnsCacheEnabled,
          dnsHosts,
          lbStrategy,
          port: 443,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `DNS test service error (HTTP ${response.status})`);
      }

      const data = await response.json();
      const resolvedIps: string[] = data.resolvedIps || [];

      setDnsTestResult({
        success: data.success,
        resolvedIps,
        selectedIp: data.selectedIp || "",
        latencies: data.latencies || {},
        logs: data.logs || [],
        cacheHit: !!data.cacheHit,
        ipInfo: data.ipInfo || undefined,
      });

      if (resolvedIps.length > 0 && !data.ipInfo) {
        fetchIpInfo(resolvedIps);
      }
    } catch (err: any) {
      setDnsTestResult({
        success: false,
        resolvedIps: [],
        selectedIp: "",
        latencies: {},
        logs: [`[TESTER]: ${err.message}`],
        cacheHit: false,
        error: err.message,
      });
    } finally {
      setDnsTestLoading(false);
    }
  };

  const fetchIpInfo = async (ips: string[]) => {
    try {
      const res = await fetch("/api/ip-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({ ips }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.results) {
        setDnsTestResult((prev) => (prev ? { ...prev, ipInfo: data.results } : null));
      }
    } catch {
      // silently ignore
    }
  };

  const handleRunBatchDns = async () => {
    if (!batchDomainsInput.trim() || batchResolving) return;
    setBatchResolving(true);
    setBatchLogs(["[CLIENT] Initializing global DNS resolver...", `[CLIENT] Target domains: ${batchDomainsInput}`]);

    try {
      const parts = batchDomainsInput
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      const res = await fetch("/api/global-dns/resolve-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({ domains: parts, timeout: batchTimeout, concurrency: batchConcurrency }),
      });
      const data = await res.json().catch(() => ({ success: false, error: "Invalid JSON from server" }));
      if (data.success) {
        setBatchLogs(data.logs || []);
        fetchGlobalDnsStatus();
      } else {
        setBatchLogs((prev) => [...prev, `Error: ${data.error || "Unknown server error"}`]);
      }
    } catch (e: any) {
      setBatchLogs((prev) => [...prev, `Network error: ${e.message}`]);
    } finally {
      setBatchResolving(false);
    }
  };

  const handleDeleteCacheDomain = async (domain?: string) => {
    try {
      const res = await fetch("/api/global-dns/delete-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (data.success) fetchGlobalDnsStatus();
    } catch (e) {
      console.error("Cache delete error:", e);
    }
  };

  const handleCopyCode = (key: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFileKey(key);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedFileKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#050507] text-[#e0e0e0] font-sans flex flex-col antialiased">
      <Header tcpPreset={tcpPreset} downloadMode={downloadMode} setDownloadMode={setDownloadMode} cdnType={cdnType} />

      <main className="flex-1 p-4 md:p-6 max-w-[1700px] w-full mx-auto grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Sidebar */}
        <section className="xl:col-span-3 flex flex-col gap-5">
          <FingerprintConfig
            browserPreset={browserPreset}
            setBrowserPreset={setBrowserPreset}
            cdnType={cdnType}
            setCdnType={setCdnType}
            tcpTtl={tcpTtl}
            setTcpTtl={setTcpTtl}
            tcpMss={tcpMss}
            setTcpMss={setTcpMss}
            tcpWindowSize={tcpWindowSize}
            setTcpWindowSize={setTcpWindowSize}
            h2WindowIncrement={h2WindowIncrement}
            setH2WindowIncrement={setH2WindowIncrement}
            greasingEnabled={greasingEnabled}
            setGreasingEnabled={setGreasingEnabled}
            connectionReuse={connectionReuse}
            setConnectionReuse={setConnectionReuse}
            useProxy={useProxy}
            setUseProxy={setUseProxy}
            proxyHost={proxyHost}
            setProxyHost={setProxyHost}
            proxyPort={proxyPort}
            setProxyPort={setProxyPort}
            downloadMode={downloadMode}
            setDownloadMode={setDownloadMode}
            targetUrl={targetUrl}
            setTargetUrl={setTargetUrl}
            batchManifestUrl={batchManifestUrl}
            setBatchManifestUrl={setBatchManifestUrl}
            isParsingManifest={isParsingManifest}
            loadBatchManifest={loadBatchManifest}
            tcpPreset={tcpPreset}
            applyPresetConfig={applyPresetConfig}
            grpcEnabled={grpcEnabled}
            setGrpcEnabled={setGrpcEnabled}
            grpcHubAddress={grpcHubAddress}
            setGrpcHubAddress={setGrpcHubAddress}
            grpcStorageServerId={grpcStorageServerId}
            setGrpcStorageServerId={setGrpcStorageServerId}
            storageServers={storageServers}
          />
          <DnsConfig
            dnsEnabled={dnsEnabled}
            setDnsEnabled={setDnsEnabled}
            dnsServers={dnsServers}
            setDnsServers={setDnsServers}
            dnsTimeout={dnsTimeout}
            setDnsTimeout={setDnsTimeout}
            dnsParallel={dnsParallel}
            setDnsParallel={setDnsParallel}
            dnsCacheEnabled={dnsCacheEnabled}
            setDnsCacheEnabled={setDnsCacheEnabled}
            dnsHosts={dnsHosts}
            setDnsHosts={setDnsHosts}
            lbStrategy={lbStrategy}
            setLbStrategy={setLbStrategy}
          />
          <FingerprintPreview
            browserPreset={browserPreset}
            tcpTtl={tcpTtl}
            tcpMss={tcpMss}
            tcpWindowSize={tcpWindowSize}
            h2WindowIncrement={h2WindowIncrement}
            cdnType={cdnType}
            connectionReuse={connectionReuse}
            greasingEnabled={greasingEnabled}
            tcpPreset={tcpPreset}
          />
        </section>

        {/* Right Working Area */}
        <div className="xl:col-span-9 flex flex-col gap-6">
          {/* Tab Navigation */}
          <div className="flex border-b border-[#2d2d35]/70 bg-[#111116] p-1.5 pb-0 rounded-t-lg select-none gap-2">
            <button
              onClick={() => setActiveTab("downloader")}
              className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 rounded-t transition cursor-pointer ${
                activeTab === "downloader"
                  ? "bg-[#050507] text-[#00ffcc] border-t-2 border-[#00ffcc]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Download className="w-4 h-4" />
              Aligned Downloader
            </button>
            <button
              onClick={() => setActiveTab("ja4_builder")}
              className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 rounded-t transition cursor-pointer ${
                activeTab === "ja4_builder"
                  ? "bg-[#050507] text-[#00ffcc] border-t-2 border-[#00ffcc]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <FileCode className="w-4 h-4" />
              JA3/JA4 Spec
            </button>
            <button
              onClick={() => setActiveTab("tcp_alignment")}
              className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 rounded-t transition cursor-pointer ${
                activeTab === "tcp_alignment"
                  ? "bg-[#050507] text-[#00ffcc] border-t-2 border-[#00ffcc]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Network className="w-4 h-4" />
              TCP/IP Stack
            </button>
            <button
              onClick={() => setActiveTab("dns_resolver")}
              className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 rounded-t transition cursor-pointer ${
                activeTab === "dns_resolver"
                  ? "bg-[#050507] text-[#c084fc] border-t-2 border-[#a855f7]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Compass className="w-4 h-4 text-purple-400" />
              DNS Resolver
            </button>
            <button
              onClick={() => setActiveTab("ai_architect")}
              className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 rounded-t transition cursor-pointer ${
                activeTab === "ai_architect"
                  ? "bg-[#050507] text-amber-500 border-t-2 border-amber-500"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              AI Expert
            </button>
            <button
              onClick={() => setActiveTab("device_manager")}
              className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 rounded-t transition cursor-pointer ${
                activeTab === "device_manager"
                  ? "bg-[#050507] text-[#00ffcc] border-t-2 border-[#00ffcc]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Server className="w-4 h-4 text-[#00ffcc]" />
              Devices
            </button>
            <button
              onClick={() => setActiveTab("task_client")}
              className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 rounded-t transition cursor-pointer ${
                activeTab === "task_client"
                  ? "bg-[#050507] text-cyan-400 border-t-2 border-cyan-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Send className="w-4 h-4 text-cyan-400" />
              Client
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "downloader" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[580px]">
              {downloadMode === "single" ? (
                <>
                  <div className="lg:col-span-7 flex flex-col gap-6">
                    <AlignmentReport score={alignmentReport.score} warnings={alignmentReport.warnings} tcpTtl={tcpTtl} />
                    <DownloadTunnel
                      downloadState={downloadState}
                      downloadProgress={downloadProgress}
                      downloadSpeed={downloadSpeed}
                      downloadLog={downloadLog}
                      targetUrl={targetUrl}
                      startTestDownload={startTestDownload}
                      resetDownload={resetDownload}
                      grpcEnabled={grpcEnabled}
                      grpcServerAddress={grpcHubAddress}
                      grpcStorageServerId={grpcStorageServerId}
                    />
                  </div>
                  <div className="lg:col-span-5 flex flex-col gap-6">
                    <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded shadow-2xl relative overflow-hidden flex-1 flex flex-col">
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-1.5 text-teal-400 border-b border-[#2d2d35] pb-2">
                        <Compass className="w-4 h-4 text-teal-500" />
                        Fingerprint Validation Matrix
                      </h3>
                      <div className="space-y-4 font-mono text-[11px] flex-grow flex flex-col justify-center">
                        <div>
                          <div className="text-[9px] uppercase text-gray-500 mb-1">User-Agent</div>
                          <div
                            className="bg-[#050507] border border-[#1f1f27] p-2.5 rounded font-mono text-[10px] text-gray-300 leading-relaxed truncate"
                            title={getUserAgent()}
                          >
                            {getUserAgent()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase text-gray-500 mb-1">Compiled JA4 Fingerprint</div>
                          <div className="bg-[#050507] border border-[#1f1f27] p-2.5 rounded text-cyan-400 font-bold font-mono tracking-tight text-[10.5px]">
                            {getCompiledJA4()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase text-gray-500 mb-1">TCP SYN Control Parameters</div>
                          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                            <div className="bg-[#050507] border border-[#1f1f27] p-2 rounded">
                              <div className="text-gray-500">IP_TTL</div>
                              <div className="text-white font-bold mt-1">{tcpTtl}</div>
                            </div>
                            <div className="bg-[#050507] border border-[#1f1f27] p-2 rounded">
                              <div className="text-gray-500">TCP_MSS</div>
                              <div className="text-white font-bold mt-1">{tcpMss}B</div>
                            </div>
                            <div className="bg-[#050507] border border-[#1f1f27] p-2 rounded">
                              <div className="text-gray-500">WINDOW</div>
                              <div className="text-[#00ffcc] font-bold mt-1">{tcpWindowSize.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded text-[10px] leading-relaxed text-amber-300">
                          <strong>WAF Detection Principle:</strong>
                          <p className="mt-1">
                            Without uTLS and socket tuning, Node.js native TLS handshake (static JA3) conflicts with
                            browser User-Agent, and Linux SYN TTL=64 with a Windows UA triggers instant 403.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="lg:col-span-7 flex flex-col gap-6">
                    <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded flex flex-col relative overflow-hidden shadow-2xl">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-1 font-bold">
                            Batch Alignment Score
                          </h3>
                          <div className="text-3xl font-extrabold text-[#00ffcc] font-mono flex items-baseline gap-1">
                            {alignmentReport.score}
                            <span className="text-xs font-normal text-gray-500">/ 100 PTS</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {alignmentReport.score >= 75 ? (
                            <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-mono font-bold">
                              WAF Aligned Safe
                            </div>
                          ) : (
                            <div className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-mono font-bold animate-pulse">
                              High Risk Warning
            </div>
          )}

          {(activeTab as string) === "device_manager" && (
            <div className="min-h-[580px]">
              <DeviceManager grpcHubAddress={grpcHubAddress} />
            </div>
          )}

          {(activeTab as string) === "task_client" && (
            <div className="min-h-[580px]">
              <TaskClient grpcHubAddress={grpcHubAddress} />
            </div>
          )}
                        </div>
                      </div>
                      <div className="mt-3.5 h-1.5 bg-[#050507] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            alignmentReport.score >= 75
                              ? "bg-gradient-to-r from-emerald-500 to-[#00ffcc]"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${alignmentReport.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <BatchDownload
                    batchItems={batchItems}
                    selectedBatchItemId={selectedBatchItemId}
                    setSelectedBatchItemId={setSelectedBatchItemId}
                    isBatchRunning={isBatchRunning}
                    runAllBatchDownloads={runAllBatchDownloads}
                    startBatchItemDownload={startBatchItemDownload}
                    browserPreset={browserPreset}
                    tcpPreset={tcpPreset}
                    tcpTtl={tcpTtl}
                    tcpMss={tcpMss}
                    tcpWindowSize={tcpWindowSize}
                    connectionReuse={connectionReuse}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === "ja4_builder" && (
            <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded shadow-2xl min-h-[580px] flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                      JA3 / JA4 TLS Fingerprint Decoder
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Decode cryptographic suite fingerprints from ClientHello binary data:
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-[#00ffcc] bg-[#00ffcc]/5 px-2 py-1 border border-[#00ffcc]/20 rounded">
                    TS+Next-Gen Crypto Suite
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4 font-mono text-xs">
                    <div className="bg-[#050507] p-4 rounded border border-[#1f1f27] space-y-3">
                      <div className="text-xs font-bold text-white border-b border-gray-800 pb-1.5 uppercase tracking-wider">
                        ClientHello Parameters
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Preset:</span>
                        <select
                          value={browserPreset}
                          onChange={(e) => setBrowserPreset(e.target.value)}
                          className="bg-[#111116] text-white p-1.5 rounded border border-[#2d2d35] focus:outline-none focus:ring-1 focus:ring-[#00ffcc] text-xs"
                        >
                          <optgroup label="Chrome">
                            <option value="chrome_124">Chrome v124</option>
                            <option value="chrome_115">Chrome v115</option>
                            <option value="chrome_100">Chrome v100</option>
                            <option value="chrome_88">Chrome v88</option>
                          </optgroup>
                          <optgroup label="Firefox">
                            <option value="firefox_120">Firefox v120</option>
                            <option value="firefox_110">Firefox v110</option>
                            <option value="firefox_90">Firefox v90</option>
                          </optgroup>
                          <optgroup label="Safari">
                            <option value="safari_17">Safari v17.2</option>
                            <option value="safari_15">Safari v15.4</option>
                            <option value="safari_13">Safari v13.1</option>
                          </optgroup>
                          <optgroup label="Utilities">
                            <option value="python_310">Python urllib/3.10</option>
                            <option value="curl_8">curl 8.2.1</option>
                          </optgroup>
                        </select>
                      </div>

                      {(() => {
                        const spec = BROWSER_TLS_SPECS[browserPreset] || BROWSER_TLS_SPECS["chrome_124"];
                        return (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Cipher Suites:</span>
                              <span className="text-[#00ffcc] font-bold">{spec.ciphersCount} suites</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Extensions:</span>
                              <span className="text-cyan-300 font-bold">{spec.extensionsCount} slots</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">ALPN:</span>
                              <span className="text-teal-300 font-bold">
                                {spec.alpn === "00" ? "None (Raw TCP)" : "h2, http/1.1"}
                              </span>
                            </div>
                            <div className="pt-2 border-t border-gray-800 flex justify-between items-center">
                              <span className="text-gray-400">JA3 Hash:</span>
                              <span className="text-yellow-400 text-[11px] font-bold">{spec.ja3Hash}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="bg-[#050507] p-4 rounded border border-[#1f1f27]">
                      <div className="text-xs font-bold text-white border-b border-gray-800 pb-1.5 mb-2 uppercase tracking-wider">
                        How to Align TLS in TypeScript
                      </div>
                      <p className="text-gray-400 text-[11px] leading-relaxed">
                        In Node.js, use <code className="text-teal-300 font-mono">tls.connect()</code> with precise{" "}
                        <code className="text-teal-300 font-mono">ciphers</code> ordering to ensure the compiled
                        ClientHello matches modern Chrome fingerprints for WAF bypass.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <div className="bg-[#050507] border border-[#2d2d35] rounded p-4 font-mono text-[10.5px] leading-relaxed h-[360px] overflow-y-auto relative">
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={() => handleCopyCode("utls", tsSourceFiles.utlsClient.content)}
                          className="bg-teal-950/40 text-teal-300 hover:bg-teal-900 border border-teal-500/30 px-2.5 py-1 text-[10px] rounded cursor-pointer transition flex items-center gap-1"
                        >
                          {copiedFileKey === "utls" ? (
                            <Check className="w-3 h-3 text-[#00ffcc]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedFileKey === "utls" ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <span className="text-gray-500 block border-b border-gray-800 pb-1 mb-2 font-bold uppercase tracking-wider">
                        utls-client.ts
                      </span>
                      <pre className="text-gray-300">{tsSourceFiles.utlsClient.content}</pre>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-[#2d2d35] pt-4 flex justify-between items-center text-xs font-mono">
                <span className="text-gray-400">
                  Copy this TypeScript panel into your Node.js scraper or API client project.
                </span>
                <span className="text-[#00ffcc] font-bold">100% TS SPEC VALID</span>
              </div>
            </div>
          )}

          {activeTab === "tcp_alignment" && (
            <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded shadow-2xl min-h-[580px] flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white mb-2">
                  TCP/IP Option Layout (Socket Handshake Alignment)
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                  WAF detects automation tools by extracting TCP SYN packet{" "}
                  <strong className="text-teal-300">Options list and ordering</strong> beyond application-layer features.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="bg-[#050507] p-4 rounded border border-[#1f1f27] relative overflow-hidden">
                    <div className="absolute top-0 right-0 py-0.5 px-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-[8px] font-bold">
                      WINDOWS
                    </div>
                    <h4 className="text-xs font-bold text-white mb-2 uppercase">Winsock SYN Options</h4>
                    <div className="space-y-1 text-[11px] text-gray-300">
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">1. MSS (1460)</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">2. NOP</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">3. Window Scale (8)</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">4. NOP</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">5. NOP</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">6. SACK Permitted</div>
                    </div>
                    <div className="mt-3 text-[10px] text-purple-400">TTL: 128</div>
                  </div>

                  <div className="bg-[#050507] p-4 rounded border border-[#1f1f27] relative overflow-hidden">
                    <div className="absolute top-0 right-0 py-0.5 px-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-[#050507] text-[8px] font-bold">
                      DARWIN
                    </div>
                    <h4 className="text-xs font-bold text-white mb-2 uppercase">Apple Darwin BSD Options</h4>
                    <div className="space-y-1 text-[11px] text-gray-300">
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">1. MSS (1440)</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">2. Window Scale (7)</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">3. SACK Permitted</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">4. Timestamp</div>
                    </div>
                    <div className="mt-3 text-[10px] text-teal-400">TTL: 64</div>
                  </div>

                  <div className="bg-[#050507] p-4 rounded border border-[#1f1f27] relative overflow-hidden">
                    <div className="absolute top-0 right-0 py-0.5 px-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] font-bold">
                      LINUX
                    </div>
                    <h4 className="text-xs font-bold text-white mb-2 uppercase">Linux Standard Options</h4>
                    <div className="space-y-1 text-[11px] text-gray-300">
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">1. MSS (1460)</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">2. SACK Permitted</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">3. Timestamp</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">4. NOP</div>
                      <div className="bg-[#111116] p-1.5 rounded border border-gray-800">5. Window Scale (7)</div>
                    </div>
                    <div className="mt-3 text-[10px] text-amber-400">TTL: 64</div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="bg-[#050507] border border-[#2d2d35] rounded p-4 font-mono text-[10px] leading-relaxed h-[230px] overflow-y-auto relative">
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={() => handleCopyCode("tuner", tsSourceFiles.tcpSocketTuner.content)}
                        className="bg-teal-950/40 text-teal-300 hover:bg-teal-900 border border-teal-500/30 px-2.5 py-1 text-[9px] rounded cursor-pointer transition flex items-center gap-1"
                      >
                        {copiedFileKey === "tuner" ? (
                          <Check className="w-3 h-3 text-[#00ffcc]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copiedFileKey === "tuner" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <span className="text-gray-500 block border-b border-gray-800 pb-1 mb-2 font-bold uppercase">
                      tcp-socket-tuner.ts
                    </span>
                    <pre className="text-gray-300">{tsSourceFiles.tcpSocketTuner.content}</pre>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-red-950/20 text-[#ff8888] border border-red-900/30 rounded text-xs mt-4">
                <strong>Critical Warning:</strong> Node.js axios uses default libuv TCP stack with Linux TTL=64 and NOP
                intervals. If you send a Safari macOS User-Agent, Cloudflare instantly detects TTL=64 vs expected 128
                mismatch and returns 403, blacklisting your IP.
              </div>
            </div>
          )}

          {activeTab === "dns_resolver" && (
            <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-[#2d2d35]/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded border border-purple-500/20 font-mono">
                    <Compass className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                      DNS Hijack & Multi-Strategy Sandbox
                    </h2>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                      DYNAMIC MULTI-CARRIER DNS ROUTING, LATENCY DIAGNOSTICS
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] bg-[#050507] p-2 rounded border border-[#2d2d35]">
                  <span className="text-gray-500">Gateway:</span>
                  <span className={dnsEnabled ? "text-purple-400 font-bold animate-pulse" : "text-gray-400"}>
                    {dnsEnabled ? "ACTIVE" : "BYPASS"}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-purple-950/15 text-[#d8b4fe] border border-purple-900/30 rounded text-xs leading-relaxed">
                <strong>Advanced DNS Routing:</strong> Enable this to intercept domain resolution through your specified
                upstream DNS servers with hosts override rules. Resolved IPs flow through latency-aware load balancing
                algorithms before injection into keep-alive and HTTP/2 connection lookup callbacks, bypassing geographic
                and CDN blacklists.
              </div>

              <div className="flex border-b border-[#2d2d35]/50 pb-px gap-3 font-mono text-xs">
                <button
                  onClick={() => setActiveDnsSubTab("diagnostic")}
                  className={`pb-2.5 px-1 relative cursor-pointer font-bold transition duration-200 ${
                    activeDnsSubTab === "diagnostic"
                      ? "text-purple-400 border-b border-purple-500"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Diagnostic
                </button>
                <button
                  onClick={() => setActiveDnsSubTab("global_batch")}
                  className={`pb-2.5 px-1 relative cursor-pointer font-bold transition duration-200 ${
                    activeDnsSubTab === "global_batch"
                      ? "text-cyan-400 border-b border-cyan-500"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Global Batch
                </button>
                <button
                  onClick={() => setActiveDnsSubTab("server_list")}
                  className={`pb-2.5 px-1 relative cursor-pointer font-bold transition duration-200 ${
                    activeDnsSubTab === "server_list"
                      ? "text-amber-400 border-b border-amber-500"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Server Pool ({globalDnsStatus?.serverCount || 350} IPs)
                </button>
              </div>

              {activeDnsSubTab === "diagnostic" && (
                <DnsTester
                  dnsTestDomain={dnsTestDomain}
                  setDnsTestDomain={setDnsTestDomain}
                  dnsTestLoading={dnsTestLoading}
                  dnsTestResult={dnsTestResult}
                  dnsServers={dnsServers}
                  dnsTimeout={dnsTimeout}
                  dnsParallel={dnsParallel}
                  dnsCacheEnabled={dnsCacheEnabled}
                  dnsHosts={dnsHosts}
                  lbStrategy={lbStrategy}
                  handleRunDnsTest={handleRunDnsTest}
                />
              )}

              {activeDnsSubTab === "global_batch" && (
                <GlobalDnsManager
                  globalDnsStatus={globalDnsStatus}
                  batchDomainsInput={batchDomainsInput}
                  setBatchDomainsInput={setBatchDomainsInput}
                  batchTimeout={batchTimeout}
                  setBatchTimeout={setBatchTimeout}
                  batchConcurrency={batchConcurrency}
                  setBatchConcurrency={setBatchConcurrency}
                  batchResolving={batchResolving}
                  batchLogs={batchLogs}
                  handleRunBatchDns={handleRunBatchDns}
                  handleDeleteCacheDomain={handleDeleteCacheDomain}
                />
              )}

              {activeDnsSubTab === "server_list" && (
                <div className="bg-[#050507] border border-[#2d2d35] p-5 rounded-lg space-y-4 font-mono text-xs">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Network className="w-4 h-4 text-amber-400" /> Global 350+ DNS Server Pool
                      </h3>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        SYSTEM SYNCHRONIZED ACROSS NORTH AMERICA, EUROPE, ASIA-PACIFIC, LATAM
                      </p>
                    </div>
                    <span className="bg-amber-400/10 text-amber-400 border border-amber-400/20 text-[10px] px-2 py-0.5 rounded font-bold">
                      {globalDnsStatus?.serverCount || 0} SERVERS
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[300px] overflow-y-auto p-1.5 bg-[#111116]/40 rounded border border-gray-800">
                    {globalDnsStatus?.servers && Object.keys(globalDnsStatus.servers).length > 0 ? (
                      Object.keys(globalDnsStatus.servers).map((loc, idx) => (
                        <div
                          key={idx}
                          className="bg-[#111116] border border-gray-800/80 p-2 rounded flex flex-col justify-between text-[11px] font-mono hover:border-amber-500/30 transition"
                        >
                          <span className="text-gray-400 font-bold truncate" title={loc}>
                            {loc}
                          </span>
                          <span className="text-amber-400 text-[10px] mt-1">{globalDnsStatus.servers[loc]}</span>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full py-12 text-center text-gray-500">
                        Loading global DNS server list...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "ai_architect" && (
            <div className="bg-[#111116] border border-[#2d2d35] p-5 rounded shadow-2xl min-h-[580px] flex flex-col justify-between">
              <AiChat
                chatHistory={chatHistory}
                isAiLoading={isAiLoading}
                chatMessage={chatMessage}
                setChatMessage={setChatMessage}
                handleSendPrompt={handleSendPrompt}
                browserPreset={browserPreset}
                tcpPreset={tcpPreset}
                tcpTtl={tcpTtl}
              />
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-[#1a1a24] bg-[#050507] py-6 text-center text-[10.5px] text-gray-600 font-mono">
        <p>TCP FINGERPRINT ALIGNMENT DOWNLOADER // 2026 CYBER DEFENSE LAB INTERACTIVE CONSOLE</p>
        <p className="mt-1 text-gray-500">
          Standards: JA3/JA4 TLS spoofing, TCP/IP Window Scaling matching & HTTP/2 specs alignment.
        </p>
      </footer>
    </div>
  );
}
