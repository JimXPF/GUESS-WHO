#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 尝试常见的 Go 安装路径
export PATH=$PATH:/usr/local/go/bin:/usr/lib/go/bin:/opt/go/bin:/usr/local/bin

# 检查 go 是否可用
if ! command -v go &> /dev/null; then
    echo "Error: go command not found in PATH: $PATH"
    echo "Attempting to find go..."
    find / -name "go" -type f 2>/dev/null | head -5 || true
    exit 1
fi

echo "Go version: $(go version)"

# 编译 Go 后端
cd server-go
echo "Running go mod tidy..."
go mod tidy || { echo "go mod tidy failed"; exit 1; }
echo "Running go build..."
go build -o server ./cmd/server || { echo "go build failed"; exit 1; }
cd ..

echo "Build completed successfully"
