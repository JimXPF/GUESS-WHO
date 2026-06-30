# Guess Who — 猜人物游戏

多主题猜人物 Web 游戏：**CS 选手、2026 世界杯足球、NBA、宝可梦**。支持六种模式：经典六项、每日一题、逐步提示、逆向轰炸、对战、接龙。

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

扣子编程部署见 [`scripts/coze-deploy-build.sh`](scripts/coze-deploy-build.sh) / [`scripts/coze-deploy-run.sh`](scripts/coze-deploy-run.sh)（PORT=5000）。

## 文档

**完整玩法规则、题库结构、出题逻辑与部署说明：**

→ **[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)**

数据维护脚本说明：

→ **[scripts/README.md](scripts/README.md)**

## 模式一览

| 模式 | 说明 |
|------|------|
| 经典六项 | 6 格对比 + 额外提示，10 次机会 |
| 每日一题 | 每主题每日 1 题，20 次，按次数+用时排名 |
| 逐步提示 | 3 条命，逐条解锁提示，无对比格 |
| **逆向轰炸** | 100 张候选卡，5 次条件筛选 + 终极猜测 |
| 对战 | 2–5 人 Socket 房间，共享题池 |
| 接龙 | 2–5 人轮流猜，字段认领计分 |

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18、TypeScript、Vite、Tailwind CSS、Framer Motion |
| 后端 | Express、sql.js（SQLite WASM）、Socket.io |
| 数据 | JSON 题库 + sql.js 持久化排行榜 |

## 项目结构

```
├── client/          # React 前端
├── server/          # Express 后端
│   ├── data/        # JSON 题库
│   └── services/    # 游戏逻辑、比对引擎、逆向轰炸
├── scripts/         # 题库维护脚本（非运行时）
└── docs/            # 设计文档
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/game/start` | 开始游戏 |
| POST | `/api/game/guess` | 提交猜测 |
| POST | `/api/game/reverse-query` | 逆向轰炸：提交筛选条件 |
| POST | `/api/game/next` | 下一题 |
| GET | `/api/leaderboard` | 排行榜 |
| GET | `/api/health` | 健康检查 |

多人模式通过 Socket.io（`/socket.io`）房间事件通信，详见设计文档。
