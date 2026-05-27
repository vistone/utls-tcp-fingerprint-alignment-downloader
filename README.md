# uTLS TCP Fingerprint Alignment Downloader

A web-based tool for testing TLS/TCP fingerprint alignment against CDN/WAF systems. Analyzes how your connection appears to target servers by measuring JA4 signatures, HTTP/2 settings frames, TCP/IP stack parameters, and DNS resolution paths — then downloads the target content while reporting real-time telemetry.

Built with **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS v4**.

---

## Features

- **Multi-Protocol Download**: HTTP/3 (QUIC via `@currentspace/http3`), HTTP/2 multiplexed, HTTP/1.1 with automatic fallback chain (`H3 → H2 → H1.1`)
- **CDN-Specific Fingerprint Optimization**: Cloudflare, Akamai, Imperva/Incapsula, F5/AWS — each applies tailored TLS ciphers, HTTP/2 settings, and TCP parameters
- **Browser-Level TLS Presets**: Chrome v124/115/100/88, Firefox v120/110/90, Safari v17/15/13.1, Python urllib, curl 8 — each with matching extension set and JA3/JA4 hash
- **Custom DNS Pipeline**: Multi-upstream resolver (parallel/serial), static hosts override, local JSON cache, TCP latency-based load balancer (fastest/round-robin/random/priority)
- **IP Geolocation**: Resolved IPs auto-enriched with ipinfo.io data (city, country, ASN, ISP, hostname, coordinates)
- **Global DNS Resolution**: Batch resolve domains across hundreds of upstream servers, store and deduplicate results
- **AI Architect Consultation**: Built-in chat interface with MiMo API (OpenAI-compatible) for fingerprint bypass analysis
- **Server-View Fingerprint Panel**: Displays the JA4 header, TLS profile, H2 settings, TCP/IP SYN signature, and OS fingerprint as seen by the target server
- **Real-Time NDJSON Stream**: Download progress, NIC telemetry, TLS handshake details, and WAF audit logs streamed live
- **SSRF Protection**: Private/reserved IP ranges (RFC1918, loopback, link-local, CGN) blocked at the URL level
- **API Authentication**: Configurable Bearer token / `X-API-Key` / query-string authorization on all endpoints

---

## Quick Start

### Prerequisites

- Node.js 22.x+
- npm 10.x+

### Install & Run

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your API keys
npm run dev
```

Open http://localhost:3000

### Build for Production

```bash
npm run build
npm start
```

---

## Configuration

All configuration via `.env.local`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MIMO_API_KEY` | ❌ | — | Xiaomi MiMo API key for AI Architect chat |
| `MIMO_BASE_URL` | ❌ | `https://token-plan-cn.xiaomimimo.com/v1` | MiMo API endpoint |
| `MIMO_MODEL` | ❌ | `mimo-v2.5-pro` | MiMo model name |
| `API_SECRET_KEY` | ❌ | — | Protect API endpoints; empty = no auth (dev mode) |
| `IPINFO_TOKEN` | ❌ | — | [ipinfo.io](https://ipinfo.io) token for IP geolocation |
| `TLS_REJECT_UNAUTHORIZED` | ❌ | `false` | Set to `true` to enable TLS cert validation |

---

## Architecture

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (dark theme)
│   ├── page.tsx                  # Main SPA orchestrator
│   ├── error.tsx                 # React error boundary
│   ├── globals.css               # Tailwind + custom scrollbars
│   └── api/
│       ├── download/route.ts     # Core download: H3→H2→H1.1 fallback chain
│       ├── architect/route.ts    # AI chat (MiMo API proxy)
│       ├── dns-resolve/route.ts  # Custom DNS resolution + load balancer
│       ├── parse-manifest/route.ts# JSON manifest parsing (local/remote)
│       ├── global-dns/
│       │   ├── status/route.ts   # DNS cache status query
│       │   ├── resolve-batch/route.ts  # Batch cross-server DNS resolution
│       │   └── delete-cache/route.ts   # DNS cache deletion
│       └── ip-info/route.ts      # IP geolocation lookup (ipinfo.io)
├── components/                   # React UI components (13 files)
│   ├── Header.tsx                # Top bar: WAF engine, JA4 status, mode toggle
│   ├── FingerprintConfig.tsx     # TLS profile + TCP/IP stack config
│   ├── FingerprintPreview.tsx    # Server-view fingerprint display
│   ├── DownloadTunnel.tsx        # Download console with auto-scroll logs
│   ├── DnsConfig.tsx             # DNS resolver configuration
│   ├── DnsTester.tsx             # DNS test with IP info display
│   ├── GlobalDnsManager.tsx      # Global batch DNS resolve UI
│   ├── BatchDownload.tsx          # Batch item download list
│   ├── AiChat.tsx                # AI architect chat interface
│   └── AlignmentReport.tsx       # Fingerprint alignment scoring
└── lib/                          # Shared utilities (5 files)
    ├── ssrf.ts                   # IP blacklist validation
    ├── auth.ts                   # API key validation
    ├── dns.ts                    # DNS resolution, load balancing, cache
    ├── ip-info.ts                # ipinfo.io client with in-memory cache
    └── sse-helper.ts             # NDJSON streaming helpers
```

---

## Download Flow

```
User clicks download
  │
  ├─ H3 preferred? → connectAsync(QUIC) → success → stream body → complete
  │                                        └─ fail → fall through
  │
  ├─ HTTPS + no proxy? → fetch() [undici/H2] → read body chunks → complete
  │
  └─ Legacy path:
      ├─ H2 session pool hit? → downloadWithH2Session → complete
      ├─ H2 session pool miss? → http2.connect → downloadWithH2Session → complete
      └─ H1.1 fallback → downloadWithHttp1 → complete
```

### CDN Optimization Matrix

| CDN | Changes Applied |
|-----|----------------|
| **Cloudflare** | Force H2, window increment=6291456, filter ECDHE-RSA/DHE ciphers |
| **Akamai** | Auto-correct TTL(128/64)/MSS(1460/1440) per UA-detected OS, force keep-alive |
| **Imperva** | Auto-upgrade Python→Chrome preset, reorder ciphers, force connection reuse |
| **F5/AWS** | Force connection reuse, warn on concurrency >8 |

### Auto TCP Parameters

Browser preset -> OS mapping for TTL, MSS, Window Size:

| Browser | Platform | TTL | MSS | Window |
|---------|----------|-----|-----|--------|
| Chrome | Windows | 128 | 1460 | 65535 |
| Firefox | Linux | 64 | 1460 | 87380 |
| Safari | macOS | 64 | 1440 | 131072 |
| Python/curl | Linux | 64 | 1460 | 87380 |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/download` | ✓ | Download with NDJSON stream telemetry |
| `POST` | `/api/architect` | ✓ | AI architect chat (MiMo API) |
| `POST` | `/api/dns-resolve` | ✓ | DNS resolution with load balancer |
| `POST` | `/api/parse-manifest` | ✓ | Parse JSON manifest for batch URLs |
| `GET`  | `/api/global-dns/status` | ✓ | DNS cache status |
| `POST` | `/api/global-dns/resolve-batch` | ✓ | Batch DNS resolution (max 50 domains) |
| `POST` | `/api/global-dns/delete-cache` | ✓ | Delete domain DNS cache |
| `POST` | `/api/ip-info` | ✓ | Batch IP geolocation lookup (max 50 IPs) |

All endpoints (except OPTIONS preflight) enforce `requireApiKey` middleware when `API_SECRET_KEY` is configured.

---

## Security

- **SSRF Prevention**: Private/reserved IP ranges (127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x, CGNAT 100.64.x.x, link-local, multicast) are blocked before any connection is attempted
- **Path Traversal**: File paths are resolved and validated against allowed prefixes (`public/`, `dns_records/`)
- **Input Validation**: Domain names must match `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$` — rejects `..`, `/`, `\`
- **Rate Limiting**: Batch DNS capped at 50 domains, concurrency capped at 100
- **Stream Safety**: `readableHighWaterMark` at 64MB, abort controller on component unmount, `safeCloseStream` guard against multiple `close()` calls

---

## License

MIT
