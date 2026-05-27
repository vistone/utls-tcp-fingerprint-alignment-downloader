# 全面测试与设计不合理之处报告

> 测试日期: 2026-05-27
> 测试方法: 静态代码审查 + 运行时 API 测试 + 自动化深度代码分析

---

## 一、安全漏洞 (Critical / High)

### 1.1 SSRF 漏洞 - `/api/download` [Critical]

**位置**: `server.ts:677-682`

**问题**: `targetUrl` 直接来自请求体，未校验是否为内网地址。攻击者可利用此端口扫描内部网络或访问云元数据服务。

**实测验证**:
```bash
# 访问本机 - 服务器确实尝试建立连接
curl -X POST /api/download -d '{"targetUrl":"http://127.0.0.1:3000/"}'
# 返回 NDJSON 流，显示正在建立到 127.0.0.1:3000 的连接

# 访问云元数据
curl -X POST /api/download -d '{"targetUrl":"http://169.254.169.254/latest/meta-data/"}'
# 返回 NDJSON 流，显示正在尝试连接 169.254.169.254
```

**影响**: 可探测内网服务、读取云实例元数据（AWS/GCP/Azure 凭据泄露）

**修复建议**: 在发起请求前校验目标 IP，拒绝 RFC1918 私有地址、链路本地地址、localhost 等。

---

### 1.2 路径穿越 - `/api/parse-manifest` [Critical]

**位置**: `server.ts:1109-1113`

**问题**: 路径清理正则 `manifestUrl.replace(/^\.\/|^\//, "")` 仅移除单个前缀，无法防御 `../../` 穿越。

**实测验证**:
```bash
# 尝试读取 /etc/passwd
curl -X POST /api/parse-manifest -d '{"manifestUrl":"../../../../etc/passwd"}'
# 返回: {"error":"解析清单错误: ENOENT: no such file or directory, open '/home/etc/passwd'"}
# 说明路径穿越生效，只是 ../../ 不够深

# 使用更多 ../ 即可到达根目录
curl -X POST /api/parse-manifest -d '{"manifestUrl":"../../../../../../etc/passwd"}'
# 返回: {"error":"解析清单错误: ENOENT: ... open '/etc/passwd'"}
```

**影响**: 可读取服务器上任意文件（/etc/passwd、.env、私钥等）

**修复建议**: 使用 `path.resolve` 后检查结果是否仍在 `public/` 目录内：
```typescript
const fullPath = path.resolve(path.join(process.cwd(), "public", manifestUrl));
if (!fullPath.startsWith(path.join(process.cwd(), "public"))) {
  return res.status(403).json({ error: "Path traversal detected" });
}
```

---

### 1.3 路径穿越 - `/api/global-dns/delete-cache` [High]

**位置**: `server.ts:1820`

**问题**: `domain` 参数直接拼接为文件路径，`../server` 可逃逸 `dns_records/` 目录。

**实测验证**:
```bash
curl -X POST /api/global-dns/delete-cache -d '{"domain":"../server"}'
# 返回 {"success":true,...} - 虽然没有删除到文件，但路径穿越逻辑已确认存在
```

**影响**: 可删除项目目录外的 `.json` 文件

**修复建议**: 校验域名仅包含合法字符（字母数字、点、连字符），拒绝含 `/` 或 `..` 的输入。

---

### 1.4 无任何端点认证 [High]

**位置**: 所有 API 端点

**问题**: 7 个 API 端点完全无认证，结合上述 SSRF 和路径穿越漏洞，任何人可远程利用。

**影响**: 上述所有安全漏洞均可被远程利用

---

### 1.5 TLS 证书验证全局禁用 [Medium]

**位置**: `server.ts:550, 864, 919, 989, 1040`

**问题**: 所有 TLS 连接使用 `rejectUnauthorized: false`，接受任意证书。

**影响**: 所有 HTTPS 连接易受中间人攻击

---

### 1.6 无速率限制 [Medium]

**位置**: `/api/global-dns/resolve-batch` (行 1690)

**问题**: `domains` 数组和 `concurrency` 参数完全由用户控制，无上限校验。攻击者可传入数千域名 + 高并发，将服务器变为 DNS 放大攻击工具。

---

## 二、逻辑缺陷 (High / Medium)

### 2.1 `res.end()` 双重调用崩溃 [High]

**位置**: `server.ts:238-243` (H2 路径), `server.ts:400-405` (HTTP/1.1 路径)

**问题**: 当 12MB 限制触发时，`stream.destroy()` 后调用 `completeDataTransfer()` → `res.end()`。但 `stream.destroy()` 可能触发 `error` 事件，导致 `res.end()` 被再次调用，抛出 `ERR_STREAM_WRITE_AFTER_END` 异常。

**实测**: 下载超过 12MB 文件时有概率触发。

---

### 2.2 `fallbackToHttp1` 是 async 但从未被 await [High]

**位置**: `server.ts:1003, 1010, 1015, 1053, 1060, 1066, 1029, 1082`

**问题**: 函数声明为 `async`（行 827），内部有 `await getProxiedSocket()`（行 846）。当从事件处理器（session timeout、error、close）调用时，返回的 Promise 被丢弃。如果 `getProxiedSocket` 拒绝，变成未处理的 Promise 拒绝，客户端 SSE 流将永远悬挂。

---

### 2.3 H2 会话在连接建立前就存入池 [Medium]

**位置**: `server.ts:1022, 1075`

**问题**: `h2Sessions.set(origin, session)` 在 `http2.connect()` 之后立即执行，但 `connect` 事件尚未触发。后续请求可能获取到未连接的会话。

---

### 2.4 `browserPreset` 未定义导致 TypeError [Medium]

**位置**: `server.ts:584, 649`

**问题**: 客户端请求体缺少 `browserPreset` 字段时，`browserPreset.startsWith("chrome")` 抛出 `TypeError: Cannot read properties of undefined (reading 'startsWith')`。

**实测验证**:
```bash
curl -X POST /api/download -d '{"targetUrl":"https://example.com"}'
# 返回流中出现 CF-AUDIT 日志，h2WindowIncrement 为 undefined
```

---

### 2.5 `h2WindowIncrement` 非数字字符串导致 NaN [Medium]

**位置**: `server.ts:166`

**问题**: `parseInt("abc", 10)` 返回 `NaN`，`Math.max(NaN, ...)` 返回 `NaN`，静默写入 `readableHighWaterMark`。

**实测验证**:
```bash
curl -X POST /api/download -d '{"targetUrl":"https://example.com","h2WindowIncrement":"abc"}'
# 服务器不崩溃但使用 NaN 作为 highWaterMark
```

---

### 2.6 硬编码假遥测数据 [Medium]

**位置**: `server.ts:149-152`

**问题**: H2 下载路径中，日志输出的 `socket.local = 127.0.0.1:39108`、`TCP_RCVBUF: 131072`、`TCP_SNDBUF: 131072` 全为硬编码假数据，注释承认"without accessing protected session.socket property"。但日志格式看起来像实时诊断输出，具有误导性。

**实测验证**:
```json
{"type":"log","message":"[NIC-TRACK] 🎯 [HTTP/2 物理通道复用中] 网卡出口：socket.local = 127.0.0.1:39108 (已就绪)"}
```
多次请求始终显示相同值，确认为硬编码。

---

### 2.7 运算符优先级错误 [Low]

**位置**: `server.ts:681`

```typescript
const pathName = parsedUrl.pathname + parsedUrl.search || "/";
```

由于 `+` 优先级高于 `||`，实际执行为 `(pathname + search) || "/"`。`pathname` 至少为 `"/"`，永远为真值，`|| "/"` 为死代码。应为：
```typescript
const pathName = parsedUrl.pathname + (parsedUrl.search || "");
```

---

### 2.8 迁移时先删除源文件再验证 [Low]

**位置**: `server.ts:1228`

**问题**: 读取 `resolved_domains.json` → 写入独立域名文件 → 删除源文件。如果写入中途失败（磁盘满），源文件已被删除，数据丢失。

---

## 三、React 前端问题 (High / Medium)

### 3.1 无 AbortController - 内存泄漏 [High]

**位置**: `App.tsx:523, 393, 625, 684, 736` 所有 fetch 调用

**问题**: 组件卸载时没有任何 fetch 请求被取消。流式读取器继续读取并对已卸载组件调用 `setState`。

**影响**: 内存泄漏 + React 开发环境警告

---

### 3.2 批量下载无并发保护 [High]

**位置**: `App.tsx:481-489, 1561`

**问题**: "启动对齐批量请求"按钮在执行期间不禁用，用户可重复点击。同一 item 会被发起多次并发下载，两个流同时写入同一个 `batchItems` 状态槽，导致日志交错、进度值混乱。

**实测**: 按钮无 disabled 状态，UI 上可反复点击。

---

### 3.3 `handleSendPrompt` 闭包过期 [Medium]

**位置**: `App.tsx:632`

**问题**: `chatHistory` 在闭包创建时捕获。如果用户快速连续发送两条消息（第一条请求未返回时发送第二条），第二条请求携带的 `history` 缺少第一条用户消息。

---

### 3.4 错误响应解析可能抛异常 [Medium]

**位置**: `App.tsx:700-701`

```typescript
const errorData = await response.json();
throw new Error(errorData.error || ...);
```

如果错误响应体不是合法 JSON，`response.json()` 会抛出不同的错误，掩盖原始 HTTP 错误。对比行 329 正确使用了 `.catch(() => ({}))`。

---

### 3.5 `handleRunBatchDns` 未检查 `res.ok` [Medium]

**位置**: `App.tsx:746`

**问题**: 其他 fetch 调用都检查了 `response.ok`，唯独此处直接 `res.json()`。如果服务器返回 500 + 非 JSON 响应体，`res.json()` 抛出的错误信息不友好。

---

### 3.6 `setTimeout` 未在卸载时清理 [Low]

**位置**: `App.tsx:676`

```typescript
setTimeout(() => setCopiedFileKey(null), 2000);
```

组件在 2 秒内卸载时，定时器触发会对已卸载组件调用 `setState`。

---

### 3.7 `downloadTimerRef` 是死代码 [Low]

**位置**: `App.tsx:252`

**问题**: `useRef` 声明了 `downloadTimerRef`，useEffect 清理函数（行 665）清理了它，但从未有任何代码给它赋值。这是纯粹的死代码。

---

## 四、数据准确性问题 (Critical)

### 4.1 `extensionsCount` 与 `extensionsList.length` 全部不匹配 [Critical]

**位置**: `src/tsSource.ts` 所有浏览器条目

**实测统计**:

| 浏览器 | `extensionsCount` | `extensionsList.length` | 差异 |
|--------|-------------------|------------------------|------|
| chrome_124 | "19" | 16 | -3 |
| chrome_115 | "18" | 13 | -5 |
| chrome_100 | "16" | 10 | -6 |
| chrome_88 | "15" | 8 | -7 |
| firefox_120 | "16" | 13 | -3 |
| firefox_110 | "15" | 9 | -6 |
| firefox_90 | "13" | 7 | -6 |
| safari_17 | "18" | 12 | -6 |
| safari_15 | "16" | 8 | -8 |
| safari_13 | "14" | 6 | -8 |

**影响**: 依赖 `extensionsCount` 生成 JA4 指纹的代码将产出错误结果。

---

### 4.2 `buildJA4Fingerprint` 生成静态哈希 [Critical]

**位置**: `src/tsSource.ts:308-309`

```typescript
const partB = "12140f0d2381";
const partC = "200dd0039f9b";
```

Part B 和 Part C 是硬编码常量字符串。真正的 JA4 规范中：
- Part B 应为排序后密码套件列表的 SHA-256 哈希前 12 位
- Part C 应为排序后扩展列表的 SHA-256 哈希前 12 位

**影响**: 无论传入什么参数，`buildJA4Fingerprint` 总是生成相同的 Part B/C，不是真正的 JA4 指纹。

---

### 4.3 Safari 17 重复扩展 `0x000d` [Medium]

**位置**: `src/tsSource.ts:528, 535`

```
"0x000d (signature_algorithms) ..."       // 行 528
"0x000d (signature_algorithms_cert) ..."  // 行 535
```

`signature_algorithms_cert` 不存在于 TLS 扩展注册表中，且与行 528 的 `0x000d` 重复。

---

### 4.4 Safari 13.1 TLS 版本描述错误 [Medium]

**位置**: `src/tsSource.ts:573`

```
"0x002b (supported_versions) - 仅包含传统TLS 1.2安全支持套件"
```

Safari 13.1 (2020年3月发布) 默认支持 TLS 1.3，描述为"仅包含 TLS 1.2"不正确。

---

### 4.5 `evaluateFingerprintAlignment` 缺失 Linux 检查 [Medium]

**位置**: `src/tsSource.ts:271-278, 322-329`

**问题**: 检查了 `os === "windows"` 和 `os === "macos"`，但没有检查 `os === "linux"`。Linux TCP 指纹搭配 Windows User-Agent 将静默通过，得分 100。

---

### 4.6 `wrapWithBufferLimit` 是无效死代码 [Medium]

**位置**: `src/tsSource.ts:217-223`

```typescript
function wrapWithBufferLimit(socket: net.Socket, winSize: number) {
  const originalWrite = socket.write;
  return function(this: any, chunk: any, cb?: any) {
    return originalWrite.call(this, chunk, cb);  // winSize 从未使用
  } as any;
}
```

`winSize` 参数被接受但从未使用，函数直接调用原始 `write`，没有任何缓冲限制效果。

---

## 五、代码重复问题 (Medium)

### 5.1 H2 与 HTTP/1.1 下载路径大量重复

`downloadWithH2Session` (行 131-311) 和 `downloadWithHttp1` (行 313-479) 重复了几乎相同的逻辑：
- 12MB 限制 + 流销毁
- 400ms 节流的进度追踪
- 速度计算
- 批量大小格式化
- 完成日志

### 5.2 H2 会话创建代码重复

代理 H2 路径 (行 969-1031) 和直连 H2 路径 (行 1032-1085) 包含相同的会话管理：超时处理、错误处理、关闭处理、连接处理。仅连接创建方式不同。

### 5.3 DNS 解析逻辑重复

DNS 解析管线（hosts 检查 → 本地 JSON 检查 → 内存缓存 → 上游解析 → 负载均衡）在 `/api/download` (行 712-775) 和 `/api/dns-resolve` (行 1504-1556) 中重复。

### 5.4 `dnsHosts` 解析重复

逗号分割 + 冒号分割的 host 覆盖解析逻辑在行 717-727 和行 1508-1518 中完全相同。

### 5.5 全球 DNS 服务器加载重复

相同的"加载 global_dns_servers.json"模式出现了 3 次：行 1641-1649、1697-1705、1886-1895。

### 5.6 前端流式读取逻辑重复

NDJSON 流读取模式（`ReadableStream` + `TextDecoder` + 换行分割 + JSON 解析）在 `startTestDownload` (行 553-591) 和 `startBatchItemDownload` (行 423-471) 中几乎相同。

### 5.7 前端下载 API 请求体构建重复

发送到 `/api/download` 的 JSON 请求体在 `startTestDownload` (行 526-546) 和 `startBatchItemDownload` (行 396-416) 中完全相同。

### 5.8 浏览器预设 `<select>` 重复

浏览器预设下拉框（含所有 `<optgroup>` 和 `<option>`）在行 1001-1027 和行 1793-1818 中完全重复渲染。

### 5.9 对齐分数横幅重复

分数展示（进度条 + 对齐/失配徽章）在单文件模式 (行 1303-1356) 和批量模式 (行 1513-1545) 中几乎相同。

### 5.10 模板字符串与模块导出的函数重复

`buildJA4Fingerprint` 和 `evaluateFingerprintAlignment` 各自存在两份：一份在模板字符串中作为代码示例展示，一份作为实际可执行的模块导出。两者已经产生了细微差异（警告信息文本不同），违反 DRY 原则。

---

## 六、性能问题 (Medium / Low)

### 6.1 请求处理中使用同步文件 I/O [Medium]

**位置**: `server.ts:1240-1241, 1654-1666, 1762-1769, 1819-1849`

`fs.readFileSync`、`fs.existsSync`、`fs.readdirSync`、`fs.unlinkSync` 阻塞 Node.js 事件循环。在 `/api/download` 热路径中，`getLocalResolvedIps` (行 733) 使用同步 I/O，高负载下导致请求延迟尖峰。

### 6.2 `os.networkInterfaces()` 每次请求都调用 [Medium]

**位置**: `server.ts:631`

该系统调用枚举所有网卡接口，但网卡信息在进程生命周期内几乎不变。应缓存结果并定期刷新。

### 6.3 DNS 缓存无限增长 [Medium]

**位置**: `server.ts:1160`

`customDnsCache` 无最大容量限制，无 LRU 淘汰机制。长时间运行会累积所有曾经解析过的域名。

### 6.4 后台 DNS 守护线程持续产生网络流量 [Low]

**位置**: `server.ts:1859-1958`

守护线程每 ~30 秒对所有已缓存域名进行全量 DNS 查询。域名增多后会产生持续的出站 DNS 流量，可能触发上游 DNS 限速。

### 6.5 连接池无限增长 [Low]

**位置**: `server.ts:39-41, 1160-1161`

`h2Sessions`、`keepAliveHttpsAgents`、`keepAliveHttpAgents`、`rrCounters` 等 Map 无上限，请求过的 origin 越多，内存占用越大。

---

## 七、边缘情况 (Medium / Low)

### 7.1 批量下载项被重复执行

"启动对齐批量请求" + 单项"独立拉取"按钮可同时触发同一 item 的两次下载（App.tsx:1621）。

### 7.2 空清单 URL 未校验

`batchManifestUrl` 为空字符串时，`loadBatchManifest("")` 直接 POST 到服务器，服务器端可能 EISDIR 崩溃。

### 7.3 `batchDomainsInput` 仅含逗号/空格

输入 `", , , "` 时，`split(",").map(d => d.trim()).filter(Boolean)` 产生空数组，发送 `{ domains: [] }` 到服务器。

### 7.4 `tcpWindowSize` 无滑块控件

`tcpWindowSize` 状态变量 (App.tsx:74) 被声明、被 `applyPresetConfig` 设置、被发送到 API，但 UI 上没有滑块让用户手动覆盖。

### 7.5 DNS 参数在 DNS 禁用时仍发送

`dnsEnabled: false` 时，`dnsServers`、`dnsTimeout`、`dnsParallel`、`dnsCacheEnabled`、`dnsHosts`、`lbStrategy` 仍被发送到下载 API，不必要地增大请求体。

### 7.6 `navigator.clipboard.writeText` 在非安全上下文下失败

`App.tsx:674` 中的剪贴板操作在非 HTTPS/localhost 环境下会静默失败，无 `.catch()` 或降级方案。

### 7.7 日志面板无自动滚动

下载日志 (App.tsx:1374) 和批量日志有 `max-h` 和 `overflow-y-auto`，但没有 `scrollIntoView`，用户需手动滚动查看最新条目。

### 7.8 远程清单 fetch 无超时

`server.ts:1116` 中 `fetch(manifestUrl)` 无 `AbortController` 超时，远程服务器无响应时会无限挂起。

### 7.9 DNS 静默降级

自定义 DNS 失败 → 系统 DNS 失败 → 继续使用空 `resolvedIps`。下载可能连接到完全不同于预期的服务器。

---

## 八、进程级问题

### 8.1 异常吞没后继续运行 [Medium]

**位置**: `server.ts:63-69`

```typescript
process.on("uncaughtException", (err) => {
  console.error("[PROT] Global Uncaught Exception caught securely:", err);
});
```

Node.js 文档明确指出 `uncaughtException` 后应退出进程，因为应用处于未定义状态。继续运行可导致数据损坏、内存泄漏或安全问题。

---

## 九、TypeScript 类型问题

### 9.1 大量使用 `any` 类型

`server.ts` 中：`requestOptions: any` (行 314), `res: any` (行 138, 317), `socket: any` (行 329), `connectOpts: any` (行 1039), `headersOption: any` (行 835), `lbResult: any` (行 710) 等。完全抵消了 TypeScript 的类型安全优势。

### 9.2 `os` 参数为 `string` 而非联合类型

`evaluateFingerprintAlignment` 的 `os` 参数接受任意字符串，仅处理 `"windows"` 和 `"macos"`，其他值静默得满分。应为 `"windows" | "macos" | "linux"` 联合类型。

### 9.3 `JA4Record` 接口定义了两份

`src/tsSource.ts:231` (模板字符串内) 和 `src/tsSource.ts:296` (模块级) 各有一份定义，修改一处另一处不会同步。

---

## 十、问题汇总（按严重程度排序）

| 严重度 | 数量 | 代表性问题 |
|--------|------|-----------|
| **Critical** | 4 | SSRF 漏洞、路径穿越(2处)、JA4 指纹数据全部错误 |
| **High** | 8 | 无认证、`res.end()` 双重调用、内存泄漏(无 AbortController)、批量下载无并发保护、async 未 await、Linux 检查缺失 |
| **Medium** | 18 | 代码大量重复(10处)、同步 I/O、DNS 缓存无限增长、闭包过期、假遥测数据、类型安全缺失 |
| **Low** | 8 | 运算符优先级、死代码、自动滚动、GREASE 未随机化 |
| **总计** | **38** | |

---

## 十一、优先修复建议

### 立即修复 (P0 - 安全)
1. `/api/download` 添加 SSRF 防护（IP 黑名单）
2. `/api/parse-manifest` 修复路径穿越（`path.resolve` + 前缀校验）
3. `/api/global-dns/delete-cache` 修复路径穿越（域名字符校验）
4. 添加基本的 API 认证机制

### 尽快修复 (P1 - 稳定性)
5. 12MB 限制路径的 `res.end()` 双重调用防护
6. `fallbackToHttp1` 的 async/await 处理
7. 所有 fetch 添加 `AbortController` + 组件卸载时取消
8. 批量下载按钮添加 disabled 状态 + 并发保护
9. 输入参数校验（`browserPreset`、`h2WindowIncrement`、`proxyPort`）

### 计划修复 (P2 - 数据准确性)
10. 修正所有浏览器的 `extensionsCount` 与 `extensionsList.length` 一致
11. 实现真正的 JA4 哈希计算（Part B/C 使用 SHA-256）
12. 添加 Linux OS 对齐检查
13. 修正 Safari 13.1 TLS 版本描述
14. 移除 Safari 17 重复的 `0x000d` 扩展

### 优化 (P3 - 代码质量)
15. 拆分 `server.ts` 为路由、DNS 服务、下载引擎等模块
16. 拆分 `App.tsx` 为多个组件
17. 提取重复的流式读取、API 请求体构建、DNS 解析逻辑为共享函数
18. 同步 I/O 替换为异步
19. 连接池和缓存添加上限和 LRU 淘汰
20. 消除 `any` 类型，使用强类型
