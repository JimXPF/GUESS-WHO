#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 显式声明关键环境变量
export PORT=5000

# 清理端口残留进程（幂等性）
fuser -k 5000/tcp 2>/dev/null || true
sleep 1

# 启动生产服务（Express 托管前端静态文件 + API）
exec node dist/server/index.js
