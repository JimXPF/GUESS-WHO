# Guess Who - 猜人物游戏

局域网可访问的多主题猜人物游戏，支持 CS 选手、足球运动员、NBA 球员、动漫角色四大题库。

## 快速开始

```bash
# 安装依赖
npm install
cd client && npm install && cd ..

# 开发模式（前端 :5173 + 后端 :3001）
npm run dev
```

浏览器访问：
- 本机：`http://localhost:5173`
- 局域网：`http://<你的IP>:5173`（终端会打印 API 地址）

## 生产部署

```bash
npm run build
npm start
```

生产模式下 Express 同时托管 API 与前端静态文件，默认端口 `3001`。

## 游戏规则

1. 输入昵称，选择主题后开始
2. 系统随机抽取一个角色，并给出 **一条** 提示信息
3. 输入人物名猜测：
   - **题库中没有**：不消耗次数，提示换名字
   - **题库中有**：消耗 1 次机会，展示各字段与答案的差距（命中 / 接近 / 未命中）
4. 开局 **10 次**机会，答对一题 **+2 次**（上限 10）
5. 次数耗尽游戏结束，展示总分与答对题数，成绩写入排行榜

### 计分

```
本题得分 = max(100, 500 - 本题猜测次数 × 80)
```

## 题库更新

编辑 `server/data/` 下对应 JSON 文件：

| 文件 | 主题 |
|------|------|
| `csgo.json` | CS 选手 |
| `football.json` | 足球运动员 |
| `nba.json` | NBA 球员 |
| `anime.json` | 动漫角色 |

每条记录格式：

```json
{
  "id": "unique-slug",
  "name": "显示名称",
  "aliases": ["别名", "中文名"],
  "...": "其他主题字段"
}
```

修改后重启服务即可生效，无需改代码。

### 从外部源更新题库

维护脚本在 `scripts/`，详见 [`scripts/README.md`](scripts/README.md)。

| 主题 | 数据源 |
|------|--------|
| CS | 完美世界电竞 + Liquipedia（生日） |
| 足球 | 小红书 |
| NBA | 虎扑 |
| 动漫 | 手动维护 JSON（`server/data/anime.json`） |

```bash
npm run sync:csgo              # CS 阵容（完美世界）
npm run patch:csgo:liquipedia:slow && npm run backfill:csgo:birthdates
npm run sync:football:xhs      # 足球
npm run sync:nba               # NBA
```

### 接近判定配置

- 数值字段阈值：`server/services/compareEngine.ts` 中 `NUMERIC_RULES`
- 国籍/地理邻近：`server/data/geo/nationality-regions.json`
- 位置分组：`server/data/position-groups.json`

## 项目结构

```
├── client/          # Vite + React 前端
├── server/          # Express + SQLite 后端
│   ├── data/        # JSON 题库
│   ├── routes/      # API 路由
│   └── services/    # 游戏逻辑、比对引擎
└── package.json
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/game/start` | 开始游戏 |
| POST | `/api/game/guess` | 提交猜测 |
| POST | `/api/game/next` | 下一题 |
| POST | `/api/game/quit` | 退出 |
| GET | `/api/game/:sessionId` | 恢复会话 |
| GET | `/api/leaderboard` | 排行榜 |

## 技术栈

- 前端：React 18、TypeScript、Tailwind CSS、Framer Motion
- 后端：Express、better-sqlite3
- 数据：JSON 题库 + SQLite 排行榜
