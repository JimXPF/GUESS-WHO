#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 确保监听所有接口，端口为 5000
export HOST=0.0.0.0
export PORT=5000

# 启动 Go 后端服务
cd server-go
./server
