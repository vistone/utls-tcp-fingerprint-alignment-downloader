package downloader

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/tcp-fingerprint/sidecar/pkg/cdn"
	"github.com/tcp-fingerprint/sidecar/pkg/proxy"
	"github.com/tcp-fingerprint/sidecar/pkg/tcpstack"
	"github.com/tcp-fingerprint/sidecar/pkg/tlsfingerprint"
)

// DownloadConfig 下载配置
type DownloadConfig struct {
	TargetURL, BrowserPreset, UserAgent string
	EnableGrease                        bool
	H2WindowInc                         int
	TCPFingerprint                      *tcpstack.TCPFingerprintConfig
	ProxyMode                           proxy.ProxyMode
	ProxyNodes                          []*proxy.ProxyNode
	RotationStrategy                    string
	ConnectTimeout, ReadTimeout         time.Duration
	CDNType                             string
}

// DownloadResult 下载结果
type DownloadResult struct {
	StatusCode              int
	Headers                 http.Header
	Body                    io.ReadCloser
	ContentLen              int64
	TLSInfo                 *tlsfingerprint.TLSDialResult
	TCPInfo                 *tcpstack.TCPInfo
	SourceIP, ProxyUsed     string
	Duration                time.Duration
}

// DownloadEvent 下载事件（NDJSON 流推送）
type DownloadEvent struct {
	Type, Message string
	Data          interface{}
}

// EventCallback 事件回调
type EventCallback func(event DownloadEvent)

// ExecuteDownload 执行带完整指纹控制的下载
//
// 架构：
//   CDN 优化引擎 → 生成真实 TCP/TLS 参数
//   → setsockopt(TTL) + iptables(MSS) + sysctl(SACK/TS/WS)
//   → uTLS 浏览器级 TLS 握手
//   → HTTP/1.1 请求
//   → 返回结果
func ExecuteDownload(config *DownloadConfig, callback EventCallback) (*DownloadResult, error) {
	parsedURL, _ := url.Parse(config.TargetURL)
	host := parsedURL.Hostname()
	port := parsedURL.Port()
	if port == "" {
		if parsedURL.Scheme == "https" { port = "443" } else { port = "80" }
	}
	pPort := 443
	fmt.Sscanf(port, "%d", &pPort)

	// ===== CDN 优化引擎 =====
	effectivePreset := config.BrowserPreset
	effectiveTCP := config.TCPFingerprint
	effectiveGrease := config.EnableGrease
	effectiveALPN := []string{"http/1.1"}

	if config.CDNType != "" {
		cdnCfg := cdn.Optimize(cdn.CDNType(config.CDNType), config.BrowserPreset, config.UserAgent)
		callback(DownloadEvent{Type: "log", Message: fmt.Sprintf("[CDN] %s 优化引擎已启用", config.CDNType)})

		if cdnCfg.BrowserPreset != config.BrowserPreset {
			callback(DownloadEvent{Type: "log", Message: fmt.Sprintf("[CDN] 浏览器: %s → %s", config.BrowserPreset, cdnCfg.BrowserPreset)})
			effectivePreset = cdnCfg.BrowserPreset
		}

		effectiveGrease = cdnCfg.GREASE

		if cdnCfg.TCPFingerprint != nil {
			t := cdnCfg.TCPFingerprint
			callback(DownloadEvent{Type: "log", Message: fmt.Sprintf("[CDN-TCP] TTL=%d | MSS=%d | WScale=%d | SACK=%v | TS=%v | Win=%d",
				t.TTL, t.MSS, t.WindowScale, t.SACK, t.Timestamps, t.WindowSize)})
			effectiveTCP = &tcpstack.TCPFingerprintConfig{
				TTL: t.TTL, MSS: t.MSS, WindowScale: t.WindowScale,
				SACK: t.SACK, Timestamps: t.Timestamps, WindowSize: t.WindowSize,
			}
		}

		for _, w := range cdnCfg.Warnings {
			callback(DownloadEvent{Type: "log", Message: "[CDN-WARN] " + w})
		}
	}

	// ===== DNS 解析 =====
	remoteIP := net.ParseIP(host)
	if remoteIP == nil {
		callback(DownloadEvent{Type: "log", Message: fmt.Sprintf("[DNS] Resolving %s...", host)})
		ips, err := net.LookupHost(host)
		if err != nil || len(ips) == 0 {
			return nil, fmt.Errorf("DNS lookup failed for %s: %w", host, err)
		}
		remoteIP = net.ParseIP(ips[0])
		callback(DownloadEvent{Type: "log", Message: fmt.Sprintf("[DNS] Resolved: %s → %s", host, remoteIP)})
	}

	start := time.Now()
	var tcpConn net.Conn
	var tcpInfo *tcpstack.TCPInfo
	var sourceIP, proxyUsed string

	// ===== TCP 连接 =====
	if config.ProxyMode != proxy.ModeDirect && len(config.ProxyNodes) > 0 {
		// 代理模式
		pool := proxy.NewProxyPool(config.RotationStrategy)
		for _, n := range config.ProxyNodes { pool.AddNode(n) }
		node := pool.SelectNode()
		proxyUsed = fmt.Sprintf("%s:%d", node.Host, node.Port)
		callback(DownloadEvent{Type: "log", Message: fmt.Sprintf("[PROXY] %s (%s)", proxyUsed, node.Region)})

		switch config.ProxyMode {
		case proxy.ModeSOCKS5:
			tcpConn, _ = (&proxy.SOCKS5Dialer{}).DialSOCKS5(node, host, pPort, config.ConnectTimeout)
		case proxy.ModeHTTPConnect:
			tcpConn, _ = dialHTTPConnect(node, host, port, config.ConnectTimeout)
		}
		if tcpConn == nil { return nil, fmt.Errorf("proxy dial failed") }
		tcpInfo = &tcpstack.TCPInfo{SourceIP: tcpConn.LocalAddr().(*net.TCPAddr).IP.String(), DestIP: host}
		sourceIP = tcpInfo.SourceIP
		callback(DownloadEvent{Type: "tcp_info", Data: tcpInfo})

	} else if effectiveTCP != nil {
		// 自定义 TCP 指纹模式
		callback(DownloadEvent{Type: "log", Message: fmt.Sprintf("[TCP] TTL=%d | MSS=%d | WScale=%d | SACK=%v | TS=%v",
			effectiveTCP.TTL, effectiveTCP.MSS, effectiveTCP.WindowScale,
			effectiveTCP.SACK, effectiveTCP.Timestamps)})

		dialer, err := tcpstack.NewTCPDialer(effectiveTCP)
		if err != nil { return nil, fmt.Errorf("TCP dialer: %w", err) }
		defer dialer.Close()

		conn, info, err := dialer.Dial(remoteIP, pPort, config.ConnectTimeout)
		if err != nil { return nil, fmt.Errorf("TCP dial: %w", err) }
		tcpConn = conn
		tcpInfo = info
		sourceIP = info.SourceIP
		callback(DownloadEvent{Type: "log", Message: info.PrintSYNInfo()})
		callback(DownloadEvent{Type: "tcp_info", Data: tcpInfo})

	} else {
		// 内核默认 TCP
		callback(DownloadEvent{Type: "log", Message: "[TCP] Kernel default"})
		dialer := &net.Dialer{Timeout: config.ConnectTimeout}
		conn, err := dialer.Dial("tcp", fmt.Sprintf("%s:%d", remoteIP, pPort))
		if err != nil { return nil, fmt.Errorf("TCP dial: %w", err) }
		tcpConn = conn
		tcpInfo = &tcpstack.TCPInfo{SourceIP: conn.LocalAddr().(*net.TCPAddr).IP.String(), DestIP: host}
		sourceIP = tcpInfo.SourceIP
		callback(DownloadEvent{Type: "tcp_info", Data: tcpInfo})
	}

	// ===== uTLS 握手 =====
	callback(DownloadEvent{Type: "state", Data: "tls_handshake"})
	tlsResult, err := tlsfingerprint.DialWithFingerprint(tcpConn, host,
		&tlsfingerprint.TLSFingerprintConfig{
			BrowserPreset: effectivePreset,
			UserAgent:     config.UserAgent,
			ALPN:          effectiveALPN,
			EnableGrease:  effectiveGrease,
		})
	if err != nil {
		tcpConn.Close()
		return nil, fmt.Errorf("uTLS: %w", err)
	}

	callback(DownloadEvent{Type: "tls_info", Data: tlsResult})
	callback(DownloadEvent{Type: "log", Message: fmt.Sprintf("[TLS] %s | Cipher=%s | ALPN=%s | JA4=%s | GREASE=%v",
		tlsResult.TLSVersion, tlsResult.CipherSuite, tlsResult.ALPN, tlsResult.JA4, effectiveGrease)})

	// ===== HTTP 请求 =====
	callback(DownloadEvent{Type: "state", Data: "requesting"})
	path := parsedURL.Path
	if parsedURL.RawQuery != "" { path += "?" + parsedURL.RawQuery }

	reqStr := fmt.Sprintf("GET %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: %s\r\nAccept: */*\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n",
		path, host, config.UserAgent)

	callback(DownloadEvent{Type: "state", Data: "downloading"})
	fmt.Fprint(tlsResult.Conn, reqStr)

	resp, err := http.ReadResponse(bufio.NewReader(tlsResult.Conn), nil)
	if err != nil {
		tlsResult.Conn.Close()
		return nil, fmt.Errorf("HTTP: %w", err)
	}

	return &DownloadResult{
		StatusCode: resp.StatusCode, Headers: resp.Header, Body: resp.Body,
		ContentLen: resp.ContentLength, TLSInfo: tlsResult, TCPInfo: tcpInfo,
		SourceIP: sourceIP, ProxyUsed: proxyUsed, Duration: time.Since(start),
	}, nil
}

func dialHTTPConnect(node *proxy.ProxyNode, host, port string, timeout time.Duration) (net.Conn, error) {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", node.Host, node.Port), timeout)
	if err != nil { return nil, err }
	fmt.Fprintf(conn, "CONNECT %s:%s HTTP/1.1\r\nHost: %s:%s\r\nProxy-Connection: Keep-Alive\r\n\r\n", host, port, host, port)
	b := make([]byte, 4096)
	n, err := conn.Read(b)
	if err != nil { conn.Close(); return nil, err }
	if len(b) < 12 || string(b[9:12]) != "200" {
		conn.Close(); return nil, fmt.Errorf("CONNECT rejected: %s", string(b[:min(n, 100)]))
	}
	return conn, nil
}
