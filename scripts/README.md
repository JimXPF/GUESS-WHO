# 数据维护脚本

题库 JSON 在 `server/data/`。以下脚本仅用于**更新题库**，游戏运行时不需要执行。

## 数据来源

| 主题 | 唯一数据源 | 说明 |
|------|-----------|------|
| **CS** | [完美世界电竞数据中心](https://data.wanmei.com/csgo) | 阵容、Rating、头像 |
| **CS** | [Liquipedia](https://liquipedia.net/counterstrike) | 生日 `birthDate` |
| **足球** | 小红书世界杯球员数据 | 球员、俱乐部、年龄（2026 参考年） |
| **NBA** | [虎扑](https://nba.hupu.com) | 球员、球队、生日、季后赛次数 |
| **动漫** | 手动维护 `anime.json` | 无自动爬虫 |

## 常用命令

```bash
# CS：同步 TOP30 战队阵容（完美世界）
npm run sync:csgo

# CS：补头像（完美世界）
npm run fetch:images:csgo

# CS：抓 Liquipedia 生日（慢速，防封）
npm run patch:csgo:liquipedia:slow

# CS：把 Liquipedia 缓存写入 csgo.json（不访问网络）
npm run backfill:csgo:birthdates

# CS：单队阵容补丁（完美世界）
npm run patch:csgo:team -- 3DMAX

# 足球：从小红书同步
npm run sync:football:xhs

# 足球：按允许联赛打标 / 过滤元数据
npm run filter:football:leagues

# NBA：从虎扑全量同步
npm run sync:nba

# NBA：补生日 / 季后赛（虎扑）
npm run backfill:nba:birthdates
npm run backfill:nba:playoffs

# NBA：修正中文名（虎扑 + 手动表）
npm run patch:nba:names
```

## 目录结构

```
scripts/
├── cache/
│   └── liquipedia-cache.json   # Liquipedia 抓取缓存
├── lib/
│   ├── birthdate-utils.js
│   ├── csgo-roster-utils.js
│   ├── hupu-nba.js
│   ├── image-utils.js
│   ├── liquipedia-csgo.js
│   ├── nba-name-lookup.js
│   ├── theme-data.js
│   ├── wanmei.js
│   └── xhs-worldcup.js
├── backfill-csgo-birthdates.js
├── backfill-nba-birthdates.js
├── backfill-nba-playoff-counts.js
├── backfill-all-birthdates.js
├── fetch-all-images.js         # CS 头像（完美世界）
├── filter-football-club-leagues.js
├── patch-csgo-liquipedia.js
├── patch-csgo-team.js
├── patch-nba-chinese-names.js
├── scrape-csgo-wanmei.js
├── sync-csgo-rosters-wanmei.js
├── sync-football-xhs.js
├── sync-nba-hupu-full.js
└── kill-dev.ps1
```

## 依赖

爬虫脚本需要 `puppeteer`（根目录 `devDependencies`）。Liquipedia 建议小批量 + 长延迟，必要时设置 `LIQUIPEDIA_PROXY`。
