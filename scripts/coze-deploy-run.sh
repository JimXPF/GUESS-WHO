#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 清除环境中的 PORT 变量，确保使用 5000
unset PORT
export PORT=5000

# 启动 Go 后端服务
cd server-go
./server
