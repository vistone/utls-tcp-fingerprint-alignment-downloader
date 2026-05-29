package cdn

// CDNType 支持的 CDN 类型
type CDNType string

const (
	Cloudflare CDNType = "cloudflare"
	Akamai     CDNType = "akamai"
	Imperva    CDNType = "incapsula"
	AWSF5      CDNType = "custom"  // F5/AWS WAF Shield
	None       CDNType = ""
)

// CDNConfig CDN 优化引擎输出的完整配置
type CDNConfig struct {
	CDNType         CDNType
	BrowserPreset   string   // 强制使用的浏览器预设
	H2Window        int      // HTTP/2 SETTINGS initial window size
	ConnectionReuse bool     // 是否强制连接复用
	PreferHTTP2     bool     // 是否优先 H2
	ALPN            []string // ALPN 协议列表
	GREASE          bool     // 是否插入 GREASE
	CipherFilter    func([]string) []string // 密码套件过滤器
	TCPFingerprint  *CDNTCPConfig
	Warnings        []string
}

// CDNTCPConfig TCP 层真实参数
type CDNTCPConfig struct {
	TTL         uint8  // IP TTL
	MSS         uint16 // TCP MSS
	WindowScale uint8  // Window Scale factor
	SACK        bool   // Selective ACK
	Timestamps  bool   // Timestamps
	WindowSize  uint16 // Initial Window
	NoOp        bool   // NOP padding
}

// Optimize 根据 CDN 类型和 User-Agent 生成真实的优化配置
// 每个 CDN 的规则来自实际的 WAF 指纹分析
func Optimize(cdn CDNType, browserPreset string, userAgent string) *CDNConfig {
	cfg := &CDNConfig{
		CDNType:         cdn,
		BrowserPreset:   browserPreset,
		H2Window:        6291456,
		ConnectionReuse: true,
		PreferHTTP2:     true,
		ALPN:            []string{"h2", "http/1.1"},
		GREASE:          false,
		TCPFingerprint:  nil,
		Warnings:        []string{},
	}

	switch cdn {
	case Cloudflare:
		optimizeCloudflare(cfg, userAgent)
	case Akamai:
		optimizeAkamai(cfg, userAgent)
	case Imperva:
		optimizeImperva(cfg, browserPreset)
	case AWSF5:
		optimizeAWSF5(cfg)
	}

	return cfg
}

// ======================== Cloudflare ========================
// Cloudflare WAF 检测要点：
// 1. Chrome 的 H2 SETTINGS initial_window_size 必须正好 6291456
// 2. ECDHE-RSA 和 DHE 密码套件会触发挑战页
// 3. 必须携带 GREASE 扩展（Chrome 特征）
// 4. ALPN 必须为 h2（Cloudflare 对 H1 请求更严格）
// 5. Windows TTL=128, MSS=1460, WScale=8

func optimizeCloudflare(cfg *CDNConfig, userAgent string) {
	cfg.H2Window = 6291456
	cfg.PreferHTTP2 = true
	cfg.ALPN = []string{"h2", "http/1.1"}
	cfg.GREASE = true

	cfg.CipherFilter = func(ciphers []string) []string {
		var filtered []string
		for _, c := range ciphers {
			if !contains(c, "ECDHE-RSA") && !contains(c, "DHE-") {
				filtered = append(filtered, c)
			}
		}
		return filtered
	}

	ua := toLower(userAgent)
	ttl := uint8(128)
	mss := uint16(1460)
	ws := uint8(8)
	if contains(ua, "mac") {
		ttl = 64; ws = 3
	} else if contains(ua, "linux") {
		ttl = 64; ws = 7
	}

	cfg.TCPFingerprint = &CDNTCPConfig{
		TTL: ttl, MSS: mss, WindowScale: ws,
		SACK: true, Timestamps: true, WindowSize: 65535, NoOp: true,
	}

	if !contains(ua, "chrome") && !contains(ua, "firefox") && !contains(ua, "safari") {
		cfg.Warnings = append(cfg.Warnings,
			"Cloudflare: 非浏览器预设高 403 风险，建议使用 Chrome")
	}
}

// ======================== Akamai ========================
// Akamai 检测要点：
// 1. 深度检查 TCP 选项布局——TTL/MSS/WindowScale 必须与 UA 声明的 OS 一致
// 2. Windows: TTL=128, MSS=1460, WScale=8
//    macOS: TTL=64, MSS=1460, WScale=3
//    Linux: TTL=64, MSS=1460, WScale=7
// 3. 连接复用检测——短连接会被标记为爬虫
// 4. TSval/TSecr 时钟偏差检测

func optimizeAkamai(cfg *CDNConfig, userAgent string) {
	ua := toLower(userAgent)
	cfg.ConnectionReuse = true
	cfg.ALPN = []string{"h2", "http/1.1"}

	var ttl uint8 = 64
	var mss uint16 = 1460
	var ws uint8 = 7
	var win uint16 = 29200
	osName := "Linux"

	if contains(ua, "windows") {
		ttl = 128; mss = 1460; ws = 8; win = 65535
		osName = "Windows"
	} else if contains(ua, "mac") {
		ttl = 64; mss = 1460; ws = 3; win = 65535
		osName = "macOS"
	} else if contains(ua, "linux") || contains(ua, "x11") {
		ttl = 64; mss = 1460; ws = 7; win = 29200
		osName = "Linux"
	}

	cfg.TCPFingerprint = &CDNTCPConfig{
		TTL: ttl, MSS: mss, WindowScale: ws,
		SACK: true, Timestamps: true, WindowSize: win, NoOp: true,
	}

	cfg.Warnings = append(cfg.Warnings,
		"Akamai: TCP 指纹对齐 "+osName+" (TTL="+itoa(int(ttl))+", MSS=1460, WScale="+itoa(int(ws))+")")
}

// ======================== Imperva / Incapsula ========================
// Imperva 检测要点：
// 1. Python urllib 的 TLS 指纹被直接封杀——自动升级到 Chrome 预设
// 2. ECDHE-ECDSA 优先于 ECDHE-RSA
// 3. 连接复用检测严格
// 4. DHE-RSA 和弱 AES 密码会被标记

func optimizeImperva(cfg *CDNConfig, browserPreset string) {
	cfg.ConnectionReuse = true

	// Imperva 封 Python 原生 TLS，自动升级到 Chrome
	if startsWith(browserPreset, "python") {
		cfg.BrowserPreset = "chrome_124"
		cfg.Warnings = append(cfg.Warnings,
			"Imperva: Python 预设自动升级到 Chrome_124")
	}

	cfg.CipherFilter = func(ciphers []string) []string {
		var filtered []string
		for _, c := range ciphers {
			if contains(c, "ECDHE-ECDSA") {
				filtered = append([]string{c}, filtered...) // ECDHE-ECDSA 优先
			} else if !contains(c, "DHE-RSA") && !contains(c, "AES128-GCM") {
				filtered = append(filtered, c)
			}
		}
		return filtered
	}

	cfg.TCPFingerprint = &CDNTCPConfig{
		TTL: 128, MSS: 1460, WindowScale: 8,
		SACK: true, Timestamps: true, WindowSize: 65535, NoOp: true,
	}
}

// ======================== F5 / AWS WAF Shield ========================
// F5/AWS 检测要点：
// 1. 并发连接数限制（>8 触发 CC 防护）
// 2. 短连接 + 快速重连 = 爬虫标记
// 3. Keep-Alive 必须开启

func optimizeAWSF5(cfg *CDNConfig) {
	cfg.ConnectionReuse = true
	cfg.ALPN = []string{"h2", "http/1.1"}

	cfg.TCPFingerprint = &CDNTCPConfig{
		TTL: 128, MSS: 1460, WindowScale: 8,
		SACK: true, Timestamps: true, WindowSize: 65535, NoOp: true,
	}

	cfg.Warnings = append(cfg.Warnings,
		"AWS/F5: 建议并发不超过 8 个连接")
}

// ======================== 工具函数 ========================

func contains(s, substr string) bool {
	return len(s) >= len(substr) && containsStr(s, substr)
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func toLower(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] >= 'A' && s[i] <= 'Z' {
			b[i] = s[i] + 32
		} else {
			b[i] = s[i]
		}
	}
	return string(b)
}

func startsWith(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [12]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
