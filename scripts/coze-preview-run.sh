#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 启动后端服务（端口 3001）
pnpm exec tsx server/index.ts &
BACKEND_PID=$!

# 启动前端开发服务器（端口 5000）
cd client
pnpm exec vite --host 0.0.0.0 --port 5000 &
FRONTEND_PID=$!

# 等待进程
wait $BACKEND_PID $FRONTEND_PID
