package proxy

import (
	"fmt"
	"net"
	"sync"
	"time"
	"math/rand"
)

// ProxyNode 代理节点
type ProxyNode struct {
	Host     string
	Port     int
	Username string
	Password string
	BindIP   string
	Region   string
	Weight   int
	Latency  time.Duration // 最近一次测速结果
}

// ProxyMode 代理模式
type ProxyMode int

const (
	ModeDirect      ProxyMode = 0
	ModeSOCKS5      ProxyMode = 1
	ModeHTTPConnect ProxyMode = 2
)

// ProxyPool 代理池 - 管理多个出口节点和轮换策略
type ProxyPool struct {
	mu       sync.RWMutex
	nodes    []*ProxyNode
	strategy string // round_robin, random, lowest_latency
	rrIndex  int
}

// NewProxyPool 创建代理池
func NewProxyPool(strategy string) *ProxyPool {
	return &ProxyPool{
		strategy: strategy,
		rrIndex:  0,
	}
}

// AddNode 添加代理节点
func (p *ProxyPool) AddNode(node *ProxyNode) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.nodes = append(p.nodes, node)
}

// RemoveNode 移除代理节点
func (p *ProxyPool) RemoveNode(host string, port int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for i, n := range p.nodes {
		if n.Host == host && n.Port == port {
			p.nodes = append(p.nodes[:i], p.nodes[i+1:]...)
			return
		}
	}
}

// SelectNode 根据策略选择一个代理节点
func (p *ProxyPool) SelectNode() *ProxyNode {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if len(p.nodes) == 0 {
		return nil
	}

	switch p.strategy {
	case "random":
		return p.nodes[rand.Intn(len(p.nodes))]
	case "round_robin":
		idx := p.rrIndex % len(p.nodes)
		p.rrIndex++
		return p.nodes[idx]
	case "lowest_latency":
		best := p.nodes[0]
		for _, n := range p.nodes[1:] {
			if n.Latency < best.Latency && n.Latency > 0 {
				best = n
			}
		}
		return best
	default:
		return p.nodes[0]
	}
}

// ListNodes 列出所有节点
func (p *ProxyPool) ListNodes() []*ProxyNode {
	p.mu.RLock()
	defer p.mu.RUnlock()
	nodes := make([]*ProxyNode, len(p.nodes))
	copy(nodes, p.nodes)
	return nodes
}

// SOCKS5Dialer SOCKS5 代理拨号器
type SOCKS5Dialer struct{}

// DialSOCKS5 通过 SOCKS5 代理建立 TCP 连接
func (d *SOCKS5Dialer) DialSOCKS5(node *ProxyNode, target string, port int, timeout time.Duration) (net.Conn, error) {
	proxyAddr := fmt.Sprintf("%s:%d", node.Host, node.Port)

	conn, err := net.DialTimeout("tcp", proxyAddr, timeout)
	if err != nil {
		return nil, fmt.Errorf("connect to SOCKS5 proxy %s: %w", proxyAddr, err)
	}
	conn.SetDeadline(time.Now().Add(timeout))
	defer conn.SetDeadline(time.Time{})

	// SOCKS5 握手
	// 1. 客户端发送支持的认证方法
	_, err = conn.Write([]byte{0x05, 0x01, 0x00}) // SOCKS5, 1 method, No Auth
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 auth negotiation: %w", err)
	}

	// 2. 服务器选择认证方法
	resp := make([]byte, 2)
	if _, err := conn.Read(resp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 auth response: %w", err)
	}

	if resp[0] != 0x05 {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 invalid version: 0x%02x", resp[0])
	}

	if resp[1] != 0x00 {
		// 如果需要用户名密码认证
		if resp[1] == 0x02 && node.Username != "" {
			if err := socks5Auth(conn, node.Username, node.Password); err != nil {
				conn.Close()
				return nil, fmt.Errorf("SOCKS5 auth: %w", err)
			}
		} else {
			conn.Close()
			return nil, fmt.Errorf("SOCKS5 auth method 0x%02x not supported", resp[1])
		}
	}

	// 3. 发送连接请求
	// 构建请求：SOCKS5, CONNECT, RSV, ATYP, DST.ADDR, DST.PORT
	req := []byte{0x05, 0x01, 0x00, 0x03}
	req = append(req, byte(len(target)))
	req = append(req, []byte(target)...)
	req = append(req, byte(port>>8), byte(port))

	if _, err := conn.Write(req); err != nil {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 connect request: %w", err)
	}

	// 4. 读取响应
	resp = make([]byte, 4)
	if _, err := conn.Read(resp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 connect response: %w", err)
	}

	if resp[1] != 0x00 {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 connect failed: code 0x%02x", resp[1])
	}

	// 读取剩余地址信息
	atyp := resp[3]
	switch atyp {
	case 0x01: // IPv4
		resp = make([]byte, 6)
	case 0x03: // Domain
		resp = make([]byte, 1)
		if _, err := conn.Read(resp); err == nil {
			resp = make([]byte, resp[0]+2)
		}
	case 0x04: // IPv6
		resp = make([]byte, 18)
	}
	conn.Read(resp)

	return conn, nil
}

func socks5Auth(conn net.Conn, username, password string) error {
	// 用户名密码认证 (RFC 1929)
	auth := []byte{0x01, byte(len(username))}
	auth = append(auth, []byte(username)...)
	auth = append(auth, byte(len(password)))
	auth = append(auth, []byte(password)...)

	if _, err := conn.Write(auth); err != nil {
		return err
	}

	resp := make([]byte, 2)
	if _, err := conn.Read(resp); err != nil {
		return err
	}
	if resp[1] != 0x00 {
		return fmt.Errorf("SOCKS5 auth rejected")
	}
	return nil
}

// BindDialer 多 IP 绑定拨号器 - 从指定本地 IP 发起连接
type BindDialer struct{}

// DialWithBind 从指定本地 IP 发起 TCP 连接
func (d *BindDialer) DialWithBind(localIP string, target string, port int, timeout time.Duration) (net.Conn, error) {
	localAddr, err := net.ResolveTCPAddr("tcp", fmt.Sprintf("%s:0", localIP))
	if err != nil {
		return nil, fmt.Errorf("resolve local addr %s: %w", localIP, err)
	}

	dialer := &net.Dialer{
		Timeout:   timeout,
		LocalAddr: localAddr,
	}

	return dialer.Dial("tcp", fmt.Sprintf("%s:%d", target, port))
}
