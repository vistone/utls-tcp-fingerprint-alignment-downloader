#!/bin/bash
set -e

echo "============================================"
echo "  uTLS/TCP Fingerprint Alignment Downloader"
echo "  一键启动 (Sidecar + 前端)"
echo "============================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SIDECAR_PORT=50054

# 检查 sidecar 二进制
SIDECAR_BIN="$SCRIPT_DIR/sidecar/bin/sidecar"
if [ ! -f "$SIDECAR_BIN" ]; then
    echo "[构建] 编译 Go sidecar..."
    cd sidecar
    go build -o bin/sidecar ./cmd/sidecar/main.go
    cd "$SCRIPT_DIR"
fi

# 清理旧 sidecar 进程
OLD_PID=$(lsof -ti:$SIDECAR_PORT 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
    echo "[清理] 停止旧 Sidecar (PID $OLD_PID) ..."
    sudo kill -9 $OLD_PID 2>/dev/null || true
    sleep 1
fi

echo "[启动] Sidecar (gRPC :$SIDECAR_PORT) ..."
sudo "$SIDECAR_BIN" --port $SIDECAR_PORT &
SIDECAR_PID=$!
sleep 2

if ! kill -0 $SIDECAR_PID 2>/dev/null; then
    echo "[错误] Sidecar 启动失败"
    tail -5 /tmp/sidecar.log 2>/dev/null || true
    exit 1
fi
echo "[OK] Sidecar PID=$SIDECAR_PID (port $SIDECAR_PORT)"

echo "[启动] 前端开发服务器 (Next.js :3000) ..."
echo ""
echo "  浏览器打开: http://localhost:3000"
echo "  在 UI 中开启 Go Sidecar Engine 开关"
echo "  Sidecar 地址: localhost:$SIDECAR_PORT"
echo ""
npm run dev

echo ""
echo "服务已停止"
