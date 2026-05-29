# Go Sidecar - Real TCP/TLS Fingerprint Control Engine

## 概述

Go Sidecar 是一个独立的 gRPC 服务，提供真正的 TCP SYN 指纹修改和 TLS ClientHello 指纹控制能力。

与纯 Node.js 实现的"模拟"不同，这个 sidecar：

1. **TCP SYN 指纹（真实修改）** — 使用 gvisor/netstack 用户态 TCP 栈，完全控制 TCP SYN 包中的：
   - TTL（IP 头）
   - MSS（TCP 选项）
   - Window Scale（TCP 选项）
   - SACK Permitted（TCP 选项）
   - Timestamps（TCP 选项）

2. **TLS ClientHello 指纹（真实模拟）** — 使用 uTLS Go 库，逐字节模拟浏览器 TLS 握手：
   - Chrome 124/115/100/88
   - Firefox 120/110/90
   - Safari 17/15/13.1
   - curl / Python

3. **IP 隐藏** — 支持 SOCKS5 代理池 + HTTP CONNECT 代理 + 多出口节点轮换

## 架构

```
Node.js Next.js (API Route)
       |
       | gRPC (protobuf)
       v
Go Sidecar (port 50053)
       |
       |--- gvisor/netstack (用户态 TCP 栈 - 自定义 SYN 包)
       |--- uTLS (逐字节浏览器 TLS 握手)
       |--- SOCKS5 代理池 (IP 隐藏 / 出口轮换)
       |
       v
远程目标服务器
```

## 构建

```bash
cd sidecar
make
```

## 运行

```bash
# 需要 root 或 CAP_NET_RAW 权限（用于原始 socket）
sudo ./bin/sidecar --port 50053

# 或者设置 capabilities（推荐）
sudo setcap cap_net_raw+ep ./bin/sidecar
./bin/sidecar --port 50053
```

## 验证 TCP SYN 包真的被修改了

```bash
# 方法 1: tcpdump 抓包验证
sudo tcpdump -i any 'tcp[tcpflags] & tcp-syn != 0' -X

# 方法 2: 在 sidecar 日志中查看 [TCP-SYN-REAL] 信息
```

## gRPC 接口

见 `proto/sidecar.proto`

- `Download(DownloadRequest) returns (stream DownloadEvent)` — 执行带指纹控制的下载
- `Ping(PingRequest) returns (PingResponse)` — 健康检查
- `GetPresets(Empty) returns (PresetList)` — 获取浏览器预设列表

## 依赖

- Go 1.22+
- gvisor.dev/gvisor (用户态 TCP 栈)
- github.com/refraction-networking/utls (TLS 指纹)
- google.golang.org/grpc (gRPC)
