#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 编译 Go 后端
cd server-go
echo "Running go mod tidy..."
go mod tidy || { echo "go mod tidy failed"; exit 1; }
echo "Running go build..."
go build -o server ./cmd/server || { echo "go build failed"; exit 1; }
cd ..

echo "Build completed successfully"
