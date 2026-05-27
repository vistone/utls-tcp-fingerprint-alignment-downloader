# 项目全面分析报告

## 1. 项目概述

| 属性 | 值 |
|------|-----|
| **名称** | uTLS & TCP Fingerprint Alignment Downloader |
| **类型** | 全栈 TypeScript 交互式模拟器 / 工具 |
| **核心功能** | 通过精确对齐 TLS JA3/JA4 指纹与底层 TCP/IP SYN 特征（TTL、MSS、TCP Options 顺序），绕过 Cloudflare、Akamai、Imperva 等 WAF 的反爬虫 403 拦截 |
| **来源** | Google AI Studio 应用，已替换为 Xiaomi MiMo API |
| **运行端口** | 3000 |

---

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 19 + TypeScript + Tailwind CSS 4 + Vite 6 + Lucide Icons + Motion (Framer Motion) |
| **后端** | Express 4 + Node.js 原生 `tls` / `http2` / `net` / `dns` 模块 |
| **AI** | Xiaomi MiMo (OpenAI-compatible API) |
| **构建** | esbuild (server bundling) + Vite (client bundling) + tsx (dev) |
| **开发运行** | `tsx server.ts` (端口 3000) |
| **生产运行** | `dist/server.cjs` |

---

## 3. 架构分析

```
┌─────────────────────────────────────────────────────┐
│                   前端 (React SPA)                   │
│  ┌───────────┬───────────┬───────────┬─────────────┐ │
│  │  下载器    │ JA4构建器  │ TCP对齐原理│  DNS解析器   │ │
│  │(Downloader)│(JA4 Builder)│(TCP Align)│ (DNS/LB)   │ │
│  └─────┬─────┴─────┬─────┴─────┬─────┴──────┬──────┘ │
│        └───────────┴───────────┴────────────┘        │
│                    NDJSON Streaming                   │
├─────────────────────────────────────────────────────┤
│               Express 后端 (server.ts)                │
│  ┌─────────────┬─────────────┬──────────────────────┐│
│  │ /api/download│/api/architect│  /api/dns-resolve    ││
│  │ (H2/H1代理) │ (MiMo AI) │  (自定义DNS+LB)      ││
│  ├─────────────┼─────────────┤                      ││
│  │/api/parse-manifest│/api/global-dns/*│             ││
│  └─────────────┴─────────────┴──────────────────────┘│
│  ┌──────────────────────────────────────────────────┐│
│  │   HTTP/2 会话池 + Keep-Alive 连接池               ││
│  │   自定义 DNS 解析器 + 负载均衡器                   ││
│  │   后台 DNS 守护线程 (12s 间隔循环)                 ││
│  └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

---

## 4. 项目文件结构

```
utls-tcp-fingerprint-alignment-downloader/
├── .env.example              # 环境变量示例（GEMINI_API_KEY, APP_URL）
├── .gitignore
├── README.md
├── index.html                # Vite SPA 入口 HTML
├── metadata.json             # Google AI Studio 应用元数据
├── package.json              # 项目依赖与脚本
├── package-lock.json
├── tsconfig.json             # TypeScript 配置（ES2022, React JSX）
├── vite.config.ts            # Vite 配置（React + Tailwind 插件）
├── server.ts                 # 后端主文件（1986 行）
├── global_dns_servers.json   # 全球 350+ DNS 服务器列表（746 行）
├── public/
│   └── example-manifest.json # 示例批量下载清单
├── src/
│   ├── main.tsx              # React 入口
│   ├── App.tsx               # 主应用组件（2664 行）
│   ├── index.css             # 全局样式（Inter + JetBrains Mono 字体）
│   └── tsSource.ts           # TLS 指纹数据源与浏览器规格定义（613 行）
├── dns_records/              # DNS 解析缓存（JSON 持久化）
│   ├── cloudflare.com.json
│   ├── github.com.json
│   ├── google.com.json
│   └── kh.google.com.json
└── node_modules/             # 依赖包
```

---

## 5. 五大功能模块

### Tab 1: 对齐高速分发下载端 (Downloader)

- **单文件模式**: 输入目标 URL 直接发起对齐下载
- **批量模式**: 从 JSON 清单中递归提取所有 HTTP/HTTPS 链接，并发下载
- **实时 NDJSON 流式日志**: 握手状态、TLS 证书信息、网卡追踪、进度条
- **指纹合规性实时评分**: 0-100 分制，< 75 分标记为高危
- **协议自动切换**: 优先 HTTP/2 多路复用，失败自动降级 HTTP/1.1
- **代理隧道支持**: CONNECT 隧道 + TLS 透传
- **4 种 CDN 检测规则**:
  - **Cloudflare**: 检查 JA3/JA4 + HTTP/2 Settings 帧窗口增量
  - **Akamai**: 检查 TCP SYN TTL、MSS 与 UA 系统匹配度
  - **Imperva**: 检查加密套件 Cipher Suites 排序
  - **F5/AWS Shield**: 检查并发频控与 Connection Multiplexing

### Tab 2: TS 指纹解算沙盒 (JA4 Builder)

展示 4 个 TypeScript 源码示例文件：

| 文件 | 说明 |
|------|------|
| `utls-client.ts` | 使用 Node.js 原生 `tls` + `http2` 模块构建自定义 ClientHello 握手 |
| `http2-h2-align.ts` | HTTP/2 指纹对齐，模拟 Chrome H2 Settings/WINDOW_UPDATE 帧 |
| `tcp-socket-tuner.ts` | TCP 层 TTL/MSS/Window Size 微调对齐目标 OS |
| `ja4-builder-helper.ts` | JA4 指纹计算与对齐评估工具 |

**14 种浏览器 TLS 指纹预置**:

| 分组 | 预置 |
|------|------|
| Google Chrome | v124 (Latest), v115 (Stable), v100 (Legacy), v88 (Pre-h2) |
| Mozilla Firefox | v120 (Latest), v110 (Stable), v90 (Legacy ESR) |
| Apple Safari | v17.2 (Sonoma), v15.4 (Monterey), v13.1 (Catalina) |
| 工具库 | Python urllib/3.10, curl 8.2.1 (OpenSSL) |

每个预置包含：User-Agent、JA3 Hash、密码套件数量、扩展列表、H2 窗口大小、GREASE 开关。

### Tab 3: TCP/IP Stack 对齐原理谱表

- 展示 TCP 指纹对齐原理（TTL、MSS、Window Size 与 OS 的匹配关系）
- **四种 TCP 预设**:

| 预设 | TTL | MSS | Window Size |
|------|-----|-----|-------------|
| Windows 11 | 128 | 1460 | 65535 |
| macOS OS-X | 64 | 1440 | 131072 |
| Linux Standard | 64 | 1460 | 87380 |
| 杂乱不调校 | 128 | 1380 | 32768 |

### Tab 4: 自定义 DNS 及负载均衡 (Vistone DNS)

- **交互式 DNS 测试**: 输入域名，实时查看解析结果、延迟、负载均衡决策
- **全球批量拉网解析**: 350+ DNS 服务器并发查询
- **本地 JSON 持久化缓存**: `dns_records/` 目录按域名存储
- **4 种负载均衡策略**:
  - `fastest` - 最低 TCP 握手延迟
  - `round_robin` - 平滑轮询调度
  - `random` - 均匀随机分布
  - `priority` - 静态优先级（A 记录首位）
- **后台守护线程**: 自动循环解析已知域名（12 秒间隔，30 秒循环周期）

### Tab 5: 403 诊断与 WAF 突破 AI 专家

- 集成 Xiaomi MiMo 作为"系统安全架构师"
- 自动传递当前指纹配置上下文（User-Agent、JA4、TCP 参数、对齐分数、目标 CDN）
- 支持多轮历史对话

---

## 6. 后端 API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/download` | POST | 核心下载器，支持 H2/H1 自动切换、代理隧道、自定义 DNS 劫持、负载均衡分流，NDJSON 流式输出 |
| `/api/architect` | POST | MiMo AI 对话接口，传递指纹配置上下文 |
| `/api/dns-resolve` | POST | 单域名 DNS 解析 + 负载均衡选 IP |
| `/api/parse-manifest` | POST | 解析 JSON 清单递归提取 URL |
| `/api/global-dns/status` | GET | 获取全球 DNS 服务器列表和已缓存域名状态 |
| `/api/global-dns/resolve-batch` | POST | 批量 DNS 解析（跨所有全球服务器） |
| `/api/global-dns/delete-cache` | POST | 删除指定域名或全部 DNS 缓存 |

---

## 7. 后端核心模块

### 7.1 下载引擎

- **HTTP/2 会话池** (`h2Sessions`): 按 origin 缓存 H2 会话，多文件下载复用同一 TCP/TLS 通道
- **Keep-Alive Agent 池** (`keepAliveHttpsAgents` / `keepAliveHttpAgents`): HTTP/1.1 长连接复用
- **协议自动降级**: H2 失败（超时/错误/4xx）自动切换到 HTTP/1.1
- **12MB 内存保护**: 限制单次下载最大读取量，防止沙箱 OOM
- **代理隧道** (`getProxiedSocket`): 支持 HTTP CONNECT 隧道 + TLS 透传

### 7.2 DNS 引擎

- **多级缓存**: 本地 Hosts 映射 > 本地 JSON 文件 > 内存缓存 > 远程 DNS 查询
- **自定义上游 DNS**: 支持并发/串行两种查询模式
- **双栈解析**: 同时查询 A (IPv4) 和 AAAA (IPv6) 记录
- **TCP 延迟测量**: 通过实际 TCP 连接测量目标 IP 延迟，用于 fastest 策略

### 7.3 后台守护线程

- 无限循环，依次解析所有已知域名
- 每个域名间隔 12 秒，每轮循环间隔 30 秒
- 自动合并去重新解析的 IP 到现有缓存文件

---

## 8. 数据文件说明

| 文件 | 行数 | 说明 |
|------|------|------|
| `global_dns_servers.json` | 746 | 全球 350+ DNS 服务器 IP 列表（Cloudflare、Google、各地区 DNS） |
| `dns_records/google.com.json` | - | Google 域名 IPv4/IPv6 缓存 |
| `dns_records/kh.google.com.json` | - | kh.google.com 域名缓存 |
| `dns_records/cloudflare.com.json` | - | Cloudflare 域名缓存 |
| `dns_records/github.com.json` | - | GitHub 域名缓存 |
| `public/example-manifest.json` | 11 | 示例批量下载清单（4 个文件 URL） |

---

## 9. 代码统计

| 文件 | 行数 | 说明 |
|------|------|------|
| `server.ts` | 1986 | 后端主文件（路由 + DNS + 下载引擎 + 连接池） |
| `src/App.tsx` | 2664 | 前端主组件（UI + 状态管理 + API 调用） |
| `src/tsSource.ts` | 613 | 浏览器 TLS 指纹数据库 + JA4 工具函数 |
| `src/main.tsx` | 10 | React 入口 |
| `src/index.css` | 7 | 全局样式 |
| **合计** | **~5280** | |

---

## 10. 代码质量观察

### 优点

- 功能完整度高，涵盖从 DNS 解析到 TLS 对齐到 H2 多路复用的完整链路
- 实时流式日志设计（NDJSON），用户体验好
- 多 CDN 检测规则覆盖（Cloudflare / Akamai / Imperva / AWS Shield）
- 连接池复用设计（HTTP/2 Session 池 + Keep-Alive Agent 池）
- 14 种浏览器指纹预置数据详尽，包含 TLS 扩展槽位序列
- 后台 DNS 守护线程主动维护缓存新鲜度
- 指纹对齐评分引擎覆盖多个维度（TCP/UA/TLS/H2/Grease）

### 待改进

- **单文件过大**: `server.ts` 1986 行，`App.tsx` 2664 行，建议拆分为模块
- **拼写错误**: `src/App.tsx:89` 中 `"clouflare.com"` 应为 `"cloudflare.com"`
- **静态假数据**: `server.ts:149-152` 中 `[NIC-TRACK]` 日志的 `127.0.0.1:39108` 是硬编码，非真实网卡数据
- **无限循环无退出**: 后台 DNS 守护线程 (`startBackgroundDnsResolvers`) 没有优雅退出机制（如 `AbortController`）
- **代码风格**: `selectBalancedIp` 使用 `async function` 但内部用 `new Promise` 包裹，可简化为纯 async/await
- **TypeScript 类型**: 部分参数使用 `any` 类型（如 `res: any`），可加强类型约束

---

## 11. 安全注意事项

| 项目 | 说明 |
|------|------|
| `rejectUnauthorized: false` | 多处 TLS 连接禁用证书验证，适合目标场景但存在 MITM 风险 |
| CORS 全开 | `Access-Control-Allow-Origin: *`，仅适合本地开发 |
| 全局异常捕获 | `uncaughtException` / `unhandledRejection` 保持进程存活，避免单次错误崩溃 |
| 代理凭据 | 代理 Host/Port 通过请求体传递，未做加密存储 |
| DNS 缓存文件 | `dns_records/` 目录下明文存储 IP，无敏感信息风险 |

---

## 12. 运行方式

```bash
# 安装依赖
npm install

# 设置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入 GEMINI_API_KEY

# 开发模式
npm run dev
# 访问 http://localhost:3000

# 生产构建
npm run build
npm start
```

---

## 13. 总结

这是一个**功能丰富的反 WAF 指纹对齐下载工具**，核心价值在于将 TLS ClientHello 特征（JA3/JA4）、HTTP/2 Settings 帧参数、与操作系统级 TCP/IP SYN 指纹（TTL / MSS / Window Size）三者统一对齐，模拟真实浏览器的完整网络栈行为。

配合自定义 DNS + 负载均衡 + 代理隧道支持，形成了一个完整的对抗 CDN WAF 检测的工具链。

代码量约 5280 行（不含依赖），结构上适合进一步模块化拆分。
