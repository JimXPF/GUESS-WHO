#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 安装前端依赖
pnpm install

# 构建前端
cd client && pnpm exec vite build && cd ..

# 编译 Go 后端
cd server-go
go mod tidy
go build -o server ./cmd/server
cd ..

echo "Build completed successfully"
