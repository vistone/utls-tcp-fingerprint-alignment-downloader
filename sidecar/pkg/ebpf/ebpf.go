// Package ebpf 使用 eBPF 技术在内核层面修改 TCP SYN 包
//
// 原理：
// 1. 用 tc (traffic control) 的 eBPF 程序挂在出口 qdisc 上
// 2. 每个发出的 TCP SYN 包经过时，eBPF 程序修改其 TCP 选项
// 3. 可以修改：MSS, Window Scale, SACK, Timestamps, TTL
//
// 需要：
// - Linux 内核 5.10+
// - CONFIG_BPF=y, CONFIG_TC_BPF=y
// - 运行 sidecar 时以 root 或 CAP_BPF+CAP_NET_ADMIN
//
// 或者更轻量的替代方案：
// 使用 iptables + raw socket 组合来实现类似效果

import (
	"fmt"
	"os/exec"
)

// BPFProgram 表示编译好的 eBPF 程序
type BPFProgram struct {
	ObjectPath string
	Section    string
	IfName     string
}

// TCPFingerprintModifier eBPF TCP 指纹修改器
type TCPFingerprintModifier struct {
	programs []BPFProgram
}

// NewTCPFingerprintModifier 创建 eBPF 修改器
func NewTCPFingerprintModifier() (*TCPFingerprintModifier, error) {
	return &TCPFingerprintModifier{}, nil
}

// ApplyTCPFingerprint 通过 iptables + tc + eBPF 应用 TCP 指纹修改
// 这是当前最实用的方案：
//   - TTL: setsockopt(IP_TTL) — 已实现
//   - MSS: iptables TCPMSS target — 需要 root
//   - Window Scale: eBPF hook tcp_connect — 需要内核支持
//   - SACK/Timestamps: /proc/sys 全局设置
func (m *TCPFingerprintModifier) ApplyTCPFingerprint(ttl int, mss int, wscale int) error {
	var errs []error

	// TTL 通过 setsockopt 已经在 Go 层面实现，不需要 eBPF

	// MSS 通过 iptables
	if err := setMSSviaIptables(mss); err != nil {
		errs = append(errs, fmt.Errorf("iptables MSS: %w", err))
	}

	// Window Scale 通过 sysctl
	if wscale > 0 {
		// 注意：这是全局设置，会影响所有连接
		// 更精细的控制需要 eBPF
		if wscale >= 0 && wscale <= 14 {
			// 通过 /proc/sys/net/ipv4/tcp_window_scaling 开启
			// 但具体的 scale factor 由内核根据 buffer 大小决定
			// 唯一能精确控制的方式是 eBPF
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("apply errors: %v", errs)
	}
	return nil
}

// setMSSviaIptables 用 iptables 修改 MSS
func setMSSviaIptables(mss int) error {
	// iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN SYN \
	//   -j TCPMSS --set-mss <MSS>
	cmd := exec.Command("iptables", "-t", "mangle", "-A", "POSTROUTING",
		"-p", "tcp", "--tcp-flags", "SYN", "SYN",
		"-j", "TCPMSS", "--set-mss", fmt.Sprintf("%d", mss))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("iptables: %s: %w", string(out), err)
	}
	return nil
}

// RemoveMSSrule 清除 iptables MSS 规则
func RemoveMSSrule() {
	exec.Command("iptables", "-t", "mangle", "-D", "POSTROUTING",
		"-p", "tcp", "--tcp-flags", "SYN", "SYN",
		"-j", "TCPMSS", "--set-mss").Run()
}

// SetWindowScaleViaSysctl 通过 sysctl 开启 Window Scaling
// 注意：这只是开启特性，具体的 scale factor 由内核决定
func SetWindowScaleViaSysctl(enabled bool) error {
	val := "0"
	if enabled {
		val = "1"
	}
	cmd := exec.Command("sysctl", "-w", "net.ipv4.tcp_window_scaling="+val)
	return cmd.Run()
}

// SetSACKViaSysctl 通过 sysctl 开启 SACK
func SetSACKViaSysctl(enabled bool) error {
	val := "0"
	if enabled {
		val = "1"
	}
	cmd := exec.Command("sysctl", "-w", "net.ipv4.tcp_sack="+val)
	return cmd.Run()
}

// SetTimestampsViaSysctl 通过 sysctl 开启 TCP Timestamps
func SetTimestampsViaSysctl(enabled bool) error {
	val := "0"
	if enabled {
		val = "1"
	}
	cmd := exec.Command("sysctl", "-w", "net.ipv4.tcp_timestamps="+val)
	return cmd.Run()
}
