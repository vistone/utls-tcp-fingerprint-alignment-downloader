export interface MarketingContent {
  nav: {
    features: string;
    tech: string;
    pricing: string;
    faq: string;
    launchApp: string;
  };
  hero: {
    badge: string;
    headline: string[];
    headlineGradient: string;
    headlineMuted: string;
    subtitle: string[];
    cta: string;
    ctaSecondary: string;
  };
  metrics: Array<{ label: string; value: string; suffix?: string }>;
  features: {
    section: string;
    title: string[];
    titleGradient: string;
    items: Array<{
      title: string;
      desc: string;
    }>;
  };
  cdn: {
    section: string;
    title: string[];
    titleGradient: string;
    items: Array<{ name: string }>;
    badge: string;
  };
  tech: {
    section: string;
    title: string[];
    titleGradient: string;
    items: Array<{
      title: string;
      desc: string;
    }>;
  };
  layers: {
    section: string;
    title: string[];
    titleGradient: string;
    items: Array<{
      layer: string;
      name: string;
      detail: string;
    }>;
  };
  pricing: {
    section: string;
    title: string;
    popular: string;
    tiers: Array<{
      name: string;
      price: string;
      period?: string;
      desc: string;
      features: string[];
      cta: string;
    }>;
  };
  faq: {
    section: string;
    title: string;
    items: Array<{
      q: string;
      a: string;
    }>;
  };
  cta: {
    title: string[];
    titleGradient: string;
    subtitle: string;
    button: string;
  };
  footer: {
    tagline: string;
    license: string;
    links: Array<{ label: string; href: string }>;
  };
  scrollerItems: string[];
}

export const en: MarketingContent = {
  nav: {
    features: "Features",
    tech: "Tech",
    pricing: "Pricing",
    faq: "FAQ",
    launchApp: "Launch App",
  },
  hero: {
    badge: "v4.0 — Next Generation Fingerprint Engine",
    headline: ["Become", "Any Browser.", "Any OS."],
    headlineGradient: "from-emerald-300 via-cyan-300 to-purple-400",
    headlineMuted: "Any OS.",
    subtitle: [
      "The first open-source platform to align",
      "TLS fingerprints",
      "TCP/IP SYN parameters",
      "HTTP/2 settings",
      "and",
      "DNS routing",
      "into a single, undetectable browsing profile.",
    ],
    cta: "Launch Interactive Console",
    ctaSecondary: "Explore Features",
  },
  metrics: [
    { label: "Browser TLS Presets", value: "14" },
    { label: "CDN Detection Keys", value: "4" },
    { label: "Global DNS Nodes", value: "350+" },
    { label: "Alignment Score", value: "100", suffix: "/100" },
    { label: "Protocol Layers", value: "7" },
    { label: "Time to Bypass", value: "<1", suffix: "s" },
  ],
  features: {
    section: "Core Capabilities",
    title: ["Everything You Need to", "Disappear Into the Crowd"],
    titleGradient: "from-emerald-300 to-cyan-300",
    items: [
      {
        title: "JA3/JA4 TLS Spoofing",
        desc: "14 browser-grade TLS presets with precise cipher ordering, GREASE injection, and extension replication. Your handshake becomes indistinguishable from Chrome, Firefox, or Safari.",
      },
      {
        title: "TCP/IP SYN Tuning",
        desc: "Per-OS TTL/MSS/Window scaling with correct option ordering. Match Windows, macOS, or Linux TCP stacks at the kernel level — defeating SYN-level WAF fingerprinting.",
      },
      {
        title: "HTTP/2 Stream Forging",
        desc: "Custom SETTINGS frames, window increments, and priority trees. Replicate how real browsers negotiate H2 connections — down to the byte.",
      },
      {
        title: "CDN-Specific Bypass Logic",
        desc: "Separate optimization engines for Cloudflare, Akamai, Imperva, and F5/AWS. Each CDN has unique detection surfaces — we counter them all.",
      },
      {
        title: "Global DNS Artillery",
        desc: "350+ geographically distributed DNS servers for multi-carrier resolution. Bypass DNS-level blocking with latency-aware load balancing across 4 strategies.",
      },
      {
        title: "AI WAF Architect",
        desc: "Built-in AI assistant with real-time fingerprint context injection. Ask complex bypass questions and get production-ready TypeScript code — instantly.",
      },
    ],
  },
  cdn: {
    section: "Target Platforms",
    title: ["Tested Against the", "Top 4 WAF Providers"],
    titleGradient: "from-purple-300 to-amber-300",
    items: [
      { name: "Cloudflare" },
      { name: "Akamai" },
      { name: "Imperva" },
      { name: "F5/AWS" },
    ],
    badge: "WAF BYPASS OPTIMIZED",
  },
  tech: {
    section: "Under the Hood",
    title: ["Built Like a", "Precision Instrument"],
    titleGradient: "from-cyan-300 to-teal-300",
    items: [
      {
        title: "Multi-Protocol Fallback Chain",
        desc: "H3 → H2 multiplexed → fetch (undici) → http2.connect → HTTP/1.1 keep-alive. Automatic graceful degradation with zero manual intervention.",
      },
      {
        title: "Real-Time Alignment Scoring",
        desc: "Live 0–100 score across 5+ fingerprint dimensions. Instant feedback on TTL/UA mismatch, GREASE state, H2 window alignment, and connection reuse — with actionable warnings.",
      },
      {
        title: "DNS Hijack & Hosts Override",
        desc: "Intercept domain resolution through custom upstreams with static hosts mapping and dual-stack A/AAAA parallel resolution. Multi-level caching: static → local JSON → in-memory → upstream → system.",
      },
    ],
  },
  layers: {
    section: "The Stack",
    title: ["7 Layers of", "Fingerprint Alignment"],
    titleGradient: "from-amber-300 to-rose-300",
    items: [
      { layer: "7", name: "Application", detail: "User-Agent, Accept headers" },
      { layer: "6", name: "HTTP/2 Stream", detail: "SETTINGS, WINDOW_UPDATE, PRIORITY" },
      { layer: "5", name: "TLS Handshake", detail: "JA3/JA4, ciphers, GREASE, ALPN" },
      { layer: "4", name: "TCP SYN", detail: "TTL, MSS, Window Scale, SACK, Timestamps" },
      { layer: "3", name: "IP Routing", detail: "TTL match, NIC telemetry" },
      { layer: "2", name: "DNS Resolution", detail: "Multi-carrier, load-balanced, cached" },
      { layer: "1", name: "Physical/Proxy", detail: "SOCKS/HTTP CONNECT tunnel" },
    ],
  },
  pricing: {
    section: "Pricing",
    title: "Simple, Transparent",
    popular: "MOST POPULAR",
    tiers: [
      {
        name: "Community",
        price: "Free",
        desc: "For individual developers and researchers",
        features: [
          "Single download mode",
          "14 browser TLS presets",
          "4 OS TCP presets",
          "Basic WAF bypass scoring",
          "NDJSON live console",
          "GitHub community support",
        ],
        cta: "Get Started",
      },
      {
        name: "Pro",
        price: "$49",
        period: "/month",
        desc: "For security engineers and pentesters",
        features: [
          "Everything in Community",
          "Batch download (unlimited)",
          "Global 350+ DNS resolver",
          "AI WAF Architect chat",
          "CDN-specific optimization",
          "IP geolocation enrichment",
          "Priority GitHub support",
        ],
        cta: "Start Pro",
      },
      {
        name: "Enterprise",
        price: "Custom",
        desc: "For teams and production environments",
        features: [
          "Everything in Pro",
          "Custom TLS preset creation",
          "Private DNS server pool",
          "API rate limit increase",
          "SSO & team management",
          "SLA guarantee",
          "Dedicated engineering support",
        ],
        cta: "Contact Sales",
      },
    ],
  },
  faq: {
    section: "FAQ",
    title: "Common Questions",
    items: [
      {
        q: "How is this different from just changing User-Agent?",
        a: "WAFs like Cloudflare and Imperva check 7+ fingerprint dimensions: JA3/JA4 TLS hash, cipher ordering, GREASE presence, H2 SETTINGS frame values, TCP TTL/MSS/Window scale, SYN option ordering, and DNS resolution patterns. Changing only User-Agent triggers detection on all other layers. Our platform aligns every dimension simultaneously.",
      },
      {
        q: "Does this work against all CDN WAFs?",
        a: "We have specialized optimization engines for Cloudflare, Akamai, Imperva/Incapsula, and F5/AWS Shield. Each engine understands the specific detection surfaces of that platform — from CF's JA3 blacklists to Akamai's TTL/UA mismatch checks to Imperva's cipher ordering analysis.",
      },
      {
        q: "Can I use this in production scraping infrastructure?",
        a: "Yes. The Pro tier includes batch download mode with NDJSON streaming for integration into existing pipelines. The engine exposes a POST API endpoint that can be called programmatically. Enterprise tier adds custom TLS presets and dedicated support for production deployment.",
      },
      {
        q: "Is the fingerprint alignment configurable?",
        a: "Every dimension is independently adjustable: browser TLS preset (14 options), TCP stack (4 OS presets + unlimited custom), TTL (32–255), MSS (1200–1500), Window Size (8K–256K), H2 Window Increment, GREASE toggle, DNS servers, load balancing strategy, and proxy configuration.",
      },
      {
        q: "Do I need to install anything?",
        a: "The interactive console runs entirely in your browser via our Next.js frontend. For programmatic access, you can self-host the Node.js server (open source on GitHub) or use our hosted API. No browser extensions or local agents required.",
      },
    ],
  },
  cta: {
    title: ["Ready to Make Your Traffic", "Invisible?"],
    titleGradient: "from-emerald-300 to-cyan-300",
    subtitle: "Join security engineers and researchers who use TCP/IP Aligner to test WAF boundaries, build undetectable scrapers, and research fingerprint obfuscation.",
    button: "Launch Console — Free",
  },
  footer: {
    tagline: "TCP/IP Aligner",
    license: "Open source · MIT License · 2026 Cyber Defense Lab",
    links: [
      { label: "GitHub", href: "https://github.com" },
      { label: "App", href: "/en" },
    ],
  },
  scrollerItems: [
    "JA3/JA4 Spoofing",
    "TCP/IP TTL Tuning",
    "HTTP/2 Frame Forging",
    "DNS Load Balancing",
    "CDN WAF Evasion",
    "GREASE Injection",
    "H2 Window Scaling",
    "SYN Option Matching",
  ],
};

export const zh: MarketingContent = {
  nav: {
    features: "功能",
    tech: "技术",
    pricing: "定价",
    faq: "常见问题",
    launchApp: "启动应用",
  },
  hero: {
    badge: "v4.0 — 下一代指纹引擎",
    headline: ["伪装成", "任意浏览器。", "任意系统。"],
    headlineGradient: "from-emerald-300 via-cyan-300 to-purple-400",
    headlineMuted: "任意系统。",
    subtitle: [
      "首个开源平台，将",
      "TLS 指纹",
      "TCP/IP SYN 参数",
      "HTTP/2 设置",
      "和",
      "DNS 路由",
      "对齐为单一、不可检测的浏览配置文件。",
    ],
    cta: "启动交互控制台",
    ctaSecondary: "探索功能",
  },
  metrics: [
    { label: "浏览器 TLS 预设", value: "14" },
    { label: "CDN 检测键", value: "4" },
    { label: "全局 DNS 节点", value: "350+" },
    { label: "对齐评分", value: "100", suffix: "/100" },
    { label: "协议层", value: "7" },
    { label: "绕过时间", value: "<1", suffix: "秒" },
  ],
  features: {
    section: "核心能力",
    title: ["你需要的一切", "消失在人群中"],
    titleGradient: "from-emerald-300 to-cyan-300",
    items: [
      {
        title: "JA3/JA4 TLS 欺骗",
        desc: "14 个浏览器级 TLS 预设，精确的密码套件排序、GREASE 注入和扩展复制。让你的握手与 Chrome、Firefox 或 Safari 无法区分。",
      },
      {
        title: "TCP/IP SYN 调优",
        desc: "按操作系统的 TTL/MSS/窗口缩放，正确的选项排序。在内核层面匹配 Windows、macOS 或 Linux TCP 栈——击败 SYN 级 WAF 指纹检测。",
      },
      {
        title: "HTTP/2 流伪造",
        desc: "自定义 SETTINGS 帧、窗口增量和优先级树。精确复现真实浏览器协商 H2 连接的方式——精确到字节。",
      },
      {
        title: "CDN 专属绕过逻辑",
        desc: "为 Cloudflare、Akamai、Imperva 和 F5/AWS 分别优化的绕过引擎。每个 CDN 都有独特的检测面——我们全部应对。",
      },
      {
        title: "全局 DNS 炮群",
        desc: "350+ 地理分布的 DNS 服务器实现多运营商解析。通过 4 种策略的延迟感知负载均衡绕过 DNS 级封锁。",
      },
      {
        title: "AI WAF 架构师",
        desc: "内置 AI 助手，实时注入指纹上下文。提出复杂的绕过问题，即时获得生产级 TypeScript 代码。",
      },
    ],
  },
  cdn: {
    section: "目标平台",
    title: ["经过测试的", "前 4 大 WAF 提供商"],
    titleGradient: "from-purple-300 to-amber-300",
    items: [
      { name: "Cloudflare" },
      { name: "Akamai" },
      { name: "Imperva" },
      { name: "F5/AWS" },
    ],
    badge: "WAF 绕过已优化",
  },
  tech: {
    section: "深入技术",
    title: ["打造如", "精密仪器"],
    titleGradient: "from-cyan-300 to-teal-300",
    items: [
      {
        title: "多协议回退链",
        desc: "H3 → H2 多路复用 → fetch (undici) → http2.connect → HTTP/1.1 长连接。自动优雅降级，无需人工干预。",
      },
      {
        title: "实时对齐评分",
        desc: "实时 0-100 分，覆盖 5+ 指纹维度。对 TTL/UA 不匹配、GREASE 状态、H2 窗口对齐和连接复用提供即时反馈及可操作警告。",
      },
      {
        title: "DNS 劫持与 Hosts 覆盖",
        desc: "通过自定义上游拦截域名解析，支持静态 hosts 映射和双栈 A/AAAA 并行解析。多级缓存：静态 → 本地 JSON → 内存 → 上游 → 系统。",
      },
    ],
  },
  layers: {
    section: "协议栈",
    title: ["7 层", "指纹对齐"],
    titleGradient: "from-amber-300 to-rose-300",
    items: [
      { layer: "7", name: "应用层", detail: "User-Agent、Accept 头" },
      { layer: "6", name: "HTTP/2 流", detail: "SETTINGS、WINDOW_UPDATE、PRIORITY" },
      { layer: "5", name: "TLS 握手", detail: "JA3/JA4、密码套件、GREASE、ALPN" },
      { layer: "4", name: "TCP SYN", detail: "TTL、MSS、窗口缩放、SACK、时间戳" },
      { layer: "3", name: "IP 路由", detail: "TTL 匹配、NIC 遥测" },
      { layer: "2", name: "DNS 解析", detail: "多运营商、负载均衡、缓存" },
      { layer: "1", name: "物理层/代理", detail: "SOCKS/HTTP CONNECT 隧道" },
    ],
  },
  pricing: {
    section: "定价",
    title: "简单透明",
    popular: "最受欢迎",
    tiers: [
      {
        name: "社区版",
        price: "免费",
        desc: "适合个人开发者和研究人员",
        features: [
          "单次下载模式",
          "14 个浏览器 TLS 预设",
          "4 个 OS TCP 预设",
          "基础 WAF 绕过评分",
          "NDJSON 实时控制台",
          "GitHub 社区支持",
        ],
        cta: "开始使用",
      },
      {
        name: "专业版",
        price: "$49",
        period: "/月",
        desc: "适合安全工程师和渗透测试人员",
        features: [
          "社区版所有功能",
          "批量下载（无限）",
          "全局 350+ DNS 解析器",
          "AI WAF 架构师聊天",
          "CDN 专属优化",
          "IP 地理位置增强",
          "优先 GitHub 支持",
        ],
        cta: "开始专业版",
      },
      {
        name: "企业版",
        price: "定制",
        desc: "适合团队和生产环境",
        features: [
          "专业版所有功能",
          "自定义 TLS 预设创建",
          "私有 DNS 服务器池",
          "API 速率限制提升",
          "SSO 与团队管理",
          "SLA 保障",
          "专属工程支持",
        ],
        cta: "联系销售",
      },
    ],
  },
  faq: {
    section: "常见问题",
    title: "常见问题",
    items: [
      {
        q: "这和只改 User-Agent 有什么不同？",
        a: "Cloudflare 和 Imperva 等 WAF 会检查 7+ 个指纹维度：JA3/JA4 TLS 哈希、密码套件排序、GREASE 存在性、H2 SETTINGS 帧值、TCP TTL/MSS/窗口缩放、SYN 选项排序和 DNS 解析模式。只改 User-Agent 会在所有其他层触发检测。我们的平台同时对齐每个维度。",
      },
      {
        q: "这对所有 CDN WAF 都有效吗？",
        a: "我们有针对 Cloudflare、Akamai、Imperva/Incapsula 和 F5/AWS Shield 的专属优化引擎。每个引擎都了解该平台的特定检测面——从 CF 的 JA3 黑名单到 Akamai 的 TTL/UA 不匹配检查，再到 Imperva 的密码套件排序分析。",
      },
      {
        q: "我可以在生产级爬虫架构中使用吗？",
        a: "可以。专业版包含批量下载模式，支持 NDJSON 流式集成到现有 pipeline。引擎公开了可编程调用的 POST API 端点。企业版增加了自定义 TLS 预设和生产部署专属支持。",
      },
      {
        q: "指纹对齐可以配置吗？",
        a: "每个维度都可独立调节：浏览器 TLS 预设（14 种）、TCP 栈（4 个 OS 预设 + 无限自定义）、TTL（32-255）、MSS（1200-1500）、窗口大小（8K-256K）、H2 窗口增量、GREASE 开关、DNS 服务器、负载均衡策略和代理配置。",
      },
      {
        q: "我需要安装任何东西吗？",
        a: "交互控制台完全在浏览器中运行（基于 Next.js 前端）。如需编程访问，你可以自托管 Node.js 服务器（GitHub 开源）或使用我们的托管 API。无需浏览器扩展或本地代理。",
      },
    ],
  },
  cta: {
    title: ["准备好让你的流量", "隐形了吗？"],
    titleGradient: "from-emerald-300 to-cyan-300",
    subtitle: "加入安全工程师和研究人员的行列，使用 TCP/IP Aligner 测试 WAF 边界、构建不可检测的爬虫、研究指纹混淆技术。",
    button: "启动控制台 — 免费",
  },
  footer: {
    tagline: "TCP/IP Aligner",
    license: "开源 · MIT 许可证 · 2026 网络防御实验室",
    links: [
      { label: "GitHub", href: "https://github.com" },
      { label: "应用", href: "/en" },
    ],
  },
  scrollerItems: [
    "JA3/JA4 欺骗",
    "TCP/IP TTL 调优",
    "HTTP/2 帧伪造",
    "DNS 负载均衡",
    "CDN WAF 绕过",
    "GREASE 注入",
    "H2 窗口缩放",
    "SYN 选项匹配",
  ],
};
