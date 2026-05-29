#!/bin/bash
set -e

echo "============================================"
echo "  uTLS/TCP Fingerprint Alignment Downloader"
echo "  一键启动 (Sidecar + 前端)"
echo "============================================"
echo ""

# 检查 sidecar 二进制
SIDECAR_BIN="$(dirname "$0")/sidecar/bin/sidecar"
if [ ! -f "$SIDECAR_BIN" ]; then
    echo "[构建] 编译 Go sidecar..."
    cd "$(dirname "$0")/sidecar"
    go build -o bin/sidecar ./cmd/sidecar/main.go
    cd - > /dev/null
fi

echo "[启动] Sidecar (gRPC :50053) ..."
sudo "$SIDECAR_BIN" --port 50053 &
SIDECAR_PID=$!
sleep 2

# 检查 sidecar 是否成功启动
if ! kill -0 $SIDECAR_PID 2>/dev/null; then
    echo "[错误] Sidecar 启动失败，请检查日志"
    exit 1
fi
echo "[OK] Sidecar PID=$SIDECAR_PID"

echo "[启动] 前端开发服务器 (Next.js :3000) ..."
npm run dev

echo ""
echo "服务已停止"
