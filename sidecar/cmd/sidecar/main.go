package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/tcp-fingerprint/sidecar/pkg/cmd"
)

func main() {
	port := flag.Int("port", 50053, "gRPC server port")
	flag.Parse()

	log.Printf("[Sidecar] Starting TCP/TLS Fingerprint Sidecar v1.0.0")
	log.Printf("[Sidecar] gRPC endpoint: 0.0.0.0:%d", *port)

	server := cmd.NewGrpcServer(*port)

	// 优雅退出
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Printf("[Sidecar] Shutting down...")
		server.Stop()
		os.Exit(0)
	}()

	if err := server.Start(); err != nil {
		log.Fatalf("[Sidecar] Server error: %v", err)
	}
}
