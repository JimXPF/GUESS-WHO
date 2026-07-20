# 交接说明（给全员）

> Demo：[https://guess-who.coze.site/](https://guess-who.coze.site/)　·　代码：[GitHub JimXPF/GUESS-WHO](https://github.com/JimXPF/GUESS-WHO)  
> **完整阅读文档以 Wiki / `docs/GAME_DESIGN.md` + `docs/UI_SCREENS.md` 为准**（先规则，后实现）。

## 本地怎么跑

| 项 | 说明 |
|----|------|
| 环境 | Node 18+、Go 1.26+ |
| 启动 | 根目录 `npm run dev`，或 Windows 双击 `start.bat` |
| 前端 | http://localhost:5173 |
| 后端 | http://127.0.0.1:3001（Vite 代理 `/api`、`/socket.io`） |
| 健康检查 | `GET /api/health` |

## 演进时注意

| 尽量保留语义 | 可以大改 |
|--------------|----------|
| 六种玩法的规则、计分、结束条件 | 视觉、布局、动效 |
| REST / Socket 事件名与产品含义 | 前端目录、样式、脚手架 |
| 题库 JSON 与主题字段含义 | CI、部署形态 |

改计分 / 人数 / 房主权 / 揭晓策略 → 需产品确认。
