# Guess Who — 游戏设计 & 生产部署说明

> 本文档描述 **全部玩法规则、特殊机制、题库结构、出题逻辑、API 与部署要点**，供接手开发团队直接用于生产环境实现与维护。  
> 代码入口：`server/services/gameService.ts`（核心状态机）、`server/services/compareEngine.ts`（字段比对）。

---

## 目录

1. [产品概览](#1-产品概览)
2. [游戏模式](#2-游戏模式)
3. [计分规则](#3-计分规则)
4. [通用猜题流程](#4-通用猜题流程)
5. [五大主题与特殊规则](#5-五大主题与特殊规则)
6. [比对引擎（命中 / 接近 / 未命中）](#6-比对引擎命中--接近--未命中)
7. [题库结构与数据文件](#7-题库结构与数据文件)
8. [出题逻辑](#8-出题逻辑)
9. [数据库与持久化](#9-数据库与持久化)
10. [API 与实时通信](#10-api-与实时通信)
11. [项目结构与关键模块](#11-项目结构与关键模块)
12. [部署与运维](#12-部署与运维)
13. [数据维护脚本](#13-数据维护脚本)

---

## 1. 产品概览

**Guess Who** 是一款多主题「猜人物」Web 游戏。玩家根据提示猜测隐藏角色，系统通过 **六项对比格**（或逐步提示）反馈各字段与答案的差距。

| 维度 | 内容 |
|------|------|
| 主题 | CS 选手、2026 世界杯足球、NBA、动漫人物、宝可梦（Gen 1–3） |
| 单人模式 | 经典六项、每日一题、逐步提示 |
| 多人模式 | 对战（2–5 人）、接龙（2–5 人，Socket.io） |
| 前端 | React 18 + TypeScript + Vite + Tailwind |
| 后端 | Express + sql.js（内存 SQLite + 落盘）+ Socket.io |
| 题库 | `server/data/*.json`，运行时加载，改 JSON 重启即生效 |

---

## 2. 游戏模式

### 2.1 经典：六项提示（`classic-six`）

| 项目 | 规则 |
|------|------|
| 初始机会 | **10 次** |
| 答对奖励 | **+2 次**（上限仍为 10） |
| 对比格 | 每题 **6 个字段**（宝可梦为动态字段，见 §5.5） |
| 首条提示 | 开局显示 **1 条** 主提示 |
| 额外提示 | 本题累计猜测 **3 / 6 / 9 次** 时各解锁 **1 条**（开局已预抽 3 个字段，按阈值展示） |
| 已命中字段 | 对比格中已 **命中（hit）** 的字段 **不会再作为额外提示** 出现 |
| 无效猜测 | 名字不在题库 → **不消耗次数** |
| 结束 | 次数耗尽 → `game_over`；可主动退出写入排行榜 |
| 下一题 | 答对后 `question_done`，用户点击「下一题」继续 |

### 2.2 每日一题（`daily-one`）

| 项目 | 规则 |
|------|------|
| 题目 | 每主题 **每天 1 题**（日期按 **UTC+8**） |
| 机会 | **20 次**（单局内） |
| 唯一性 | **每人每主题每日仅 1 次**（按浏览器设备 UUID：`localStorage` → 请求头 `X-User-Id` → `player_key` 为 `uid:…`；无头时回退 IP） |
| 已完成再开 | 返回 **409**，前端跳转成绩页 |
| 进行中再开 | **恢复** 同一会话 |
| 计分 | **不计分**；按 **猜测次数少 + 用时短** 排名 |
| 题目一致性 | 同日同主题所有玩家同一答案（种子：`hash(日期:主题)`） |
| 答对 | 立即 `game_over`，冻结计时 |
| 答错耗尽 | `failed`，揭晓答案，不入榜 |
| 排行榜 | `daily_leaderboard` 表 |

### 2.3 逐步提示（`progressive-hint`）

| 项目 | 规则 |
|------|------|
| 生命 | 整局 **3 条命**（`PROGRESSIVE_LIVES = 3`），跨题不重置 |
| 对比格 | **不显示** |
| 首条提示 | 见各主题合成规则（足球联赛/足联、NBA 赛区+位置等） |
| 猜测判定 | 每次猜测检查 **当前已解锁的全部提示** 是否命中 |
| 全部命中 + 答错 | **解锁下一条提示**（不扣命） |
| 未全部命中 | **扣 1 命**，停留当前提示轮，继续猜 |
| 答对 | 按本题猜测次数计分（同经典模式公式），进入 `question_done` |
| 命耗尽 | `game_over` |
| 下一题 | **生命不补充**，整局连贯保持当前剩余命数（开局 3 条） |

**示例（NBA）：**

```
提示1 — 中部赛区 · 中锋
  猜测1-1：勒布朗·詹姆斯  √太平洋赛区·后卫

提示2 — 洛杉矶快船
  猜测2-1：奥斯汀·里夫斯  √提示1  ×快船（-1命）
  猜测2-2：科怀·伦纳德    √提示1  √快船

提示3 — 后卫
  猜测3-1：马库斯·斯马特  √提示1  ×快船  √后卫（-1命）
  猜测3-2：乔丹·米勒      → 答对！
```

后续提示 **内容不重复**（按 `field:value` 去重）。

### 2.4 逆向轰炸（`reverse-bomb`）

| 项目 | 规则 |
|------|------|
| 提问 | **5 次**自主条件提问（`attempts_left`，`REVERSE_QUERY_ATTEMPTS = 5`） |
| 终极猜测 | **1 次**，不扣 `attempts_left`；`progressive_state` 标记 `finalGuessUsed` |
| 对比格 | **不显示** |
| 界面 | 顶部 Tag 面包屑 + 全量可玩池卡片网格 + 条件构建器 + 终极猜测输入 |
| 条件 | 玩家自选 `{ field, operator, value }`；数值型 `>=` / `<=`，枚举型 `==` / `!=` |
| 判定 | 后端检查隐藏 `answer_id` 是否满足条件 → `{ matched: true/false }` |
| 筛除 | 每条 Tag 根据 matched 与 operator 从存活池淘汰不一致卡片（见 `reverseBomb.ts`） |
| 字段/候选值 | 均基于 **当前存活池** 动态计算（`GET reverse-fields` / `reverse-values`） |
| 可查询字段 | `THEME_FIELD_DEFS` 全字段，排除 `learnableMove` |
| 答对 | `question_done`（单题结束） |
| 终极猜错 | `failed`，揭晓答案 |
| 排行榜 | **无** |

**`progressive_state` 示例：**

```json
{ "reverse": true, "finalGuessUsed": false }
```

**条件历史** 写入 `guesses.field_results`：

```json
{ "reverse": true, "condition": { "field": "type1", "operator": "==", "value": "火" }, "matched": true, "label": "属性1", "displayValue": "火" }
```

### 2.5 对战模式（`battle`）

| 项目 | 规则 |
|------|------|
| 人数 | 2–5 人（Socket.io 房间） |
| 题目池 | 房间共享 **30 题** 队列（种子随机） |
| 机会 | 每人 **10 次** |
| 规则 | 同经典六项（对比格 + 额外提示） |
| 答对 | 自动进入下一题 |
| 结束 | 全员次数耗尽或题池用尽 |
| 排行榜 | **无**（结算页展示） |

### 2.6 接龙模式（`relay-chain`）

| 项目 | 规则 |
|------|------|
| 人数 | 2–5 人，**轮流**猜测 |
| 机会 | 每人 **10 次** |
| 完全猜对 | **+300 分**，全员进入下一题，字段认领重置 |
| 部分命中 | 首次命中某对比字段 → 认领者 **+100** |
| 重复认领 | 命中已被他人认领的字段 → **-50** |
| 回合 | 非完全猜对时轮到下一位玩家 |
| 排行榜 | **无** |

---

## 3. 计分规则

### 3.1 经典 / 逐步 / 对战（按本题猜测次数）

| 本题猜测次数 | 得分 |
|-------------|------|
| 1 | 500 |
| 2 | 420 |
| 3 | 340 |
| 4+ | `max(100, 340 − (次数 − 3) × 55)` |

实现：`server/types.ts` → `scoreForQuestion()`

### 3.2 接龙模式

| 事件 | 分数 |
|------|------|
| 完全猜对 | +300 |
| 首次命中某字段 | +100 |
| 命中他人已认领字段 | −50 |

常量：`RELAY_FULL_CORRECT_BONUS`、`RELAY_FIELD_POINTS`、`RELAY_WRONG_CLAIM_PENALTY`

### 3.3 每日一题

- 不累计 `score`
- 榜单按 `attempts_used ASC, elapsed_us ASC` 排序

---

## 4. 通用猜题流程

```
开始游戏
  → pickRandomCharacter(theme)     // 足球/NBA 先过滤可玩池
  → resolveQuestionSetup()         // 生成 hint / activeFields / compareMove
  → 写入 sessions 表
  → 返回 GameSession（含 hint、hints、activeFields）

提交猜测 POST /api/game/guess
  → findCharacterByGuess()         // 精确匹配 name / aliases / englishName
  → 不在题库：返回 notInBank，不扣次
  → 在题库：compareAllFields() 或 progressive 判定
  → 更新 sessions + guesses 表
```

**名字匹配规则：**

- CS：匹配 `id`、`name`、`aliases`（玩家通常输入 ID，如 `NiKo`）
- 其他主题：匹配 `name`、`englishName`、`aliases`
- **仅精确匹配**（normalize 后相等），不做模糊提交

**搜索建议** `GET /api/game/suggest`：前缀 / 子序列模糊，仅用于下拉，不影响提交判定。

---

## 5. 五大主题与特殊规则

### 5.1 CS 选手（`csgo`）

| 对比字段（6） | team · nationality · age · rating · top20Count · position |
| 首条提示 | 从对比字段池中 **随机 1 个** |
| 额外提示 | 再随机 3 个（排除已展示 / 已命中） |
| 可玩过滤 | **无**（全库 147 人） |
| 备注 | 年龄由 `birthDate` 计算；国籍邻近见 `geo/nationality-regions.json` |

### 5.2 足球（`football`）

| 对比字段（6） | club · nationalTeam · age · marketValue · height · position |
| 首条提示 | **所属联赛** 或 **所属足联**，两者皆有则 **50/50 随机** |
| 合成字段 | `clubLeague`、`confederation` **不在对比格中**，仅作提示 |
| 额外提示 | club、nationalTeam、age、marketValue、height、position 中随机 3 个 |
| 年龄参考年 | **2026**（`meta.ageReferenceYear`） |
| 可玩过滤 | 联赛与足联 **至少有一个有效**；若联赛不在允许列表且无足联 → 排除 |

**允许作为答案的球员：**

1. 有有效足联映射（`meta.confederations[nationalTeam]`），或
2. 有有效联赛（`meta.clubLeagues[club]` 或球员 `clubLeague` 字段），且联赛在 `meta.allowedClubLeagues` 中

**允许联赛标签：** 英超、西甲、意甲、德甲、法甲、美职联、沙特联、J 联赛、K 联赛、中超

**逐步模式首提示：** 同上（联赛或足联）；后续可提示具体 club、nationalTeam 等，且不重复。

### 5.3 NBA（`nba`）

| 对比字段（6） | team · age · height · draft · playoffCount · position |
| 首条提示 | **赛区 · 位置** 合成（`divisionPosition`，如「中部赛区 · 中锋」；显示完整「XX赛区」） |
| 额外提示 | team、age、height、draft、playoffCount（**不含 position**，position 已在首提示） |
| 球队显示 | 中文队名（`meta.teams`） |
| 位置比对 | 猜测中文 vs 答案英文代码（`meta.positions`） |
| 可玩过滤 | `hasCareerSince2025 === true` 且 `max(totalGpSince2025, bestGpSince2025) >= 30`（见 `meta.playableMinTotalGpSince2025`） |
| 场数统计 | 2025 赛季起 **常规赛 + 季后赛** 合计；虎扑 headless 下优先读「本赛季常规/季后赛」区块 |

**逐步模式：** 首提示 `divisionPosition`；后续可提示具体 team、position 等。

### 5.4 动漫（`anime`）

| 对比字段（6） | anime · affiliation · race · occupation · age · powerLevel |
| 首条提示 | 固定 **作品（anime）** |
| 额外提示 | race、occupation、age、powerLevel（不含 affiliation） |
| 可玩过滤 | **无**（手动维护 `anime.json`） |
| 特殊接近 | race / occupation 通过 `position-groups.json` 分组判定 close |

### 5.5 宝可梦（`pokemon`）

| 对比字段 | **动态**，每题不同（非固定 6 项） |
| 范围 | 第一至第三世代（386 种） |
| 首条提示池 | category · ability · **eggGroup** · moveHint（随机 1 个） |
| 对比字段构成 | 必含 `type1` + 1 个随机种族值 + 最多 4 个可选项（type2、evolutionStage、category、ability、eggGroup） |
| moveHint 特殊 | 若首提示为 moveHint → 对比格加入 `learnableMove`，并选定 `compareMove` |
| 额外提示 | weaknessHint、moveHint 及 active 字段中的 bonus 字段（最多 3 个） |
| weaknessHint | 仅当对比格 **不含** type1/type2 时出现 |
| 蛋群接近 | 共享蛋群但单/双蛋群数量不同 → **close（黄）**，小字提示「答案为单蛋群/双蛋群」 |

实现：`server/services/pokemonQuestion.ts`、`pokemonHints.ts`、`compareEngine.compareEggGroup()`

---

## 6. 比对引擎（命中 / 接近 / 未命中）

核心：`server/services/compareEngine.ts`

### 6.1 结果类型

| 结果 | 含义 | UI |
|------|------|-----|
| `hit` | 完全匹配 | 绿色 |
| `close` | 接近 | 黄色 |
| `miss` | 未命中 | 灰色 |

### 6.2 数值接近阈值（`NUMERIC_RULES`）

| 主题 | 字段 | 规则 |
|------|------|------|
| CS | age | ±2 岁 |
| CS | rating | ±0.08 |
| CS | top20Count | ±1 |
| 足球 | age | ±2 |
| 足球 | marketValue | ±20% |
| 足球 | height | ±3 cm |
| NBA | age | ±2 |
| NBA | height | ±3 cm |
| NBA | playoffCount | ±1 |
| 动漫 | age | ±5 |
| 动漫 | powerLevel | ±8 |
| 宝可梦 | 各项种族值 | ±15；总和 ±30 |

### 6.3 其他特殊比对

| 类型 | 规则 |
|------|------|
| 国籍 / 国家队 | `nationality-regions.json` 地理邻近组 |
| 位置 | 精确或同组 → close |
| NBA 选秀 | 同年不同轮次 → close；提供早晚方向 hint |
| 蛋群 | 见 §5.5 |
| team / club / anime | 子串包含 → close |
| club / type2 | 可空精确匹配 |

### 6.4 额外提示与已命中字段

经典模式中，`collectHitFields()` 收集对比格 `hit` 字段，`buildSessionHints()` 用 `hitFields.has(field)` 跳过，**已猜中的对比字段不会再出现在额外提示里**。

> 合成提示字段（如 `divisionPosition`、`confederation`）不在对比格内，故不受此规则影响。

---

## 7. 题库结构与数据文件

### 7.1 目录

```
server/data/
├── csgo.json                 # CS 选手
├── football.json             # 足球 + meta（足联/联赛映射）
├── nba.json                  # NBA + meta（球队/赛区/位置/可玩阈值）
├── anime.json                # 动漫（手动维护）
├── pokemon.json              # 宝可梦 Gen 1–3
├── pokemon-type-chart.json   # 属性克制表（弱点计算）
├── position-groups.json      # 位置/种族/职业分组（close 判定）
├── geo/nationality-regions.json
└── aliases/
    ├── pokemon-extra.json    # 宝可梦中文昵称（patch 脚本合并）
    └── csgo-nicknames.json   # CS 昵称（可选）
```

### 7.2 JSON 文件外壳（Envelope）

所有主题 JSON 支持两种形态；**推荐形态 B**：

```json
// 形态 A：纯数组（旧版，仍兼容）
[{ "id": "...", "name": "...", ... }]

// 形态 B：带元数据（推荐）
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "players": [ ... ],
  "meta": { ... }              // 仅 football / nba 等有映射表的主题
}
```

运行时加载：`server/services/dataLoader.ts` → `readThemeFile()` → `getBank(theme)`。

### 7.3 字段角色说明（全主题通用）

| 角色 | 含义 | 示例 |
|------|------|------|
| **身份** | 唯一 ID、显示名、搜索与提交匹配 | `id`, `name`, `aliases` |
| **对比** | 出现在对比格，参与 hit/close/miss | CS `team`、NBA `height` |
| **提示** | 仅作 hint，不在对比格（或合成字段） | NBA `divisionPosition`、足球 `confederation` |
| **过滤** | 决定能否成为随机答案 | NBA `hasCareerSince2025`, `totalGpSince2025` |
| **入库** | 脚本写入、展示或计算用，不参与对比 | `imageUrl`, `birthDate`, `xhsPlayerId` |
| **运行时** | 不出现在 JSON，会话内生成 | 宝可梦 `compareMove`、足球 `clubLeague`（由 meta 推导） |

**猜测提交**只匹配：`name` / `englishName` / `aliases`（CS 另含 `id`）。  
**搜索建议** `GET /api/game/suggest` 可分段匹配别名（如「阿伦」→ 贾勒特·阿伦）。

---

### 7.4 CS 选手（`csgo.json`）

**文件：** `server/data/csgo.json`  
**规模（参考）：** 147 人，**无**可玩过滤（全库可出题）

#### 7.4.1 对比字段（固定 6 项）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `team` | string | ✓ | 战队中文/英文名 |
| `nationality` | string | ✓ | 国籍；close 用 `geo/nationality-regions.json` |
| `age` | number | ✓ | 年龄；优先由 `birthDate` 动态计算 |
| `rating` | number | ✓ | 近三月 Rating |
| `top20Count` | number | ✓ | TOP20 次数 |
| `position` | string | ✓ | 位置（指挥/步枪手/狙击手等） |

#### 7.4.2 入库字段（非对比）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 选手 ID（如 `NiKo`），**也是 CS 的显示名与提交名** |
| `name` | string | 通常同 `id` |
| `aliases` | string[] | 搜索别名 |
| `birthDate` | string | `YYYY-MM-DD`，Liquipedia 回填 |
| `imageUrl` | string | 头像 CDN |
| `wanmeiId` | string | 完美世界源 ID |
| `sniperStat` | number | 狙击相关统计（入库，非对比） |

#### 7.4.3 提示字段

| 字段 | 首/额外 | 说明 |
|------|---------|------|
| 对比池 6 项 | 首提示随机 1 + 额外 3 | 与对比格同源 |

#### 7.4.4 单条示例

```json
{
  "id": "aleksib",
  "name": "Aleksib",
  "aliases": ["aleksib", "Aleksib"],
  "team": "Natus Vincere",
  "nationality": "芬兰",
  "rating": 0.88,
  "top20Count": 0,
  "position": "指挥",
  "age": 29,
  "birthDate": "1997-03-30",
  "imageUrl": "https://...",
  "wanmeiId": "9816",
  "sniperStat": 0
}
```

---

### 7.5 足球（`football.json`）

**文件：** `server/data/football.json`  
**规模（参考）：** ~1248 条；可玩池 = 至少有效 **联赛** 或 **足联** 之一

#### 7.5.1 对比字段（固定 6 项）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `club` | string | ✓ | 俱乐部中文名 |
| `nationalTeam` | string | ✓ | 国家队中文名 |
| `age` | number | ✓ | 以 `meta.ageReferenceYear`（2026）为基准 |
| `marketValue` | number | ✓ | 身价（万欧元） |
| `height` | number | ✓ | 身高 cm |
| `position` | string | ✓ | 前锋/中场/后卫/门将 |

#### 7.5.2 入库字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | slug，如 `amine-gouiri` |
| `name` | string | 中文名 |
| `englishName` | string | 英文名 |
| `aliases` | string[] | 搜索别名 |
| `imageUrl` | string | 头像 |
| `xhsPlayerId` | number | 小红书源 ID |
| `clubLeague` | string | 可选；球员级联赛标签，缺省用 `meta.clubLeagues[club]` |

#### 7.5.3 提示专用（运行时/meta 推导，不在对比格）

| 字段 | 来源 | 说明 |
|------|------|------|
| `confederation` | `meta.confederations[nationalTeam]` | 如「欧足联球员」 |
| `clubLeague` | `meta.clubLeagues[club]` 或球员字段 | 如「英超球员」 |

首提示：`clubLeague` 与 `confederation` 二选一随机（两者皆有则 50/50）。

#### 7.5.4 `meta` 表结构

| 键 | 类型 | 说明 |
|----|------|------|
| `confederations` | `Record<国家队中文名, 足联标签>` | 如 `"法国" → "欧足联球员"` |
| `clubLeagues` | `Record<俱乐部中文名, 联赛标签>` | 如 `"马赛" → "法甲球员"` |
| `allowedClubLeagues` | `string[]` | 允许出题的联赛标签列表 |
| `ageReferenceYear` | number | 年龄计算基准年（2026） |

**可玩条件（`isPlayableFootballAnswer`）：**

1. 有有效 `confederations[nationalTeam]`，或  
2. 有有效联赛且联赛 ∈ `allowedClubLeagues`

#### 7.5.5 单条示例

```json
{
  "id": "amine-gouiri",
  "name": "阿明·古伊里",
  "englishName": "Amine Gouiri",
  "aliases": ["Amine Gouiri", "Gouiri", "古伊里"],
  "club": "马赛",
  "nationalTeam": "阿尔及利亚",
  "age": 26,
  "marketValue": 2800,
  "height": 180,
  "position": "前锋",
  "imageUrl": "https://...",
  "xhsPlayerId": 86986
}
```

---

### 7.6 NBA（`nba.json`）

**文件：** `server/data/nba.json`  
**规模（参考）：** 538 条入库；虎扑现役名单 522；可玩 ~415（GP≥30）

#### 7.6.1 对比字段（固定 6 项）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `team` | string | ✓ | 球队**英文代码**（如 `Cavaliers`），展示用 `meta.teams` |
| `age` | number | ✓ | 优先由 `birthDate` 计算 |
| `height` | number | ✓ | 身高 cm |
| `draft` | string | ✓ | 如 `2017年第1轮`、`落选秀` |
| `playoffCount` | number | ✓ | 进入季后赛的赛季数 |
| `position` | string | ✓ | 英文代码（`C`/`G`/`F`/`G-F` 等），展示用 `meta.positions` |

#### 7.6.2 过滤与场数字段（入库，不参与对比）

| 字段 | 类型 | 说明 |
|------|------|------|
| `hasCareerSince2025` | boolean | 2025 赛季起有常规/季后赛或「本赛季」数据 |
| `totalGpSince2025` | number | 2025 起各赛季 `games` **求和** |
| `bestGpSince2025` | number | `max(本赛季常规+季后合计, 生涯表单赛季最高)` |
| `maxCareerGpSince2025` | number | 生涯表中 2025+ 单赛季最高场数 |
| `currentSeasonGp` | number | 当前赛季常规+季后赛合计（虎扑「本赛季」区块） |
| `careerGpSince2025` | object[] | 分项明细，见下表 |
| `careerRegularYears` | number[] | 生涯常规赛表出现过的年份 |

**`careerGpSince2025[]` 元素：**

| 子字段 | 类型 | 说明 |
|--------|------|------|
| `year` | number | 赛季年（虎扑口径，如 2025） |
| `team` | string | 球队中文 |
| `regularGames` | number | 该年常规赛场次 |
| `playoffGames` | number | 该年季后赛场次 |
| `games` | number | `regularGames + playoffGames` |

**可玩判定（`isPlayableNBAAnswer`）：**

```
gp = max(totalGpSince2025, bestGpSince2025)
可玩 ⟺ hasCareerSince2025 === true && gp >= meta.playableMinTotalGpSince2025 (30)
```

#### 7.6.3 入库字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | slug，如 `jarrett-allen`（虎扑 URL 可能无连字符） |
| `name` | string | 中文名 |
| `englishName` | string | 英文名 |
| `aliases` | string[] | 含姓、 hyphen 变体（如「阿伦」） |
| `birthDate` | string | `YYYY-MM-DD` |
| `school` | string | 大学中文名 |
| `imageUrl` | string | 虎扑 CDN 头像 |

#### 7.6.4 提示专用（合成，不在对比格）

| 字段 | 说明 |
|------|------|
| `divisionPosition` | 运行时合成：`meta.divisions[team]` 去「球员」后缀 + `meta.positions[position]`，如「中部赛区 · 中锋」 |
| `division` | 仅搜索 sublabel 用，同赛区中文 |

#### 7.6.5 `meta` 表结构

| 键 | 类型 | 说明 |
|----|------|------|
| `teams` | `Record<球队代码, 中文队名>` | 如 `"Cavaliers" → "骑士"` |
| `divisions` | `Record<球队代码, 赛区标签>` | 如 `"Cavaliers" → "中部赛区球员"` |
| `positions` | `Record<位置代码, 中文>` | 如 `"C" → "中锋"` |
| `schools` | `Record<英文校名, 中文校名>` | 同步脚本查中文校名 |
| `playableMinTotalGpSince2025` | number | 可玩最低场数，默认 **30** |
| `playableGamesPolicy` | string | 固定 `filterAtLoadTime` |

#### 7.6.6 单条示例（贾勒特·阿伦）

```json
{
  "id": "jarrett-allen",
  "name": "贾勒特·阿伦",
  "englishName": "Jarrett Allen",
  "aliases": ["Jarrett Allen", "Allen", "贾勒特-阿伦", "阿伦"],
  "team": "Cavaliers",
  "age": 28,
  "height": 211,
  "school": "德克萨斯大学",
  "draft": "2017年第1轮",
  "playoffCount": 5,
  "position": "C",
  "birthDate": "1998-04-21",
  "hasCareerSince2025": true,
  "totalGpSince2025": 72,
  "bestGpSince2025": 72,
  "currentSeasonGp": 72,
  "careerGpSince2025": [
    { "year": 2025, "team": "骑士", "regularGames": 54, "playoffGames": 18, "games": 72 }
  ],
  "imageUrl": "https://gdc.hupucdn.com/..."
}
```

---

### 7.7 动漫（`anime.json`）

**文件：** `server/data/anime.json`（**手动维护**）  
**规模（参考）：** 146 人，无过滤

#### 7.7.1 对比字段（固定 6 项）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `anime` | string | ✓ | 作品名 |
| `affiliation` | string | ✓ | 组织/阵营 |
| `race` | string | ✓ | 种族；close 用 `position-groups.json` |
| `occupation` | string | ✓ | 职业 |
| `age` | number | ✓ | 年龄 |
| `powerLevel` | number | ✓ | 战斗力 0–100 |

#### 7.7.2 入库字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | slug |
| `name` | string | 中文名 |
| `aliases` | string[] | 搜索别名 |
| `height` | number | 可选，入库不对比 |
| `imageUrl` | string | 头像 |

#### 7.7.3 提示

| 字段 | 首/额外 |
|------|---------|
| `anime` | 固定首提示 |
| `race`, `occupation`, `age`, `powerLevel` | 额外提示池（不含 `affiliation`） |

---

### 7.8 宝可梦（`pokemon.json`）

**文件：** `server/data/pokemon.json`  
**范围：** 第一至第三世代（386 种），无过滤

#### 7.8.1 对比字段（**动态**，每题 4–6 项）

由 `buildPokemonQuestion()` 生成，写入 session 的 `active_fields`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `type1` | string | 属性 1（**每题必有**） |
| `type2` | string | 属性 2，可空 |
| `evolutionStage` | string | 未进化 / 1阶进化 / 2阶进化 |
| `category` | string | 分类，如「种子宝可梦」 |
| `ability` | string | 常见特性 |
| `eggGroup` | string | 蛋群，如「怪兽、植物」 |
| `hp`…`speed` | number | 单项种族值（随机选 1 项入格） |
| `baseStatTotal` | number | 种族值总和 |
| `learnableMove` | string | 仅当首提示为 `moveHint` 时加入对比 |

#### 7.8.2 入库字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 英文 slug，如 `bulbasaur` |
| `name` | string | 中文名 |
| `englishName` | string | 英文名 |
| `aliases` | string[] | 含 `aliases/pokemon-extra.json` 合并昵称 |
| `dexNumber` | number | 全国图鉴编号 |
| `hiddenAbility` | string | 隐藏特性 |
| `gen3LevelMoves` | string[] | 三代升级招式池（`moveHint` 用） |
| `imageUrl` | string | 官方立绘 URL |

#### 7.8.3 提示专用（运行时）

| 字段 | 说明 |
|------|------|
| `weaknessHint` | 属性弱点描述（对比格无 type1/type2 时可用） |
| `moveHint` | 「可学会 XXX」；并选定 `compareMove` 写入 session |
| `compareMove` | 存在 `sessions.question_compare_move`，非 JSON 字段 |

#### 7.8.4 依赖文件

| 文件 | 用途 |
|------|------|
| `pokemon-type-chart.json` | 属性克制 → 弱点提示 |
| `aliases/pokemon-extra.json` | 中文昵称 patch |

---

### 7.9 辅助 JSON（非球员列表）

| 文件 | 结构 | 用途 |
|------|------|------|
| `position-groups.json` | `{ "groups": { "组名": ["值", ...] } }` | 动漫 race/occupation、足球/NBA 位置 close |
| `geo/nationality-regions.json` | 地理邻近组 | CS/足球国籍 close |
| `pokemon-type-chart.json` | 属性 → 克制关系 | 宝可梦 weaknessHint |

---

### 7.10 可玩池规模（参考，2026-06）

| 主题 | 入库条目 | 可玩条目 | 过滤规则 |
|------|---------|---------|----------|
| csgo | 147 | 147 | 无 |
| football | ~1248 | 视联赛/足联 | §7.5.4 |
| nba | 538 | ~415 | 2025+ & GP≥30 |
| anime | 146 | 146 | 无 |
| pokemon | 386 | 386 | 无 |

---

### 7.11 各主题字段速查总表

| 主题 | 对比 6 项 | 首提示 | 过滤 |
|------|-----------|--------|------|
| csgo | team, nationality, age, rating, top20Count, position | 对比池随机 1 | 无 |
| football | club, nationalTeam, age, marketValue, height, position | clubLeague 或 confederation | 联赛/足联有效 |
| nba | team, age, height, draft, playoffCount, position | divisionPosition | hasCareerSince2025 + GP |
| anime | anime, affiliation, race, occupation, age, powerLevel | anime | 无 |
| pokemon | 动态（见 §7.8.1） | category/ability/eggGroup/moveHint 随机 | 无 |

---

## 8. 出题逻辑

### 8.1 总流程

```
pickRandomCharacter(theme)
  └─ football → isPlayableFootballAnswer
  └─ nba      → isPlayableNBAAnswer

resolveQuestionSetup(theme, answer)
  ├─ pokemon → buildPokemonQuestion(answer)   // 动态字段 + 首提示
  └─ 其他    → pickActiveFields + pickQuestionHints
```

### 8.2 各主题首提示 & 额外提示字段

| 主题 | 首提示 | 额外 3 字段来源 |
|------|--------|----------------|
| anime | `anime` | hint 池随机（排除 anime、affiliation） |
| football | `clubLeague` 或 `confederation` | getFootballHintFields 随机 |
| nba | `divisionPosition` | getNBAExtraHintFields 随机 |
| csgo | hint 池随机 | 继续随机 3 个 |
| pokemon | buildPokemonQuestion 内随机 | getPokemonBonusHintFields |

额外提示展示阈值：**第 3 / 6 / 9 次** 猜测后各显示 1 条。

### 8.3 每日一题

```
date = UTC+8 的 YYYY-MM-DD
seed = hash(`${date}:${theme}`)
→ 确定性 pickRandomCharacter + resolveQuestionSetup
→ 写入 daily_challenges（UNIQUE date+theme）
```

### 8.4 逐步提示队列

`server/services/progressiveQueue.ts` → `buildProgressiveHintQueueFromSetup()`

| 主题 | 队列顺序 |
|------|---------|
| football | 首：联赛或足联 → 其余 hint 字段 shuffle |
| nba | 首：divisionPosition → team/age/height/draft/playoffCount shuffle |
| pokemon | 首：setup.hintField → active + bonus 字段去重 shuffle |
| anime | 首：setup.hintField → 排除 anime/affiliation shuffle |
| csgo | 首：setup.hintField → 标准 hint 池 shuffle |

解锁下一条时按 `field:value` 去重，避免提示内容重复。

---

## 9. 数据库与持久化

**引擎：** sql.js（WASM SQLite，内存读写 + debounce 落盘）

**路径：** `DB_PATH` 环境变量，默认项目根 `guess-who.db`，不可写时 fallback 到系统 temp。

### 9.1 表结构（完整）

**引擎：** sql.js（WASM SQLite）  
**文件：** `DB_PATH` 环境变量，默认 `guess-who.db`

#### `sessions` — 游戏会话

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `player_name` | TEXT | NOT NULL | 玩家昵称 |
| `theme` | TEXT | NOT NULL | `csgo` \| `football` \| `nba` \| `anime` \| `pokemon` |
| `game_mode` | TEXT | NOT NULL DEFAULT `'classic-six'` | 游戏模式 |
| `answer_id` | TEXT | NOT NULL | 当前题答案 `id` |
| `hint_field` | TEXT | NOT NULL | 首条提示字段名 |
| `extra_hint_fields` | TEXT | NOT NULL DEFAULT `'[]'` | JSON 数组，预抽 3 个额外提示字段 |
| `active_fields` | TEXT | NOT NULL DEFAULT `'[]'` | JSON 数组，本题对比格字段顺序 |
| `question_compare_move` | TEXT | NULL | 宝可梦：本题比对招式名 |
| `used_answer_ids` | TEXT | NOT NULL DEFAULT `'[]'` | JSON 数组，已出答案防重复 |
| `attempts_left` | INTEGER | NOT NULL DEFAULT 10 | 剩余猜测次数 |
| `score` | INTEGER | NOT NULL DEFAULT 0 | 累计得分（每日模式为 0） |
| `correct_count` | INTEGER | NOT NULL DEFAULT 0 | 答对题数 |
| `question_attempts` | INTEGER | NOT NULL DEFAULT 0 | 本题已猜次数 |
| `question_index` | INTEGER | NOT NULL DEFAULT 0 | 累计题序 |
| `status` | TEXT | NOT NULL DEFAULT `'playing'` | `playing` \| `question_done` \| `game_over` \| `quit` \| `failed` |
| `started_at_hrtime` | TEXT | NULL | 每日模式高精度计时起点 JSON |
| `elapsed_us` | INTEGER | NULL | 每日模式已用微秒 |
| `progressive_state` | TEXT | NOT NULL DEFAULT `'{}'` | 逐步模式 JSON（见 §2.3 `ProgressiveState`） |
| `room_code` | TEXT | NULL | 多人房间码 |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |
| `updated_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |

#### `guesses` — 猜测记录

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `session_id` | TEXT | NOT NULL, FK → sessions(id) | |
| `guess_name` | TEXT | NOT NULL | 用户输入文本 |
| `guess_id` | TEXT | NULL | 匹配到的题库 `id` |
| `is_correct` | INTEGER | NOT NULL DEFAULT 0 | 0/1 是否答对 |
| `field_results` | TEXT | NULL | JSON：`FieldCompare[]` 或逐步模式对象 |
| `question_index` | INTEGER | NOT NULL DEFAULT 0 | 所属题序 |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |

**索引：** `idx_guesses_session (session_id)`

#### `leaderboard` — 经典模式总榜

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `player_name` | TEXT | NOT NULL | |
| `theme` | TEXT | NOT NULL | |
| `game_mode` | TEXT | NOT NULL DEFAULT `'classic-six'` | |
| `total_score` | INTEGER | NOT NULL | |
| `correct_count` | INTEGER | NOT NULL | |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |

**索引：** `idx_leaderboard_score (total_score DESC)`，`idx_leaderboard_mode (game_mode, theme, total_score DESC)`

#### `daily_challenges` — 每日题目（全员同题）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `challenge_date` | TEXT | NOT NULL | UTC+8，`YYYY-MM-DD` |
| `theme` | TEXT | NOT NULL | |
| `answer_id` | TEXT | NOT NULL | |
| `hint_field` | TEXT | NOT NULL | |
| `extra_hint_fields` | TEXT | NOT NULL DEFAULT `'[]'` | |
| `active_fields` | TEXT | NOT NULL DEFAULT `'[]'` | |
| `question_compare_move` | TEXT | NULL | |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |

**唯一约束：** `UNIQUE(challenge_date, theme)`

#### `daily_leaderboard` — 每日成功榜

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `challenge_date` | TEXT | NOT NULL | |
| `theme` | TEXT | NOT NULL | |
| `player_name` | TEXT | NOT NULL | |
| `attempts_used` | INTEGER | NOT NULL | 越少越好 |
| `elapsed_us` | INTEGER | NOT NULL | 用时微秒，越少越好 |
| `completed_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |

**唯一约束：** `UNIQUE(challenge_date, theme, player_name)`  
**索引：** `idx_daily_lb (challenge_date, theme, attempts_used, elapsed_us)`

#### `daily_player_attempts` — 每人每主题每日一次

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `challenge_date` | TEXT | NOT NULL | |
| `theme` | TEXT | NOT NULL | |
| `player_key` | TEXT | NOT NULL | `uid:{deviceUuid}` 或回退 `ip:{address}` |
| `player_name` | TEXT | NOT NULL | |
| `session_id` | TEXT | NOT NULL | 关联 sessions |
| `status` | TEXT | NOT NULL DEFAULT `'playing'` | `playing` \| `game_over` \| `failed` \| `quit` |
| `attempts_used` | INTEGER | NULL | 结束时写入 |
| `elapsed_us` | INTEGER | NULL | 结束时写入 |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |
| `completed_at` | TEXT | NULL | |

**唯一约束：** `UNIQUE(challenge_date, theme, player_key)`  
**索引：** `idx_daily_attempts_session (session_id)`

#### ER 关系（简图）

```
daily_challenges (date, theme) ──1:N──▶ 同日同主题所有玩家同一 answer_id
daily_player_attempts ──N:1──▶ sessions ──1:N──▶ guesses
daily_player_attempts (game_over) ──▶ daily_leaderboard（成功时写入）
sessions (quit/game_over, classic-six) ──▶ leaderboard
```

### 9.2 生产迁移建议

单实例小流量可直接使用 sql.js。多实例 / 高并发建议迁移至 PostgreSQL 等外部数据库（扣子平台内置 PG 可作为目标）。

---

## 10. API 与实时通信

### 10.1 REST

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/game/start` | 开始（body: playerName, theme, gameMode） |
| GET | `/api/game/suggest?theme&q` | 搜索建议 |
| POST | `/api/game/guess` | 提交猜测（有 room_code 时拒绝，改走 Socket） |
| POST | `/api/game/next` | 下一题（daily-one 不可用） |
| POST | `/api/game/quit` | 退出并保存经典榜 |
| GET | `/api/game/reverse-fields?sessionId` | 逆向轰炸：存活池可用字段 |
| GET | `/api/game/reverse-values?sessionId&field` | 逆向轰炸：字段候选值（enum / min-max-median） |
| POST | `/api/game/reverse-query` | 逆向轰炸：提交条件 `{ sessionId, condition }` |
| GET | `/api/game/:sessionId` | 恢复会话 |
| GET | `/api/leaderboard?gameMode&theme&limit` | 排行榜 |
| GET | `/api/leaderboard/daily/today?theme&playerName` | 今日每日题信息 |

生产环境：`npm run build` 后 Express 托管 `client/dist` 静态资源。

### 10.2 Socket.io（`/socket.io`）

| 事件 | 方向 | 说明 |
|------|------|------|
| `room:create` | C→S | 创建房间 |
| `room:join` | C→S | 加入房间 |
| `room:guess` | C→S | 多人模式猜测 |
| `room:leave` | C→S | 离开 |
| `room:state` | S→C | 房间快照 |
| `game:start` | S→C | 开始 |
| `game:finished` | S→C | 结束 |

### 10.3 前端路由

| 路径 | 页面 |
|------|------|
| `/` | 首页（选模式/主题） |
| `/game` | 单人游戏 |
| `/lobby` | 多人大厅 |
| `/multiplayer` | 多人对局 |
| `/settlement` | 多人结算 |
| `/result` | 单人结束 |
| `/leaderboard` | 排行榜 |

---

## 11. 项目结构与关键模块

```
guess-who/
├── client/                    # React 前端
│   └── src/
│       ├── pages/GamePage.tsx
│       ├── components/ProgressivePanel.tsx
│       └── hooks/useGameRoom.ts
├── server/
│   ├── index.ts               # Express + Socket.io 入口
│   ├── db.ts                  # sql.js 持久化
│   ├── routes/                # game / leaderboard 路由
│   ├── data/                  # JSON 题库（运行时只读）
│   └── services/
│       ├── gameService.ts     # ★ 核心状态机
│       ├── compareEngine.ts   # ★ 字段比对
│       ├── dataLoader.ts      # 题库加载 / 搜索 / 随机选题
│       ├── activeFields.ts    # 非宝可梦固定 6 字段
│       ├── footballHints.ts   # 足球合成提示 & 可玩过滤
│       ├── nbaHints.ts        # NBA 合成提示 & 可玩过滤
│       ├── pokemonQuestion.ts # 宝可梦动态出题
│       ├── pokemonHints.ts    # 弱点 / 招式提示
│       ├── progressiveHint.ts # 逐步模式状态机
│       ├── progressiveQueue.ts
│       ├── dailyChallenge.ts  # 每日一题
│       ├── roomService.ts     # 多人房间
│       └── relayScoring.ts    # 接龙计分
├── scripts/                   # 数据维护（非运行时）
└── docs/GAME_DESIGN.md        # 本文档
```

---

## 12. 部署与运维

### 12.1 本地开发

```bash
npm install
npm install --prefix client
npm run dev          # 前端 :5173 + 后端 :3001
```

Windows 一键：`start.bat`（拉代码 → 安装 → dev）

### 12.2 生产构建

```bash
npm run build        # client build + server tsc
npm start            # node dist/server/index.js，默认 PORT=3001
```

环境变量：

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口 |
| `DB_PATH` | SQLite 文件路径 |
| `DB_SAVE_DEBOUNCE_MS` | 落盘 debounce（默认 400ms） |

### 12.3 注意事项

- sql.js 需 WASM 文件：构建脚本会将 `sql-wasm.wasm` 复制到 `dist/`
- 题库 JSON 体积较大，建议 CDN 托管 `imageUrl` 外链
- 爬虫脚本依赖 `puppeteer`，**不应**打入生产镜像

---

## 13. 数据维护脚本

脚本位于 `scripts/`，**游戏运行时不需要执行**。详见 [`scripts/README.md`](../scripts/README.md)。

### 13.1 npm 命令

| npm 命令 | 脚本 | 用途 |
|----------|------|------|
| `sync:csgo` | `sync-csgo-rosters-wanmei.js` | CS 阵容全量 |
| `sync:football:xhs` | `sync-football-xhs.js` | 足球全量 |
| `sync:nba` | `sync-nba-hupu-full.js` | NBA 全量重建（虎扑） |
| `sync:pokemon` | `sync-pokemon-pokeapi.js` | 宝可梦 Gen1–3 |
| `filter:nba` | `filter-nba-playable.js` | 更新 `hasCareerSince2025` 等（**默认不删人**；`--prune` 才删除） |
| `filter:football:leagues` | `filter-football-club-leagues.js` | 联赛 meta |
| `backfill:nba:games` | `backfill-nba-games-since-2025.js` | 回填 GP 场数（`--force` 全量重抓） |
| `backfill:nba:birthdates` | `backfill-nba-birthdates.js` | NBA 生日 |
| `backfill:nba:playoffs` | `backfill-nba-playoff-counts.js` | 季后赛次数 |
| `patch:aliases` | `patch-search-aliases.js` | 合并搜索别名 |
| `patch:nba:names` | `patch-nba-chinese-names.js` | NBA 中文名补丁 |

### 13.2 补充脚本（无 npm 别名）

| 命令 | 用途 |
|------|------|
| `node scripts/sync-nba-missing-roster.js` | **增量**补虎扑名单缺人（不重建全库） |

### 13.3 NBA 同步注意事项

- 虎扑 headless 下 **生涯表常截断**；场数以「本赛季常规赛/季后赛」Tab 为准（常规+季后合计）。
- `filter-nba-playable.js` **勿随意加 `--prune`**，否则 flaky 抓取会误删球星。
- 全量 `backfill --force` 约 538×10s，耗时长；日常用增量 `sync-nba-missing-roster` + 无 `--force` 的 backfill 即可。

### 13.4 别名与缓存

| 文件 | 说明 |
|------|------|
| `server/data/aliases/pokemon-extra.json` | 宝可梦中文昵称，纳入版本库 |
| `server/data/aliases/csgo-nicknames.json` | CS 昵称（**可选**） |
| `scripts/cache/` | 爬虫日志/缓存，已 gitignore |

---

## 附录 A：常量速查

```typescript
MAX_ATTEMPTS = 10
DAILY_MAX_ATTEMPTS = 20
PROGRESSIVE_LIVES = 3
REVERSE_QUERY_ATTEMPTS = 5
BONUS_HINT_THRESHOLDS = [3, 6, 9]
RELAY_FULL_CORRECT_BONUS = 300
RELAY_FIELD_POINTS = 100
RELAY_WRONG_CLAIM_PENALTY = 50
```

## 附录 B：GameMode / Theme 枚举

```typescript
type GameMode = 'classic-six' | 'daily-one' | 'progressive-hint' | 'reverse-bomb' | 'battle' | 'relay-chain'
type Theme = 'csgo' | 'football' | 'nba' | 'anime' | 'pokemon'
```

---

*文档版本与代码同步至 2026-06-29。规则与字段以 `server/types.ts`、`server/db.ts`、`server/data/*.json` 为准；变更时请同步更新本文件。*
