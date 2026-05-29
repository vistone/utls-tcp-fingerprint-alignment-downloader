package cmd

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"time"

	"github.com/tcp-fingerprint/sidecar/pkg/downloader"
	"github.com/tcp-fingerprint/sidecar/pkg/proxy"
	"github.com/tcp-fingerprint/sidecar/pkg/tcpstack"
	"github.com/tcp-fingerprint/sidecar/pkg/tlsfingerprint"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
	pb "github.com/tcp-fingerprint/sidecar/pkg/proto/sidecar"
)

type GrpcServer struct {
	pb.UnimplementedFingerprintDownloaderServer
	server    *grpc.Server
	port      int
	startTime time.Time
}

func NewGrpcServer(port int) *GrpcServer {
	return &GrpcServer{port: port, startTime: time.Now()}
}

func (s *GrpcServer) Start() error {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", s.port))
	if err != nil { return fmt.Errorf("listen: %w", err) }
	s.server = grpc.NewServer(
		grpc.MaxRecvMsgSize(1024*1024*100),
		grpc.MaxSendMsgSize(1024*1024*100),
	)
	pb.RegisterFingerprintDownloaderServer(s.server, s)
	reflection.Register(s.server)
	log.Printf("[Sidecar] gRPC server on port %d", s.port)
	return s.server.Serve(lis)
}

func (s *GrpcServer) Stop() {
	if s.server != nil { s.server.GracefulStop() }
}

func (s *GrpcServer) Ping(ctx context.Context, req *pb.PingRequest) (*pb.PingResponse, error) {
	return &pb.PingResponse{Version: "1.0.0", UptimeSeconds: int64(time.Since(s.startTime).Seconds())}, nil
}

func (s *GrpcServer) GetPresets(ctx context.Context, empty *pb.Empty) (*pb.PresetList, error) {
	presets := []*pb.Preset{
		{Id: "chrome_124", Name: "Chrome v124", UserAgent: "Mozilla/5.0 ... Chrome/124", DefaultH2Window: 6291456, HasGrease: true},
		{Id: "firefox_120", Name: "Firefox v120", UserAgent: "Mozilla/5.0 ... Firefox/120", DefaultH2Window: 12582912, HasGrease: false},
		{Id: "safari_17", Name: "Safari v17", UserAgent: "Mozilla/5.0 ... Safari/605.1.15", DefaultH2Window: 2097152, HasGrease: false},
	}
	return &pb.PresetList{Presets: presets}, nil
}

func (s *GrpcServer) Download(req *pb.DownloadRequest, stream pb.FingerprintDownloader_DownloadServer) error {
	log.Printf("[Download] %s preset=%s cdn=%s", req.TargetUrl, req.BrowserPreset, req.CdnType)
	startTime := time.Now()

	var tcpFingerprint *tcpstack.TCPFingerprintConfig
	if req.TcpTtl > 0 {
		tcpFingerprint = &tcpstack.TCPFingerprintConfig{
			TTL: uint8(req.TcpTtl), MSS: uint16(req.TcpMss),
			WindowScale: uint8(req.TcpWindowScale),
			SACK: req.TcpSack, Timestamps: req.TcpTimestamps,
			WindowSize: uint16(req.TcpWindowSize),
		}
	}

	var proxyNodes []*proxy.ProxyNode
	if req.Proxy != nil {
		for _, n := range req.Proxy.Nodes {
			proxyNodes = append(proxyNodes, &proxy.ProxyNode{
				Host: n.Host, Port: int(n.Port), Username: n.Username,
				Password: n.Password, BindIP: n.BindIp, Region: n.Region, Weight: int(n.Weight),
			})
		}
	}

	proxyMode := proxy.ModeDirect
	if req.Proxy != nil { proxyMode = proxy.ProxyMode(req.Proxy.Mode) }

	cfg := &downloader.DownloadConfig{
		TargetURL: req.TargetUrl, BrowserPreset: req.BrowserPreset,
		UserAgent: req.UserAgent, EnableGrease: req.EnableGrease,
		H2WindowInc: int(req.H2WindowIncrement), TCPFingerprint: tcpFingerprint,
		ProxyMode: proxyMode, ProxyNodes: proxyNodes,
		RotationStrategy: func() string {
			if req.Proxy != nil { return req.Proxy.RotationStrategy }
			return "round_robin"
		}(),
		ConnectTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second,
		CDNType: req.CdnType,
	}

	callback := func(event downloader.DownloadEvent) {
		pbEvent := &pb.DownloadEvent{}
		switch event.Type {
		case "log":
			pbEvent.Event = &pb.DownloadEvent_Log{Log: &pb.LogEvent{Message: event.Message}}
		case "state":
			if st, ok := event.Data.(string); ok {
				pbEvent.Event = &pb.DownloadEvent_State{State: &pb.StateEvent{State: st}}
			}
		case "tls_info":
			if info, ok := event.Data.(*tlsfingerprint.TLSDialResult); ok {
				pbEvent.Event = &pb.DownloadEvent_TlsInfo{TlsInfo: &pb.TlsInfo{
					Ja4: info.JA4, Ja3: info.JA3, CipherSuite: info.CipherSuite,
					TlsVersion: info.TLSVersion, Alpn: info.ALPN,
				}}
			}
		case "tcp_info":
			if info, ok := event.Data.(*tcpstack.TCPInfo); ok {
				pbEvent.Event = &pb.DownloadEvent_TcpInfo{TcpInfo: &pb.TcpInfo{
					ActualTtl: int32(info.TTL), ActualMss: int32(info.MSS),
					ActualWindowScale: int32(info.WindowScale),
					ActualSack: info.SACK, ActualTimestamps: info.Timestamps,
					SourceIp: info.SourceIP, DestIp: info.DestIP,
				}}
			}
		case "error":
			pbEvent.Event = &pb.DownloadEvent_Error{Error: &pb.ErrorEvent{Message: event.Message}}
		}
		if pbEvent.Event != nil { stream.Send(pbEvent) }
	}

	result, err := downloader.ExecuteDownload(cfg, callback)
	if err != nil {
		errMsg := fmt.Sprintf("Download failed: %v", err)
		log.Printf("[Download] %s", errMsg)
		stream.Send(&pb.DownloadEvent{Event: &pb.DownloadEvent_Error{Error: &pb.ErrorEvent{Message: errMsg, Code: "FAILED"}}})
		stream.Send(&pb.DownloadEvent{Event: &pb.DownloadEvent_State{State: &pb.StateEvent{State: "failed"}}})
		return nil
	}
	defer result.Body.Close()

	// 流式读取响应体
	buf := make([]byte, 32*1024)
	received := int64(0)
	total := result.ContentLen
	lastReport := time.Now()

	for {
		n, err := result.Body.Read(buf)
		if n > 0 {
			received += int64(n)
			if time.Since(lastReport) > 200*time.Millisecond {
				progress := 0.0
				if total > 0 { progress = float64(received) / float64(total) * 100 }
				speedMbps := float64(received) / time.Since(startTime).Seconds() / 1024 / 1024 * 8
				stream.Send(&pb.DownloadEvent{Event: &pb.DownloadEvent_Progress{Progress: &pb.ProgressEvent{
					Progress: progress, SpeedMbps: speedMbps,
					ReceivedBytes: received, TotalBytes: total,
				}}})
				lastReport = time.Now()
			}
		}
		if err == io.EOF { break }
		if err != nil {
			stream.Send(&pb.DownloadEvent{Event: &pb.DownloadEvent_Error{Error: &pb.ErrorEvent{Message: fmt.Sprintf("Read: %v", err)}}})
			break
		}
	}

	duration := time.Since(startTime).Seconds()
	avgSpeed := float64(received) / duration / 1024 / 1024 * 8
	stream.Send(&pb.DownloadEvent{Event: &pb.DownloadEvent_Complete{Complete: &pb.CompleteEvent{
		TotalBytes: received, DurationSeconds: duration, AvgSpeedMbps: avgSpeed,
	}}})
	stream.Send(&pb.DownloadEvent{Event: &pb.DownloadEvent_State{State: &pb.StateEvent{State: "completed"}}})
	log.Printf("[Download] Complete: %d bytes in %.2fs", received, duration)
	return nil
}
