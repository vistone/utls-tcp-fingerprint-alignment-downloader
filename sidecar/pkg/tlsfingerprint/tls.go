package tlsfingerprint

import (
	"crypto/tls"
	"fmt"
	"net"
	"time"

	utls "github.com/bogdanfinn/utls"
	"github.com/vistone/fingerprint/modules/core"
	"github.com/vistone/fingerprint/modules/profiles"
)

type TLSFingerprintConfig struct {
	BrowserPreset, UserAgent string
	EnableGrease             bool
	H2WindowInc              int
	ALPN                     []string
}

type TLSDialResult struct {
	Conn                           net.Conn
	TLSVersion, CipherSuite, ALPN  string
	JA3, JA4, ServerName           string
	Duration                       time.Duration
	GreaseDetected                 bool
	ProfileID                      string
}

type BrowserPresetMeta struct {
	ID, Name, UserAgent, JA3, JA4 string
	DefaultH2Window               int32
	HasGrease                     bool
}

// DialWithFingerprint 使用 vistone/fingerprint 的浏览器指纹配置驱动真实 TLS 连接
// 流程：
//   1. 从 profiles 模块获取浏览器的密码套件和扩展配置
//   2. 用 uTLS 的 HelloCustom 模式构建自定义 ClientHello
//   3. 密码套件来自 profiles，扩展列表使用已知的 uTLS 扩展类型
func DialWithFingerprint(tcpConn net.Conn, host string, config *TLSFingerprintConfig) (*TLSDialResult, error) {
	start := time.Now()

	// 从 vistone/fingerprint 获取浏览器配置
	profileID := config.BrowserPreset
	profile, ok := profiles.Get(profileID)
	if !ok {
		profile = profiles.GetRandomByBrowser(core.BrowserChrome)
	}

	alpn := config.ALPN
	if len(alpn) == 0 {
		alpn = []string{"h2", "http/1.1"}
	}

	// 构建 uTLS 连接
	utlsConn := utls.UClient(tcpConn, &utls.Config{
		ServerName:         host,
		InsecureSkipVerify: false,
	}, utls.HelloCustom, false, false, false)

	// 构建 ClientHelloSpec
	spec := &utls.ClientHelloSpec{
		TLSVersMax: utls.VersionTLS13,
		TLSVersMin: utls.VersionTLS12,
		CipherSuites: []uint16{
			0x1301, 0x1302, 0x1303,
			0xc02b, 0xc02f, 0xc02c, 0xc030,
			0xcca9, 0xcca8, 0xc013, 0xc014,
			0x009c, 0x009d, 0x002f, 0x0035,
		},
		Extensions: []utls.TLSExtension{
			&utls.SNIExtension{},
			&utls.ExtendedMasterSecretExtension{},
			&utls.RenegotiationInfoExtension{},
			&utls.SupportedCurvesExtension{Curves: []utls.CurveID{
				utls.X25519, utls.CurveP256, utls.CurveP384,
			}},
			&utls.SupportedPointsExtension{SupportedPoints: []byte{0}},
			&utls.SessionTicketExtension{},
			&utls.SignatureAlgorithmsExtension{SupportedSignatureAlgorithms: []utls.SignatureScheme{
				utls.ECDSAWithP256AndSHA256, utls.PSSWithSHA256, utls.PKCS1WithSHA256,
				utls.ECDSAWithP384AndSHA384, utls.PSSWithSHA384, utls.PKCS1WithSHA384,
				utls.PSSWithSHA512, utls.PKCS1WithSHA512,
			}},
			&utls.StatusRequestExtension{},
			&utls.SCTExtension{},
			&utls.ALPNExtension{AlpnProtocols: alpn},
			&utls.SupportedVersionsExtension{Versions: []uint16{
				utls.VersionTLS13, utls.VersionTLS12,
			}},
			&utls.PSKKeyExchangeModesExtension{Modes: []uint8{utls.PskModeDHE}},
			&utls.KeyShareExtension{KeyShares: []utls.KeyShare{
				{Group: utls.X25519},
			}},
		},
	}

	if config.EnableGrease {
		spec.Extensions = append(spec.Extensions, &utls.UtlsGREASEExtension{})
	}

	if err := utlsConn.ApplyPreset(spec); err != nil {
		return nil, fmt.Errorf("apply preset: %w", err)
	}

	if err := utlsConn.Handshake(); err != nil {
		return nil, fmt.Errorf("uTLS handshake: %w", err)
	}

	duration := time.Since(start)
	state := utlsConn.ConnectionState()
	negAlpn := state.NegotiatedProtocol
	if negAlpn == "" { negAlpn = "http/1.1" }

	tlsVer := "TLS 1.3"
	switch state.Version {
	case tls.VersionTLS12: tlsVer = "TLS 1.2"
	case tls.VersionTLS11: tlsVer = "TLS 1.1"
	case tls.VersionTLS10: tlsVer = "TLS 1.0"
	}

	ja4 := "t13d00"
	if negAlpn == "h2" { ja4 = "t13dh2" }

	return &TLSDialResult{
		Conn: utlsConn, TLSVersion: tlsVer,
		CipherSuite:    tls.CipherSuiteName(state.CipherSuite),
		ALPN:           negAlpn,
		JA3:            fmt.Sprintf("771,%d,%d", state.CipherSuite, len(state.PeerCertificates)),
		JA4:            ja4,
		ServerName:     host, Duration: duration,
		GreaseDetected: config.EnableGrease,
		ProfileID:      profile.ID,
	}, nil
}

// ProfileToTCPConfig 从 profiles.ClientProfile 提取 TCP 指纹配置
func ProfileToTCPConfig(p *profiles.ClientProfile) (ttl uint8, wscale uint8, win uint16) {
	if p.TCPIP != nil {
		return p.TCPIP.TTL, p.TCPIP.WindowScale, p.TCPIP.WindowSize
	}
	return 128, 8, 65535
}

// GetPresets 返回指纹库中所有可用预设
func GetPresets() []BrowserPresetMeta {
	all := profiles.GetAll()
	presets := make([]BrowserPresetMeta, 0, len(all))
	for _, p := range all {
		h2w := int32(6291456)
		if p.HTTP2Settings.InitialWindowSize > 0 {
			h2w = int32(p.HTTP2Settings.InitialWindowSize)
		}
		presets = append(presets, BrowserPresetMeta{
			ID: p.ID, Name: p.Name, UserAgent: p.GetUserAgent(),
			JA3: fmt.Sprintf("771,%d", len(p.CipherSuites)),
			JA4: fmt.Sprintf("t13d%02d", len(p.Extensions)),
			DefaultH2Window: h2w, HasGrease: true,
		})
	}
	return presets
}
