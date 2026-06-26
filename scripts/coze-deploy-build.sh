#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 安装根依赖（跳过 puppeteer 脚本安装失败的问题）
pnpm install --ignore-scripts

# 安装 client 依赖
pnpm install --dir client --ignore-scripts

# 构建前端
cd client && pnpm exec vite build && cd ..

# 编译后端 TypeScript
pnpm exec tsc -p server/tsconfig.json

# 复制 sql.js wasm 文件到 dist 目录（用于运行时）
if [ -d "node_modules/sql.js/dist" ]; then
  mkdir -p dist/server
  cp node_modules/sql.js/dist/sql-wasm.wasm dist/server/ 2>/dev/null || true
fi
