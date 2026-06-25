#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 显式声明关键环境变量
export PORT=5000
export API_PORT=3001

# 清理端口残留进程（幂等性）
fuser -k 5000/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 1

# 后台启动后端服务
nohup pnpm exec tsx server/index.ts > logs/server.log 2>&1 &
SERVER_PID=$!

# 等待后端启动
sleep 3

# 启动前端 Vite 开发服务器在 5000 端口
exec pnpm exec vite --host 0.0.0.0 --port 5000
