#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 启动生产服务（端口 5000）
# 清除可能存在的 PORT 环境变量，确保使用 5000
unset PORT
export PORT=5000
exec node dist/server/index.js
