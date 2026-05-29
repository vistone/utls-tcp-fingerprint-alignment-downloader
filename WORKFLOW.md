# 完整工作流图

> uTLS/TCP Fingerprint Alignment Downloader v1.0.7

---

## 1. 核心下载工作流

```mermaid
flowchart TD
    Start(["用户点击下载"])

    subgraph Config["⚙️ 配置层"]
        URL["URL 目标地址"]
        CDN["CDN 类型<br/>Cloudflare / Akamai / Imperva / F5"]
        Browser["浏览器预设<br/>Chrome124/115/100/88<br/>Firefox120/110/90<br/>Safari17/15/13.1<br/>Python / curl"]
        TCP["TCP/IP 参数<br/>TTL / MSS / Window<br/>OS 预设"]
        Conn["连接选项<br/>复用 / 代理隧道 / gRPC"]
        DNS["DNS 配置<br/>服务器 / 超时 / 模式 / 策略"]
    end

    subgraph CDNOpt["🔧 CDN 自动优化引擎"]
        CloudflareOpt["Cloudflare:<br/>强制 H2 + window=6291456<br/>过滤 ECDHE-RSA/DHE 密码"]
        AkamaiOpt["Akamai:<br/>按 OS 自动修正 TTL/MSS<br/>强制 Keep-Alive"]
        ImpervaOpt["Imperva:<br/>Python→Chrome 升级<br/>重排密码套件顺序"]
        F5Opt["F5/AWS:<br/>强制连接复用<br/>并发 >8 警告"]
    end

    subgraph DNSResolve["🌐 DNS 解析管线"]
        HostsCheck{"hosts 静态映射?"}
        CacheCheck{"JSON 缓存命中?"}
        MemCacheCheck{"内存缓存 TTL<60s?"}
        CustomDNS["自定义上游 DNS 查询"]
        ParaMode["并行: 所有服务器同时查<br/>最先响应胜出"]
        SerialMode["串行: 逐服务器尝试"]
        SysFallback["系统 DNS 兜底"]
        LB["负载均衡<br/>最快 / 轮询 / 随机 / 优先级"]
    end

    subgraph DownloadEngine["📥 下载管线 (NDJSON 流)"]
        FetchHTTP3["HTTP/3 (QUIC) 🚀"]
        FetchHTTP3Fail{"失败?"}
        FetchDirect["undici fetch (H2)"]
        FetchDirectFail{"失败?"}
        H2PoolCheck{"H2 会话池命中?"}
        H2Session["复用 H2 会话池"]
        H2Direct["直接 http2.connect"]
        H2Proxy["代理 CONNECT 隧道<br/>→ TLS 升级 → H2 握手"]
        H2Fail{"失败?"}
        H1Direct["HTTP/1.1 Keep-Alive 池"]
        H1Proxy["代理 CONNECT 隧道<br/>→ HTTP/1.1 请求"]
        Progress["实时流推送:<br/>日志 / 进度 / 速度<br/>TLS 信息 / NIC 信息"]
    end

    subgraph Complete["✅ 完成"]
        GRPCCheck{"gRPC 存储启用?"}
        PushFile["PushFile → Storage Server"]
        Done["下载完成"]
    end

    Start --> Config
    Config --> CDNOpt

    CDNOpt --> URL

    URL --> CDN
    CDN --> CloudflareOpt
    CDN --> AkamaiOpt
    CDN --> ImpervaOpt
    CDN --> F5Opt

    CloudflareOpt --> DNS
    AkamaiOpt --> DNS
    ImpervaOpt --> DNS
    F5Opt --> DNS

    DNS --> HostsCheck
    HostsCheck -->|是| CacheCheck
    HostsCheck -->|否| CacheCheck

    CacheCheck -->|是| MemCacheCheck
    CacheCheck -->|否| CustomDNS

    MemCacheCheck -->|是| LB
    MemCacheCheck -->|否| CustomDNS

    CustomDNS --> ParaMode
    CustomDNS --> SerialMode
    ParaMode --> SysFallback
    SerialMode --> SysFallback
    SysFallback --> LB

    LB --> DownloadEngine

    DownloadEngine --> FetchHTTP3
    FetchHTTP3 --> FetchHTTP3Fail
    FetchHTTP3Fail -->|否| Progress
    FetchHTTP3Fail -->|是| FetchDirect

    FetchDirect --> FetchDirectFail
    FetchDirectFail -->|否| Progress
    FetchDirectFail -->|是| H2PoolCheck

    H2PoolCheck -->|是| H2Session
    H2PoolCheck -->|否| H2Proxy

    H2Session --> Progress
    H2Proxy --> H2Direct

    H2Direct --> H2Fail
    H2Fail -->|否| Progress
    H2Fail -->|是| H1Proxy
    H2Fail -->|是| H1Direct

    H1Proxy --> Progress
    H1Direct --> Progress

    Progress --> GRPCCheck
    GRPCCheck -->|是| PushFile
    GRPCCheck -->|否| Done
    PushFile --> Done
```

---

## 2. JA3/JA4 指纹分析工作流

```mermaid
flowchart LR
    Preset["浏览器预设选择"] --> Extract["提取 TLS 指纹特征"]
    Extract --> Cipher["密码套件列表 & 数量"]
    Extract --> Extensions["TLS 扩展列表 & 数量"]
    Extract --> ALPN["ALPN 协议列表"]
    Extract --> SNI["SNI 信息"]
    Extract --> JA3["JA3 哈希值"]

    Cipher --> BuildJA4["构建 JA4 指纹<br/>t[协议][版本][密码][扩展][ALPN]"]
    Extensions --> BuildJA4
    ALPN --> BuildJA4
    SNI --> BuildJA4
    JA3 --> BuildJA4

    BuildJA4 --> Eval["对齐评分引擎 (0-100)"]
    Eval --> Score["输出评分"]
    Score --> Badge{"评分 > 70?"}
    Badge -->|是| Good["🟢 WAF Aligned"]
    Badge -->|否| Bad["🔴 High Risk"]
```

---

## 3. DNS 诊断工作流

```mermaid
flowchart TD
    subgraph SingleDNS["Tab A: 单域名诊断"]
        S_Input["输入域名<br/>或点击快速选择 (google/github/cloudflare/...)"]
        S_Resolve["DNS 查询<br/>并行/串行自定义服务器"]
        S_Geo["IP 地理信息增强<br/>ipinfo.io (城市/国家/ASN/ISP)"]
        S_Map["延迟地图 + 决策树日志"]
        S_Result["显示 IP 属地 / 延迟 / 路径"]
    end

    subgraph BatchDNS["Tab B: 全局批量 DNS"]
        B_Input["批量输入域名<br/>支持多行文本"]
        B_Resolve["跨 350+ 全球服务器并行解析"]
        B_Dedup["去重 + IP 信息增强"]
        B_Cache["缓存数据库查看"]
        B_Result["每域名缓存详情"]
    end

    subgraph PoolMgr["Tab C: 服务器池管理"]
        P_Servers["global_dns_servers.json<br/>350+ DNS 服务器"]
        P_Status["缓存状态总览"]
        P_Delete["按域名 或 全部 删除缓存"]
    end
```

---

## 4. AI 专家聊天工作流

```mermaid
sequenceDiagram
    actor User as 用户
    participant UI as 聊天界面
    participant API as /api/archiver
    participant MiMo as 小米 MiMo API

    User->>UI: 输入问题（指纹/绕过策略等）
    UI->>UI: 自动注入上下文<br/>(当前预设/JA4/IP/TCP参数)
    UI->>API: POST 请求
    API->>API: 构建 system prompt<br/>含指纹信息
    API->>MiMo: 调用 mimo-v2.5-pro
    MiMo-->>API: 返回 AI 分析
    API-->>UI: 流式响应
    UI-->>User: 显示 AI 建议
```

---

## 5. gRPC 分布式工作流

```mermaid
flowchart TD
    subgraph Hub["gRPC Download Hub (端口 50051)"]
        Registry["设备注册表"]
        Heartbeat["心跳监控 (25s 间隔)"]
        Cleanup["超时自动清理 (3×timeout)"]
        DownloadTask["下载任务执行"]
        SSRFCheck["SSRF 验证"]
        Push["PushFile 推送"]
    end

    subgraph Clients["客户端"]
        CLI["CLI Task Client<br/>client/"]
        Web["Web TaskClient 标签页"]
    end

    subgraph Storage["存储服务器"]
        S_Register["注册到 Hub"]
        S_Heartbeat["心跳维持"]
        S_Receive["接收 PushFile"]
        KV["文件 KV 数据库<br/>index.json + .file"]
        WebAPI["Web API 文件服务<br/>列表/下载/统计"]
    end

    CLI -->|RegisterTaskClient| Hub
    CLI -->|Heartbeat| Hub
    CLI -->|SubmitDownload| Hub

    Web -->|RegisterTaskClient| Hub
    Web -->|SubmitDownload| Hub

    Hub --> Registry
    Hub --> Heartbeat
    Heartbeat --> Cleanup

    CLI -->|流式接收进度| Hub
    Web -->|流式接收进度| Hub

    Hub --> DownloadTask
    DownloadTask --> SSRFCheck
    DownloadTask --> Push

    Storage -->|RegisterStorageServer| Hub
    Storage -->|Heartbeat| Hub
    Push -->|PushFile gRPC| Storage
    Storage --> KV
```

```mermaid
sequenceDiagram
    participant Client as Task Client
    participant Hub as Download Hub
    participant Target as 目标服务器
    participant Storage as Storage Server

    Client->>Hub: RegisterTaskClient
    Hub-->>Client: OK

    loop 每 25s
        Client->>Hub: Heartbeat
        Storage->>Hub: Heartbeat
    end

    Client->>Hub: SubmitDownload(url, storage_target)
    Hub->>Hub: SSRF 验证
    Hub->>Target: HTTP 下载
    Target-->>Hub: 文件数据
    loop 流式推送
        Hub-->>Client: 进度/状态事件
    end
    Hub->>Storage: PushFile(file_data)
    Storage-->>Hub: ACK
    Hub-->>Client: DownloadComplete
```

---

## 6. 批量下载工作流

```mermaid
flowchart TD
    Load["加载 JSON 清单"]
    Load --> Check{"来源类型"}
    Check -->|本地路径| Local["path.resolve + 前缀检查<br/>防止路径穿越"]
    Check -->|远程 URL| Remote["fetch + 验证"]
    Local --> Extract["递归提取所有 URL"]
    Remote --> Extract
    Extract --> Display["显示在批量列表"]

    Execute["点击 全部运行"]
    Display --> Execute
    Execute --> Parallel["并行启动所有下载"]

    Parallel --> Item1["项目 1"]
    Parallel --> Item2["项目 2"]
    Parallel --> Item3["项目 N..."]

    Item1 --> Status1["状态卡片<br/>等待/下载中/完成/失败"]
    Item2 --> Status2["状态卡片"]
    Item3 --> Status3["状态卡片"]

    Status1 --> Log1["实时日志 / 进度条"]
    Status2 --> Log2
    Status3 --> Log3

    Log1 --> ReDL1["可逐项重新下载"]
    Log2 --> ReDL2
    Log3 --> ReDL3
```

---

## 7. API 路由总览

```mermaid
graph LR
    Client["浏览器 / 客户端"] --> API

    subgraph API["Next.js API Routes"]
        DL["POST /api/download<br/>核心下载引擎 (NDJSON 流)"]
        ARC["POST /api/archiver<br/>AI 聊天代理 (MiMo)"]
        DNS["POST /api/dns-resolve<br/>单域名 DNS 解析"]
        MF["POST /api/parse-manifest<br/>JSON 清单解析"]
        IP["POST /api/ip-info<br/>批量 IP 地理信息"]
        GS["GET /api/global-dns/status<br/>全局 DNS 缓存状态"]
        GR["POST /api/global-dns/resolve-batch<br/>批量 DNS 解析"]
        GD["POST /api/global-dns/delete-cache<br/>删除 DNS 缓存"]
        GSD["POST /api/grpc/submit-download<br/>gRPC 提交下载"]
        GC["GET /api/grpc/clients<br/>gRPC 设备管理"]
        GST["POST /api/grpc/storage<br/>gRPC 存储服务器管理"]
    end

    subgraph Security["🛡️ 安全层"]
        SSRF["SSRF 防护<br/>私有 IP 阻断"]
        AUTH["API 认证<br/>Bearer / X-API-Key"]
    end

    DL --> SSRF
    ARC --> AUTH
    DNS --> SSRF
    MF --> SSRF
    GS --> AUTH
    GR --> SSRF
    GD --> AUTH
    GSD --> SSRF
    GSD --> AUTH
    GC --> AUTH
    GST --> AUTH
```

---

## 8. 用户界面导航结构

```mermaid
graph TD
    Home["/ 营销落地页"] --> App["/[locale]/ 主应用"]

    App --> Header["顶部栏<br/>WAF引擎/JA4状态/OS指示<br/>单批模式切换/语言切换"]

    App --> Tabs["7 个标签页"]

    Tabs --> Tab1["① Aligned Downloader<br/>下载器"]
    Tabs --> Tab2["② JA3/JA4 Spec<br/>指纹规范"]
    Tabs --> Tab3["③ TCP/IP Stack<br/>TCP 对齐"]
    Tabs --> Tab4["④ DNS Resolver<br/>DNS 诊断"]
    Tabs --> Tab5["⑤ AI Expert<br/>AI 专家"]
    Tabs --> Tab6["⑥ Devices<br/>gRPC 设备"]
    Tabs --> Tab7["⑦ Client<br/>任务客户端"]

    Tab1 --> LeftPanel["左栏: 指纹配置"]
    Tab1 --> RightPanel["右栏: 下载终端"]

    Tab2 --> FPSpec["指纹预览面板<br/>JA4 / TLS / H2 / TCP / UA"]

    Tab4 --> SubTabs["3 个子标签"]
    SubTabs --> ST1["Diagnostic 单域名"]
    SubTabs --> ST2["Global Batch 全局批量"]
    SubTabs --> ST3["Server Pool 服务器池"]

    Tab5 --> Chat["聊天界面 + 快速提示"]

    Tab6 --> DevMgr["设备管理 + 过滤标签"]

    Tab7 --> TaskClient["Hub 连接 + 任务提交"]
```
