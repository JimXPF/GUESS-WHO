# GUESS Who — Go 后端 (server-go)

本目录为 Guess Who 的 **Go 后端**（已替代原 Node.js `server/`）。

## 技术栈

| 层级 | 选型 | 说明 |
|------|------|------|
| 语言 | Go 1.26+ | Socket.io 库要求 |
| HTTP | chi v5 | 路由 + 中间件 |
| 实时 | zishang520/socket.io v3 | 与前端 `socket.io-client` v4 兼容 |
| 数据库 | modernc.org/sqlite | 纯 Go，无 CGO |
| 数据 | JSON 静态题库 | `server-go/data/` |

### 直接依赖（仅 5 个）

```
github.com/go-chi/chi/v5
github.com/google/uuid
github.com/zishang520/socket.io/servers/socket/v3
github.com/zishang520/socket.io/v3
modernc.org/sqlite
```

间接依赖（quic、brotli、msgpack、websocket 等）均来自 **Socket.io 服务端栈**，多人对战需要，无法在不改前端协议的情况下去掉。

若不需要多人模式，可移除 socket.io 相关包并删掉 `internal/socket/`，间接依赖会显著减少——但当前产品包含对战/接龙，故保留。

## 目录结构

```
server-go/
├── cmd/server/main.go       # 入口：HTTP + Socket.io + 静态资源
├── internal/
│   ├── api/                 # REST + SPA 静态文件
│   ├── db/                  # SQLite 建表与连接
│   ├── services/            # 游戏核心逻辑（对比、提示、各模式、房间猜题）
│   ├── socket/              # 多人房间与 Socket 事件
│   └── types/               # 与前端契约一致的类型
├── data/                    # 主题 JSON + geo 数据
└── go.mod
```

## 构建与运行

```bash
cd server-go
go mod tidy
go build -o server.exe ./cmd/server
```

环境变量（可选）：

- `PORT` — 端口（默认 3001）
- `HOST` — 监听地址（开发默认 `127.0.0.1`；生产/局域网设 `0.0.0.0`）
- `DB_PATH` — SQLite 文件路径（默认 `./guess-who.db`）

开发时推荐在项目根目录执行 `npm run dev`：Vite `:5173` 代理 `/api` 与 `/socket.io` 到 Go `:3001`。

## 与前端的关系

- REST：`/api/game/*`、`/api/leaderboard/*`
- Socket.io：`room:create` / `room:join` / `room:guess` 等（与旧 Node 事件名一致）
- 生产：`npm run build` 后 Go 同时提供 `client/dist` 与 API

## 代码维护说明

- **无 `server-go/ref/`**：迁移参考目录已删除，避免与正式代码混淆。
- **字段标签**：统一定义在 `internal/types/types.go` 的 `ThemeFieldDefs`，勿在 services 重复维护。
- **联想搜索**：`suggest.go` 仅薄封装，实际逻辑在 `data_loader.SearchCharacters`。
