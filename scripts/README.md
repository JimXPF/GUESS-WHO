# 数据维护脚本

题库 JSON 在 `server/data/`。**游戏运行时不需要执行这些脚本**，仅在更新题库数据时使用。

完整玩法与数据结构说明见 **[docs/GAME_DESIGN.md](../docs/GAME_DESIGN.md)**。

## 数据来源

| 主题 | 数据源 | 说明 |
|------|--------|------|
| CS | [完美世界电竞](https://data.wanmei.com/csgo) | 阵容、Rating、头像 |
| CS | [Liquipedia](https://liquipedia.net/counterstrike) | 生日 `birthDate` |
| 足球 | 小红书世界杯球员数据 | 球员、俱乐部、年龄（2026 参考年） |
| NBA | [虎扑](https://nba.hupu.com) | 球员、球队、生日、季后赛、2025+ 出场（常规+季后合计） |
| 宝可梦 | [PokeAPI](https://pokeapi.co) | Gen 1–3 物种数据 |
| 动漫 | 手动维护 `anime.json` | 无自动爬虫 |

## 常用命令

```bash
# CS
npm run sync:csgo
npm run fetch:images:csgo
npm run patch:csgo:liquipedia:slow
npm run backfill:csgo:birthdates

# 足球
npm run sync:football:xhs
npm run filter:football:leagues

# NBA
npm run sync:nba
npm run filter:nba
npm run backfill:nba:birthdates
npm run backfill:nba:playoffs
npm run backfill:nba:games
npm run patch:nba:names

# 增量补全虎扑名单缺人
node scripts/sync-nba-missing-roster.js

# 宝可梦
npm run sync:pokemon
npm run patch:aliases          # 合并宝可梦/CS 搜索别名
```

## 目录结构

```
scripts/
├── cache/                     # 爬虫缓存（已 gitignore，非版本库内容）
├── lib/                       # 共享工具（虎扑、完美世界、Liquipedia 等）
├── sync-*.js                  # 全量同步
├── backfill-*.js              # 字段回填
├── filter-*.js                # 可玩池 / 联赛过滤
├── patch-*.js                 # 增量补丁
├── start-dev.ps1              # 开发启动（Windows）
└── kill-dev.ps1               # 停止 dev 进程
```

## 别名文件

| 文件 | 说明 |
|------|------|
| `server/data/aliases/pokemon-extra.json` | 宝可梦中文昵称，纳入版本库 |
| `server/data/aliases/csgo-nicknames.json` | CS 昵称（**可选**）；缺失时 `patch:aliases` 跳过 CS |

## 依赖

爬虫脚本需要 `puppeteer`（根目录 devDependencies）。Liquipedia 建议小批量 + 长延迟，必要时设置 `LIQUIPEDIA_PROXY`。
