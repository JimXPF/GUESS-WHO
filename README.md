# Guess Who — 猜人物游戏

多主题猜人物 Web 游戏：**CS 选手 · 2026 世界杯足球 · NBA · 宝可梦（Gen1–3）**。

支持六种模式：经典六项、每日一题、逐步提示、逆向轰炸、对战、接龙。

---

## 技术架构

| 层 | 技术 | 说明 |
|----|------|------|
| **前端** | React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion | SPA，`client/` |
| **后端** | **Go 1.25+** · [chi](https://github.com/go-chi/chi) v5 | REST API + 静态资源托管，`server-go/` |
| **数据库** | [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) | 纯 Go SQLite，本地文件 `guess-who.db` |
| **实时多人** | Socket.io（前端 `socket.io-client`） | Go 端房间层迁移中 |
| **题库** | 静态 JSON | `server-go/data/*.json`，运行时只读 |
| **数据脚本** | Node.js + Puppeteer | `scripts/`，仅维护题库，不进生产运行时 |

```
┌─────────────┐     /api  /socket.io     ┌──────────────────┐
│  React SPA  │ ───────────────────────► │  Go Backend      │
│  Vite :5173 │   (开发时 Vite 代理)      │  chi  :3001      │
└─────────────┘                          │  SQLite + JSON   │
       │                                 └──────────────────┘
       │ 生产环境：Go 单端口托管 client/dist
       └──────────────────────────────────────────────────────►
```

> 后端已由 Node.js（Express + sql.js）**完全迁移为 Go**。旧 `server/` 目录已移除。

---

## 环境要求

| 工具 | 用途 |
|------|------|
| **Go 1.25+** | 编译 / 运行后端 |
| **Node.js 18+** | 前端开发构建、题库维护脚本 |
| **npm** | 前端依赖与 dev 脚本 |

---

## 快速开始（本地开发）

### Windows（推荐）

双击项目根目录 **`start.bat`**，然后打开：

| 访问方式 | 地址 |
|----------|------|
| 本机 | http://localhost:5173 |
| 局域网 | http://\<你的IP\>:5173 |

> **不要**直接访问 `:3001`——那是 API 端口，浏览器打开会白屏。

### 命令行

```bash
# 1. 安装前端依赖
npm install --prefix client

# 2. 启动（Go 后端 :3001 + Vite 前端 :5173）
npm run dev
```

### 局域网访问

若通过 IP 打开页面空白，编辑 `client/.env`（可参考 `client/.env.example`）：

```env
VITE_DEV_HOST=10.253.36.103   # 改成你的本机 IP
VITE_BACKEND_HOST=127.0.0.1   # 代理目标，保持本机回环即可
VITE_BACKEND_PORT=3001
```

修改后需重启 `start.bat`。

---

## 生产构建与运行

```bash
# 构建前端 + 编译 Go 后端
npm run build

# 启动（Go 托管 API + client/dist 静态文件，默认 :3001）
npm start
# 或
cd server-go && ./server
```

环境变量（可选）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `3001` | HTTP 监听端口 |
| `DB_PATH` | `./guess-who.db` | SQLite 数据库路径 |

---

## 扣子编程部署

生产环境建议 **单进程 Go 服务** 托管前端静态文件 + API。

```bash
npm run build --prefix client
cd server-go && go build -o server ./cmd/server
PORT=5000 ./server
```

> 根目录 `scripts/coze-deploy-*.sh` 仍为旧 Node 流程，部署到扣子前请按上述 Go 步骤调整构建脚本。

---

## 游戏模式

| 模式 | 标识 | 说明 |
|------|------|------|
| 经典六项 | `classic-six` | 6 格对比 + 3/6/9 次额外提示，10 次机会 |
| 每日一题 | `daily-one` | 每主题每日 1 题（UTC+8），20 次，按次数+用时排名 |
| 逐步提示 | `progressive-hint` | 3 条命，逐条解锁提示，无对比格 |
| 逆向轰炸 | `reverse-bomb` | 100 张候选卡，5 次条件筛选 + 终极猜测，固定 3 轮 |
| 对战 | `battle` | 2–5 人 Socket 房间，共享 10 题 |
| 接龙 | `relay-chain` | 2–5 人轮流猜，字段认领计分，30 题 |

---

## 项目结构

```
GUESS-Who/
├── client/                 # React 前端（Vite）
│   ├── src/pages/          GamePage, LobbyPage, MultiplayerGamePage …
│   ├── src/components/     对比格、提示卡、逆向轰炸 UI …
│   └── vite.config.ts      开发代理 → Go :3001
├── server-go/              # Go 后端（唯一运行时服务端）
│   ├── cmd/server/         入口 main.go
│   ├── internal/
│   │   ├── api/            REST + 静态文件 SPA fallback
│   │   ├── db/             SQLite 建表与连接
│   │   ├── services/       比对引擎、提示、RNG、游戏模式逻辑
│   │   ├── socket/         多人房间（迁移中）
│   │   └── types/          共享类型
│   └── data/               四主题 JSON 题库
├── scripts/                # 题库爬虫 / 回填（Node，非运行时）
├── docs/
│   └── GAME_DESIGN.md      # 玩法规则、字段设计、实现逻辑（开发必读）
├── start.bat               # Windows 一键启动
└── package.json            # dev / build 脚本编排
```

---

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/game/start` | 开始游戏 |
| `POST` | `/api/game/guess` | 提交猜测 |
| `POST` | `/api/game/next` | 下一题 |
| `POST` | `/api/game/quit` | 退出并写榜 |
| `POST` | `/api/game/reverse-query` | 逆向轰炸：提交筛选条件 |
| `GET` | `/api/game/suggest` | 搜索建议（模糊） |
| `GET` | `/api/game/:sessionId` | 恢复局状态 |
| `GET` | `/api/leaderboard` | 排行榜 |
| `GET` | `/api/leaderboard/daily/today` | 今日每日挑战状态 |

**Socket 事件**（多人）：`room:create` · `room:join` · `room:rejoin` · `room:guess` · `room:leave` · `room:state` · `game:start` · `game:finished`

完整契约与状态机见 **[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)**。

---

## 文档

| 文档 | 内容 |
|------|------|
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | 玩法规则、题库结构、比对逻辑、逆向/接龙状态机 |
| [server-go/README.md](server-go/README.md) | Go 后端模块说明与构建细节 |
| [scripts/README.md](scripts/README.md) | 题库数据维护脚本 |

---

## 数据维护

题库 JSON 位于 `server-go/data/`。修改后需**重启 Go 服务**生效。

```bash
npm run sync:csgo          # 同步 CS  roster
npm run sync:nba           # 同步 NBA 数据
npm run sync:pokemon       # 同步宝可梦
npm run patch:aliases        # 回填搜索别名
```

更多脚本见 `scripts/README.md` 与 `package.json` 的 `scripts` 字段。

---

## 开发说明

- **前端不变**：仍使用原有 React 页面与 `socket.io-client`，通过 Vite 代理对接 Go API。
- **每日一题**：Go 端使用内置 Mulberry32 种子 RNG，同一 UTC+8 日期 + 主题全局一致。
- **迁移进度**：单人 REST 流程已接通；多人 Socket 与部分模式逻辑仍在完善中，测试时请以实际行为为准。

---

## License

Private project.
