# Guess Who — 猜人物游戏

多主题猜人物 Web 游戏：CS 选手、2026 世界杯足球、NBA、动漫、宝可梦。支持经典六项、每日一题、逐步提示、对战与接龙五种模式。

## 快速开始

```bash
npm install
npm install --prefix client
npm run dev          # 前端 :5173 + 后端 :3001
```

生产部署：

```bash
npm run build
npm start            # 默认 PORT=3001，托管 API + 前端静态文件
```

## 文档

**完整玩法规则、题库结构、出题逻辑与部署说明：**

→ **[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)**

数据维护脚本说明：

→ **[scripts/README.md](scripts/README.md)**

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18、TypeScript、Vite、Tailwind CSS |
| 后端 | Express、sql.js（SQLite WASM）、Socket.io |
| 数据 | JSON 题库 + sql.js 持久化排行榜 |

## 项目结构

```
├── client/          # React 前端
├── server/          # Express 后端
│   ├── data/        # JSON 题库
│   └── services/    # 游戏逻辑、比对引擎
├── scripts/         # 题库维护脚本（非运行时）
└── docs/            # 设计文档
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/game/start` | 开始游戏 |
| POST | `/api/game/guess` | 提交猜测 |
| POST | `/api/game/next` | 下一题 |
| GET | `/api/leaderboard` | 排行榜 |
| GET | `/api/health` | 健康检查 |

多人模式通过 Socket.io（`/socket.io`）房间事件通信，详见设计文档。
