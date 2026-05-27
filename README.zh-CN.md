# uTLS TCP 指纹对齐下载器

用于测试 TLS/TCP 指纹与 CDN/WAF 系统对齐程度的 Web 工具。通过测量 JA4 签名、HTTP/2 Settings 帧、TCP/IP 协议栈参数和 DNS 解析路径，分析你的连接在目标服务器眼中的特征，同时实时传输下载内容并报告遥测数据。

基于 **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS v4** 构建。

---

## 功能特性

- **多协议下载**：HTTP/3 (QUIC via `@currentspace/http3`)、HTTP/2 多路复用、HTTP/1.1，自动降级链（`H3 → H2 → H1.1`）
- **CDN 专属指纹优化**：Cloudflare、Akamai、Imperva/Incapsula、F5/AWS — 各自应用定制 TLS 密码套件、H2 设置和 TCP 参数
- **浏览器级 TLS 预设**：Chrome v124/115/100/88、Firefox v120/110/90、Safari v17/15/13.1、Python urllib、curl 8 — 每种附匹配扩展集和 JA3/JA4 哈希
- **自定义 DNS 管道**：多上游解析器（并行/串行）、静态 hosts 覆写、本地 JSON 缓存、基于 TCP 延迟的负载均衡（最快/轮询/随机/优先级）
- **IP 地理位置**：解析出的 IP 自动通过 ipinfo.io 丰富数据（城市、国家、ASN、ISP、主机名、坐标）
- **全局 DNS 解析**：跨数百个上游服务器批量解析域名，存储并去重结果
- **AI 架构师咨询**：内置聊天界面，通过 MiMo API（兼容 OpenAI）进行指纹绕过分析
- **服务端指纹面板**：展示目标服务器看到的 JA4 头、TLS 配置、H2 设置、TCP/IP SYN 签名和 OS 指纹
- **实时 NDJSON 流**：下载进度、网卡遥测、TLS 握手详情和 WAF 审计日志实时推送
- **SSRF 防护**：URL 层阻止私有/保留 IP 范围（RFC1918、loopback、link-local、CGN）
- **API 认证**：所有端点可配置 Bearer token / `X-API-Key` / 查询参数授权

---

## 快速开始

### 前置条件

- Node.js 22.x+
- npm 10.x+

### 安装与运行

```bash
npm install
cp .env.example .env.local
# 编辑 .env.local 配置你的 API 密钥
npm run dev
```

打开 http://localhost:3000

### 构建生产版本

```bash
npm run build
npm start
```

---

## 配置

所有配置通过 `.env.local` 文件：

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `MIMO_API_KEY` | ❌ | — | 小米 MiMo API 密钥，用于 AI 架构师对话 |
| `MIMO_BASE_URL` | ❌ | `https://token-plan-cn.xiaomimimo.com/v1` | MiMo API 端点 |
| `MIMO_MODEL` | ❌ | `mimo-v2.5-pro` | MiMo 模型名 |
| `API_SECRET_KEY` | ❌ | — | 保护 API 端点；空值=无认证（开发模式） |
| `IPINFO_TOKEN` | ❌ | — | [ipinfo.io](https://ipinfo.io) 的地理解析 token |
| `TLS_REJECT_UNAUTHORIZED` | ❌ | `false` | 设为 `true` 启用 TLS 证书校验 |

---

## 架构

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 根布局（暗色主题）
│   ├── page.tsx                  # 主 SPA 编排器
│   ├── error.tsx                 # React 错误边界
│   ├── globals.css               # Tailwind + 自定义滚动条
│   └── api/
│       ├── download/route.ts     # 核心下载：H3→H2→H1.1 降级链
│       ├── architect/route.ts    # AI 对话（MiMo API 代理）
│       ├── dns-resolve/route.ts  # 自定义 DNS 解析 + 负载均衡
│       ├── parse-manifest/route.ts # JSON 清单解析（本地/远程）
│       ├── global-dns/
│       │   ├── status/route.ts   # DNS 缓存状态查询
│       │   ├── resolve-batch/route.ts  # 批量跨服务器 DNS 解析
│       │   └── delete-cache/route.ts   # DNS 缓存删除
│       └── ip-info/route.ts      # IP 地理位置查询（ipinfo.io）
├── components/                   # React UI 组件（13 个文件）
│   ├── Header.tsx                # 顶栏：WAF 引擎、JA4 状态、模式切换
│   ├── FingerprintConfig.tsx     # TLS 配置 + TCP/IP 协议栈
│   ├── FingerprintPreview.tsx    # 服务端指纹显示面板
│   ├── DownloadTunnel.tsx        # 下载控制台（自动滚动日志）
│   ├── DnsConfig.tsx             # DNS 解析器配置
│   ├── DnsTester.tsx             # DNS 测试（含 IP 信息展示）
│   ├── GlobalDnsManager.tsx      # 全局批量 DNS 解界面
│   ├── BatchDownload.tsx          # 批量下载项列表
│   ├── AiChat.tsx                # AI 架构师聊天界面
│   └── AlignmentReport.tsx       # 指纹对齐评分
└── lib/                          # 共享工具库（5 个文件）
    ├── ssrf.ts                   # IP 黑名单验证
    ├── auth.ts                   # API 密钥验证
    ├── dns.ts                    # DNS 解析、负载均衡、缓存
    ├── ip-info.ts                # ipinfo.io 客户端（内存缓存）
    └── sse-helper.ts             # NDJSON 流工具
```

---

## 下载流程

```
用户点击下载
  │
  ├─ 开启 H3？→ connectAsync(QUIC) → 成功 → 流式读取 body → 完成
  │                                   └─ 失败 → 继续向下
  │
  ├─ HTTPS + 无代理？→ fetch() [undici/H2] → 读取 body 块 → 完成
  │
  └─ 传统路径：
      ├─ H2 会话池命中？→ downloadWithH2Session → 完成
      ├─ H2 未命中 → http2.connect → downloadWithH2Session → 完成
      └─ H1.1 降级 → downloadWithHttp1 → 完成
```

### CDN 优化矩阵

| CDN | 应用变更 |
|-----|----------|
| **Cloudflare** | 强制 H2、窗口增量=6291456、过滤 ECDHE-RSA/DHE 密码套件 |
| **Akamai** | 根据 UA 操作系统自动修正 TTL(128/64)/MSS(1460/1440)、强制 keep-alive |
| **Imperva** | 自动将 Python 预设升级为 Chrome、重排密码套件、强制连接复用 |
| **F5/AWS** | 强制连接复用、并发数 >8 时告警 |

### 自动 TCP 参数

浏览器预设 → 操作系统映射（TTL、MSS、Window Size）：

| 浏览器 | 平台 | TTL | MSS | Window |
|--------|------|-----|-----|--------|
| Chrome | Windows | 128 | 1460 | 65535 |
| Firefox | Linux | 64 | 1460 | 87380 |
| Safari | macOS | 64 | 1440 | 131072 |
| Python/curl | Linux | 64 | 1460 | 87380 |

---

## API 端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/api/download` | ✓ | 下载，返回 NDJSON 流遥测数据 |
| `POST` | `/api/architect` | ✓ | AI 架构师对话（MiMo API） |
| `POST` | `/api/dns-resolve` | ✓ | DNS 解析 + 负载均衡 |
| `POST` | `/api/parse-manifest` | ✓ | 解析 JSON 清单，提取批量 URL |
| `GET`  | `/api/global-dns/status` | ✓ | DNS 缓存状态 |
| `POST` | `/api/global-dns/resolve-batch` | ✓ | 批量 DNS 解析（最多 50 个域名） |
| `POST` | `/api/global-dns/delete-cache` | ✓ | 删除域名的 DNS 缓存 |
| `POST` | `/api/ip-info` | ✓ | 批量 IP 地理位置查询（最多 50 个 IP） |

配置了 `API_SECRET_KEY` 时，所有端点（除 OPTIONS 预检请求外）均受 `requireApiKey` 中间件保护。

---

## 安全

- **SSRF 防护**：私有/保留 IP 范围（127.x.x.x、10.x.x.x、172.16-31.x.x、192.168.x.x、169.254.x.x、CGNAT 100.64.x.x、link-local、组播）在发起任何连接前被阻止
- **路径穿越**：文件路径经过解析和验证，确保在允许前缀内（`public/`、`dns_records/`）
- **输入验证**：域名必须匹配 `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$` — 拒绝 `..`、`/`、`\`
- **速率限制**：批量 DNS 上限 50 个域名，并发上限 100
- **流安全**：`readableHighWaterMark` 设为 64MB、组件卸载时 AbortController 自动终止、`safeCloseStream` 防重复调用

---

## 许可证

MIT
