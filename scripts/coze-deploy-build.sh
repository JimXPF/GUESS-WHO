#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 检查预编译的二进制文件是否存在
if [ ! -f "server-go/server" ]; then
    echo "Error: server-go/server binary not found."
    echo "The pre-compiled binary must be committed to the repository."
    exit 1
fi

echo "Pre-compiled binary found, skipping build step."
echo "Binary size: $(ls -lh server-go/server | awk '{print $5}')"

echo "Build completed successfully"
