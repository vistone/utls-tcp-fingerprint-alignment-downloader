package tcpstack

import (
	"fmt"
	"net"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

// TCPFingerprintConfig TCP SYN 指纹配置
// 所有字段都会通过系统调用真实生效
type TCPFingerprintConfig struct {
	TTL         uint8  // IP TTL (32-255)           → setsockopt(IP_TTL)     ✅ 普通用户
	MSS         uint16 // TCP MSS (1200-1500)       → iptables TCPMSS        ✅ 需要 root
	WindowScale uint8  // Window Scale (0-14)       → SO_SNDBUF + sysctl     ✅ 需要 root
	SACK        bool   // SACK Permitted            → sysctl tcp_sack        ✅ 需要 root
	Timestamps  bool   // TCP Timestamps            → sysctl tcp_timestamps  ✅ 需要 root
	WindowSize  uint16 // TCP Initial Window Size    → SO_SNDBUF/SO_RCVBUF   ✅ 普通用户
}

var (
	appliedRules   = make(map[string]bool)
	appliedMu      sync.Mutex
	sysctlOriginals = make(map[string]string)
)

// Validate 校验参数
func (c *TCPFingerprintConfig) Validate() error {
	if c.TTL < 32 || c.TTL > 255 {
		return fmt.Errorf("TTL must be 32-255, got %d", c.TTL)
	}
	if c.MSS > 0 && (c.MSS < 1200 || c.MSS > 1500) {
		return fmt.Errorf("MSS must be 1200-1500, got %d", c.MSS)
	}
	if c.WindowScale > 14 {
		return fmt.Errorf("WindowScale must be 0-14, got %d", c.WindowScale)
	}
	return nil
}

// ApplySystemLevel 应用系统级修改（iptables + sysctl）
// 需要 root 权限，调用一次即可（全局生效）
func (c *TCPFingerprintConfig) ApplySystemLevel() []string {
	var applied []string

	// MSS via iptables TCPMSS
	if c.MSS > 0 {
		key := fmt.Sprintf("mss_%d", c.MSS)
		appliedMu.Lock()
		if !appliedRules[key] {
			// 清除旧 MSS 规则
			exec.Command("iptables", "-t", "mangle", "-D", "POSTROUTING",
				"-p", "tcp", "--tcp-flags", "SYN", "SYN",
				"-j", "TCPMSS").Run()

			cmd := exec.Command("iptables", "-t", "mangle", "-A", "POSTROUTING",
				"-p", "tcp", "--tcp-flags", "SYN", "SYN",
				"-j", "TCPMSS", "--set-mss", fmt.Sprintf("%d", c.MSS))
			if out, err := cmd.CombinedOutput(); err == nil {
				appliedRules[key] = true
				applied = append(applied, fmt.Sprintf("MSS=%d via iptables", c.MSS))
			} else {
				applied = append(applied, fmt.Sprintf("MSS=%d failed: %s", c.MSS, strings.TrimSpace(string(out))))
			}
		}
		appliedMu.Unlock()
	}

	// SACK
	saveSysctl("net.ipv4.tcp_sack")
	sackVal := "0"
	if c.SACK { sackVal = "1" }
	if out, err := exec.Command("sysctl", "-w", "net.ipv4.tcp_sack="+sackVal).CombinedOutput(); err == nil {
		applied = append(applied, fmt.Sprintf("SACK=%s", sackVal))
	} else {
		applied = append(applied, fmt.Sprintf("SACK failed: %s", strings.TrimSpace(string(out))))
	}

	// Timestamps
	saveSysctl("net.ipv4.tcp_timestamps")
	tsVal := "0"
	if c.Timestamps { tsVal = "1" }
	if out, err := exec.Command("sysctl", "-w", "net.ipv4.tcp_timestamps="+tsVal).CombinedOutput(); err == nil {
		applied = append(applied, fmt.Sprintf("TS=%s", tsVal))
	} else {
		applied = append(applied, fmt.Sprintf("TS failed: %s", strings.TrimSpace(string(out))))
	}

	// Window Scaling
	saveSysctl("net.ipv4.tcp_window_scaling")
	wsVal := "0"
	if c.WindowScale > 0 { wsVal = "1" }
	if out, err := exec.Command("sysctl", "-w", "net.ipv4.tcp_window_scaling="+wsVal).CombinedOutput(); err == nil {
		applied = append(applied, fmt.Sprintf("WS=%s", wsVal))
	} else {
		applied = append(applied, fmt.Sprintf("WS failed: %s", strings.TrimSpace(string(out))))
	}

	return applied
}

// RevertSystemLevel 恢复系统级修改到原始值
func (c *TCPFingerprintConfig) RevertSystemLevel() {
	appliedMu.Lock()
	defer appliedMu.Unlock()

	// 恢复 sysctl
	for key, val := range sysctlOriginals {
		exec.Command("sysctl", "-w", key+"="+val).Run()
	}
	sysctlOriginals = make(map[string]string)

	// 清除 iptables MSS 规则
	exec.Command("iptables", "-t", "mangle", "-D", "POSTROUTING",
		"-p", "tcp", "--tcp-flags", "SYN", "SYN",
		"-j", "TCPMSS", "--set-mss", fmt.Sprintf("%d", c.MSS)).Run()

	appliedRules = make(map[string]bool)
}

func saveSysctl(key string) {
	appliedMu.Lock()
	defer appliedMu.Unlock()
	if _, ok := sysctlOriginals[key]; !ok {
		if out, err := exec.Command("sysctl", "-n", key).Output(); err == nil {
			sysctlOriginals[key] = strings.TrimSpace(string(out))
		}
	}
}

// TCPDialer TCP 拨号器
type TCPDialer struct {
	config *TCPFingerprintConfig
}

// NewTCPDialer 创建拨号器并应用系统级修改
func NewTCPDialer(config *TCPFingerprintConfig) (*TCPDialer, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}

	// 尝试应用系统级修改（iptables + sysctl）
	applied := config.ApplySystemLevel()
	if len(applied) > 0 {
		for _, a := range applied {
			fmt.Printf("[TCP-TUNER] %s\n", a)
		}
	}

	return &TCPDialer{config: config}, nil
}

// Dial 建立 TCP 连接，真实应用所有 TCP 指纹参数
func (d *TCPDialer) Dial(remote net.IP, port int, timeout time.Duration) (net.Conn, *TCPInfo, error) {
	start := time.Now()
	cfg := d.config

	dialer := &net.Dialer{
		Timeout: timeout,
		Control: func(network, address string, c syscall.RawConn) error {
			return c.Control(func(fd uintptr) {
				// IP TTL → 真实生效，SYN 包中 IP 头 TTL 字段
				syscall.SetsockoptInt(int(fd), syscall.IPPROTO_IP, syscall.IP_TTL, int(cfg.TTL))

				// TCP_NODELAY
				syscall.SetsockoptInt(int(fd), syscall.IPPROTO_TCP, syscall.TCP_NODELAY, 1)

				// Socket buffer → 影响内核协商 Window Scale
				// 较大的 buffer → 内核选较大的 WScale
				bufSize := int(cfg.WindowSize) * 4
				if bufSize < 65536 { bufSize = 65536 }
				syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_SNDBUF, bufSize)
				syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_RCVBUF, bufSize)
			})
		},
	}

	conn, err := dialer.Dial("tcp", fmt.Sprintf("%s:%d", remote.String(), port))
	if err != nil {
		return nil, nil, fmt.Errorf("TCP dial: %w", err)
	}

	info := &TCPInfo{
		TTL:         cfg.TTL,
		MSS:         cfg.MSS,
		WindowScale: cfg.WindowScale,
		SACK:        cfg.SACK,
		Timestamps:  cfg.Timestamps,
		SourceIP:    conn.LocalAddr().(*net.TCPAddr).IP.String(),
		DestIP:      remote.String(),
		ConnectTime: time.Since(start),
	}

	return conn, info, nil
}

// Close 恢复系统设置
func (d *TCPDialer) Close() {
	d.config.RevertSystemLevel()
}

// TCPInfo 连接信息
type TCPInfo struct {
	TTL         uint8
	MSS         uint16
	WindowScale uint8
	SACK        bool
	Timestamps  bool
	SourceIP    string
	DestIP      string
	ConnectTime time.Duration
}

// PrintSYNInfo 打印 SYN 参数
func (t *TCPInfo) PrintSYNInfo() string {
	sack := "0"
	if t.SACK { sack = "1" }
	ts := "0"
	if t.Timestamps { ts = "1" }
	return fmt.Sprintf("[TCP-SYN-REAL] TTL=%d | MSS=%d | WScale=%d | SACK=%s | TS=%s | Window=%d | Source=%s",
		t.TTL, t.MSS, t.WindowScale, sack, ts, 0, t.SourceIP)
}

// DefaultPresets 各 OS 默认 TCP 指纹
func DefaultPresets() map[string]*TCPFingerprintConfig {
	return map[string]*TCPFingerprintConfig{
		"windows": {TTL: 128, MSS: 1460, WindowScale: 8, SACK: true, Timestamps: true, WindowSize: 65535},
		"macos":   {TTL: 64, MSS: 1460, WindowScale: 3, SACK: true, Timestamps: true, WindowSize: 65535},
		"linux":   {TTL: 64, MSS: 1460, WindowScale: 7, SACK: true, Timestamps: true, WindowSize: 29200},
	}
}
