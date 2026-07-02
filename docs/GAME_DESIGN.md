# Guess Who — 游戏设计文档

> **用途**：供 AI 或接手开发者快速理解玩法、实现逻辑、题库结构与工程架构。  
> **代码入口**：`server/services/gameService.ts`（状态机）、`compareEngine.ts`（比对）、`reverseBomb.ts` / `progressiveHint.ts`（模式专项）。

---

## 文档结构

| 章节 | 内容 |
|------|------|
| [§0 PWA 接入待替换](#0-pwa-电竞平台接入待替换) | 身份、房间、会话等需对接平台的项 |
| [§一 游戏玩法](#一游戏玩法) | 面向玩家/产品的规则说明 |
| [§二 实现逻辑](#二实现逻辑) | 出题、状态机、特殊处理（开发必读） |
| [§三 题库与字段](#三题库与字段设计) | JSON 结构、四主题字段速查 |
| [§四 技术架构](#四技术架构) | 栈、DB、API、部署 |

---

## 0. PWA 电竞平台接入待替换

当前为**独立 Web 小游戏**实现；嵌入 PWA 电竞平台后，下列标识与存储需替换为**平台统一身份与房间服务**（标注 🔴）。

| 现状 | 位置 | 平台接入方案（待实现） |
|------|------|------------------------|
| **玩家昵称** `player_name` | 首页手填 → `POST /api/game/start` body | 🔴 改用平台 **userId + displayName**，禁止客户端自填唯一标识 |
| **用户唯一键** `player_key` | `daily_player_attempts.player_key`；`getClientKey()` | 🔴 现为 `uid:{localStorage UUID}` 或回退 `ip:`；改为 **平台 userId** |
| **请求头** `X-User-Id` | `client/src/api.ts` 注入；`server/utils/clientKey.ts` 读取 | 🔴 改为平台 **JWT / Session Token**，服务端验签后取 userId |
| **会话 ID** `sessions.id` | UUID v4，前端 `localStorage` `guess-who-session-id` | 🔴 可保留局内 UUID，或改为平台 **matchId**；需定义恢复/断线策略 |
| **多人房间码** `room_code` | 内存 Map + 6 位随机码（`roomService.ts`） | 🔴 改为平台 **Lobby / Room ID**；房间生命周期由平台或 Redis 管理 |
| **Socket 连接** | 无鉴权，`/socket.io` 明文 join | 🔴 握手携带平台 token；房间权限校验 |
| **排行榜键** | `leaderboard.player_name` 文本 | 🔴 改为 **userId** 存榜 + displayName 展示；防同名冲突 |
| **每日限次** | `UNIQUE(challenge_date, theme, player_key)` | 🔴 `player_key` → 平台 userId |
| **接龙认领** `FieldClaim.playerName` | 房间内显示名 | 🔴 绑定 userId，展示用平台昵称 |

**暂可保留（局内逻辑）**：`answer_id`、`question_index`、`active_fields`、`progressive_state` / 逆向 `ReverseState` 结构——与平台身份正交。

---

## 一、游戏玩法

### 1.1 产品概览

多主题「猜人物」：系统隐藏一名角色，玩家根据**提示**和/或**对比格**缩小范围并提交名字。

| 维度 | 内容 |
|------|------|
| 主题 | CS 选手、2026 世界杯足球、NBA、宝可梦 Gen1–3 |
| 单人模式 | 经典六项、每日一题、逐步提示、逆向轰炸 |
| 多人模式 | 对战 2–5 人、接龙 2–5 人（Socket.io 房间，🔴 见 §0） |
| 核心交互 | 搜索建议（模糊）+ 提交猜测（**精确匹配**题库名/别名/id） |

### 1.2 模式规则速查

#### 经典六项 `classic-six`

| 项 | 规则 |
|----|------|
| 机会 | 初始 10，答对 +2（上限 10） |
| UI | 6 列对比格 + 1 条首提示；猜 3/6/9 次各解锁 1 条额外提示 |
| 对比格 | CS/足球/NBA 固定 6 字段；**宝可梦每题动态 4–6 字段** |
| 结束 | 机会耗尽 → 弹窗揭晓（§1.3）；答对仅题内恭喜；可无限「下一题」 |
| 排行榜 | `leaderboard`，`game_mode=classic-six` |

#### 每日一题 `daily-one`

| 项 | 规则 |
|----|------|
| 题目 | 每主题每天 1 题（UTC+8），全员同答案（种子随机） |
| 机会 | 20 次；**每人每主题每日 1 次**（🔴 设备 UUID / 平台 userId） |
| 排名 | 猜测次数少优先，其次用时 |
| 失败 | `failed`，弹窗 + 结算页揭晓答案，不入总分榜 |
| 猜对 | 题内恭喜，无弹窗；结算页**仍展示**今日答案 |

#### 逐步提示 `progressive-hint`

| 项 | 规则 |
|----|------|
| 生命 | 整局 3 条命，跨题不补 |
| UI | **无对比格**；提示逐条解锁 |
| 判定 | 每次猜：检查**已解锁的全部提示**是否相对答案命中 |
| 全提示命中 + 人错 | 解锁下一条（不扣命） |
| 未全命中 | 扣 1 命 |
| 额外命中 | 猜中尚未解锁的队列字段仅记入 `satisfiedFields`，**不阻止**后续正式提示 |
| 结束 | 命尽 → 弹窗揭晓（§1.3）；猜对仅题内恭喜 |
| 排行榜 | `game_mode=progressive-hint` |

#### 逆向轰炸 `reverse-bomb`

| 项 | 规则 |
|----|------|
| 目标 | 已知有隐藏答案，用自提条件筛卡片，最终猜人 |
| 题库 | 每轮 **100** 张（含答案），从**可用题库**抽样（足球/NBA 同经典 `isPlayable*`）；卡格、淘汰、条件下拉均限本题池/存活池，**禁止回退全库** |
| 筛选 | 5 次；每轮 **二选一** 字段配置条件（`==`/`!=` 或数值 `>=`/`<=`） |
| 判定 | 看隐藏答案是否满足条件 → 淘汰不一致卡 |
| 第 4 次筛选前 | 1 条准确提示（字段不在当轮二选一里） |
| 结案 | 存活=1 自动成功；筛尽 → 1 次终极猜测 |
| 局数 | **固定 3 轮**，三轮总分排名 |
| 揭晓 | 每轮结束 **弹窗**含答案（猜对/猜错/筛至唯一）；结算页不重复（见 `reverseRoundHistory`） |
| 排行榜 | `game_mode=reverse-bomb` |

#### 对战 `battle` / 接龙 `relay-chain`

| 模式 | 要点 |
|------|------|
| 对战 | 2–5 人，共享 30 题，各 10 次，规则同经典；猜对题间 banner 无弹窗；平局弹窗揭晓；无全局榜 |
| 接龙 | 轮流猜；完全猜对 +300；字段首次认领 +50；已认领字段再猜对不加分；已认领字段答错 -50；耗尽结束弹窗揭晓 |

### 1.3 计分与结算

**经典 / 逐步 / 对战（本题次数）**：1→500，2→420，3→340，4+→`max(300, 340-(n-3)×55)`（完全猜对最低 300 分）。

**逆向（单轮）**：猜对 500；筛至唯一 600+50×剩余筛选；猜错 100~450（按存活比例）。

**接龙**：见上表。

**答案揭晓**（单人 `/result` · 多人 `/settlement`）

| 时机 | 题内 UI | 结算页答案 |
|------|---------|------------|
| 猜对（经典 / 逐步 / 对战 / 接龙） | `CongratsBanner` 或题间 banner，**无弹窗** | 否 |
| 猜对（每日） | 同上 +「查看成绩」，**无弹窗** | **始终展示**（含猜对） |
| 猜对（逆向每轮） | `roundModal` 含答案与得分 | 否（三轮明细见 `reverseRoundHistory`） |
| 猜错（全部模式） | `AnswerRevealModal` / 多人 `GameEndRevealModal` | 是（本题为未猜中结束） |
| 中途退出 | — | 是（当前题答案） |
| 多人正常打完（题数用尽） | — | 否 |

**服务端**：`submitGuess` 仅在**猜错且机会/命尽**时返回 `correctAnswer`；`getGameSession` 用 `buildRevealedAnswer` 附加 `revealedAnswer`（`quit` 与 `daily-one` 始终；其余仅当前题未猜中）。**多人**：`roomService.endRoom` 在正常打完时不写 `revealedAnswer`，退出/耗尽才写。

**前端入口**：单人 `GamePage` · 多人 `MultiplayerGamePage` · 结算 `ResultPage` / `SettlementPage`（`AnswerRevealPanel`）。

| 模式 | 排行榜 |
|------|--------|
| 经典 / 逐步 / 逆向 | `leaderboard`（按 mode 分榜） |
| 每日 | `daily_leaderboard` |
| 对战 / 接龙 | 仅房间结算页 |

---

## 二、实现逻辑

### 2.1 模块地图

```
gameService.ts      单人猜题 / 下一题 / 退出 / getGameSession
compareEngine.ts  全主题 hit / close / miss
dataLoader.ts       读 JSON、搜索、选题、getCharacterField
activeFields.ts     非宝可梦固定 6 对比列
pokemonQuestion.ts  宝可梦动态对比列 + compareMove
footballHints.ts    联赛/足联合成提示、可玩过滤
nbaHints.ts         赛区·选秀轮次、可玩过滤
progressiveQueue.ts + progressiveHint.ts   逐步提示队列与状态机
reverseBomb.ts      逆向池、二选一、淘汰、计分
dailyChallenge.ts   每日种子题
roomService.ts      多人 Socket 房间（🔴 内存态）
relayScoring.ts     接龙认领计分
```

### 2.2 猜题主流程

```
POST /api/game/guess
  → findCharacterByGuess（精确：name / englishName / aliases；CS 含 id）
  → notInBank：不扣次
  → 分模式：
       classic/daily/battle → compareAllFields → 更新 attempts/score/status
       progressive-hint     → submitProgressiveGuess
       reverse-bomb       → submitReverseBombGuess 或 reverse-query
  → 猜错且机会/命尽：返回 `correctAnswer`（题内弹窗）；结算见 `buildRevealedAnswer`
```

**Session 状态**：`playing` → 答对 `question_done` → 下一题；耗尽 `game_over`；每日失败 `failed`。

### 2.3 出题 Pipeline

出题分两步：**① 从可玩池抽答案** → **② 为该答案生成对比列与提示**。各模式共用同一套筛选与 `resolveQuestionSetup`，仅随机源与是否批量预生成不同。

```
① pickRandomCharacter(theme, excludeIds?, rng?)
     csgo / pokemon  → getBank 去重后随机
     football        → isPlayableFootballAnswer（仅 meta.allowedClubLeagues）
     nba             → isPlayableNBAAnswer

② resolveQuestionSetup(theme, answer)   // 多人/每日用 resolveQuestionSetupWithRng
     pokemon  → buildPokemonQuestion
     else     → pickActiveFields + pickQuestionHints（首 1 + 预抽额外 3）

写入 sessions / questionQueue：answer_id, hint_field, extra_hint_fields,
                              active_fields, question_compare_move, progressive_state…
```

**各模式入口**（均走 ①→②，足球/NBA 过滤在 ① 统一生效）

| 模式 | 选题入口 | 说明 |
|------|----------|------|
| 经典六项 | `startGame` → `pickRandomCharacter` | 单题即时出题 |
| 每日一题 | `getOrCreateDailyChallenge` → 种子 RNG + `pickRandomCharacter` | 同日同主题全员同题，写 `daily_challenges` |
| 逐步提示 | 同经典 | 另建 `createInitialProgressiveState` |
| 逆向轰炸 | `pickRandomCharacter` 定答案 + `createInitialReverseState` 抽 100 卡池 | 卡池用 `getReverseQuestionBank`（同 ① 过滤） |
| 对战 / 接龙 | `generateQuestionQueue` → 循环 `pickRandomCharacter` + `resolveQuestionSetupWithRng` | 开局一次生成整局 `questionQueue`，房间共享 |
| 下一题 | `nextQuestion` → `pickRandomCharacter`（去 `used_answer_ids`） | 经典 / 逐步 / 逆向 |

**足球：筛库与首提示是两件事**（勿混用）

| 阶段 | 函数 | 作用 |
|------|------|------|
| ① 筛题库 | `isPlayableFootballAnswer` | 答案**必须**来自 `allowedClubLeagues` 内联赛球员 |
| ② 首提示 | `buildFootballPrimaryHint` | 在**已选答案**上，有联赛且有足联则 **50/50** 展示 `clubLeague` 或 `confederation`（不进对比格） |

非白名单联赛球员（如伊朗联赛）不入池，故不会成为答案，也不会作为首提示的联赛项出现。

**每日一题**：`seed = hash(UTC+8日期:theme)` → 确定性选题 → `daily_challenges` 表缓存。

### 2.4 模式专项

#### 经典 / 对战 / 每日 — 提示 Pipeline

适用模式：`classic-six`、`daily-one`、`battle`（`pickQuestionHints` + `buildSessionHints`）。

**通用规则**

- 开局展示 **1 条**首提示（`hint_field`）
- 出题时预抽 **3 条**额外提示（`extra_hint_fields`），存库待解锁
- 本题第 **3 / 6 / 9** 次猜测后，各展示 1 条额外提示（`BONUS_HINT_THRESHOLDS`）
- 对比格已 **hit** 的字段不再作额外提示（`collectHitFields`）

**各主题：首提示与额外池来源**（仅数据来源差异，解锁规则同上）

| 主题 | 首提示（`hint_field`） | 额外 3 条预抽池 |
|------|------------------------|-----------------|
| csgo | 对比 6 项 shuffle 第 1 项 | 同 6 项 shuffle 第 2–4 项 |
| football | `buildFootballPrimaryHint`：已选答案上联赛/足联 50/50（**筛库已在 pickRandomCharacter 完成**） | 对比 6 项 shuffle |
| nba | `divisionPosition` 赛区·选秀轮次（合成，**不进对比格**） | 对比 6 项 shuffle |
| pokemon | 见 `buildPokemonQuestion` 首提示池随机 1 项 | `activeFields` + bonus 字段 shuffle（见 §3.3、§2.6） |

#### 逐步提示队列

```
buildProgressiveHintQueueFromSetup → firstField + pendingQueue（shuffle）
createInitialProgressiveState      → hints[0] 展示，其余排队
猜错且 allHintsHit                 → unlockNextProgressiveHint（跳过 field:value 重复、已解锁）
updateProgressiveSatisfiedFields     → 记录额外命中，不删 pendingQueue
```

| 主题 | firstField | pendingQueue |
|------|------------|--------------|
| football | 联赛或足联（50/50） | club, nationalTeam, age, marketValue, height, position |
| nba | divisionPosition | team, age, height, draft, playoffCount |
| pokemon | setup.hintField | activeFields + bonus 去重 |
| csgo | setup.hintField | hint 池其余 |

#### 逆向轰炸

```
createInitialReverseState
  getReverseQuestionBank → pickReverseQuestionPoolIds（100，含答案）
  pickReverseFieldChoices（2 个有区分度字段，避 recentChoiceFields）

submitReverseQuery / getReverseValues
  getAlivePool(questionPoolIds) → 淘汰 / 枚举（均限本题池，禁止 getBank 全量）

submitReverseQuery（续）
  判答案是否满足 → 淘汰卡 → attempts_left--
  queries≥3 → buildReverseAccurateHint
  存活=1 → finishReverseRound（autoDeduce 计分）
  attempts=0 → phase=guessing

finishReverseRound → roundHistory；第 3 轮 → game_over + 写榜
```

**题库约束**：`questionPoolIds` 写入 `ReverseState`；缺失时 `ensureReverseQuestionPoolIds` 补池。凡涉及卡格/枚举/淘汰的路径须带 `answerId` 解析池，不得空池时扫全库。

**逆向-only 字段**：CS 雷达五维、NBA 赛区/出场、足球 league/confederation 合成等（见 `reverseBomb.ts` `EXTRA_REVERSE_FIELD_DEFS`）。

#### 多人

- 每玩家独立 `sessions` 行，共享 `room_code`（🔴）
- 猜测走 Socket `room:guess`，REST guess 拒绝
- 接龙：`relayScoring.ts` 维护 `fieldClaims`
- 揭晓：对战猜对 → `BattleRoundBanner`；对战平局 → `AnswerRevealModal`；房间因退出/耗尽结束 → `GameEndRevealModal` + `/settlement` 的 `revealedAnswer`（正常打完无揭晓）

### 2.5 比对引擎要点 `compareEngine.ts`

| 结果 | 含义 |
|------|------|
| hit | 完全匹配 |
| close | 接近（数值阈值 / 地理邻近 / 位置同组 / 蛋群等） |
| miss | 否 |

**数值 close 阈值（摘要）**：CS age±2 rating±0.08；足球 age±2 身价±20% 身高±3cm；NBA age±2 身高±3cm 季后赛±1；宝可梦种族±15 总和±30。

**合成提示判定**（逐步/提示用，`progressiveHint.evaluateHintHit`）：
- `divisionPosition` = 同赛区 **且** 同选秀轮次（不含年份）
- `clubLeague` / `confederation` = meta 映射字符串相等
- 宝可梦 `moveHint` / `weaknessHint` 专用逻辑

### 2.6 特殊处理清单

| 场景 | 处理 |
|------|------|
| 宝可梦首提示=moveHint | 对比格加 `learnableMove`，session 存 `compareMove` |
| 宝可梦 weaknessHint | 可入额外提示池；对比格含 type1/type2 时仍可展示；**仅当 type1 或 type2 在猜测中已 hit 时不再展示** |
| 足球年龄 | 基准年 `meta.ageReferenceYear`（2026） |
| NBA 球队展示 | 存英文代码，hint/UI 用 `meta.teams` 中文 |
| NBA 可玩 | `hasCareerSince2025` 且 GP≥30（2025 起常规+季后） |
| 足球可玩 | **仅** `allowedClubLeagues` 筛题库（`isPlayableFootballAnswer`）；首提示另走 `buildFootballPrimaryHint` |
| CS 年龄 | 优先 `birthDate` 动态算 |
| 逆向数值输入 | 不预填；枚举/数值运算符见 `reverseBomb.validateCondition` |
| 答案揭晓 | `buildRevealedAnswer`：`quit`/`daily-one` 必返；逆向当前轮已在 `roundHistory` 则不返；其余看本题是否猜中 |
| 排行榜写入 | `handleGameEndLeaderboard` 排除 daily/battle/relay/failed |

---

## 三、题库与字段设计

### 3.1 文件布局

```
server/data/
├── csgo.json | football.json | nba.json | pokemon.json   # 主题库（推荐 envelope + meta）
├── pokemon-type-chart.json
├── position-groups.json
├── geo/nationality-regions.json
└── aliases/pokemon-extra.json
```

加载：`dataLoader.readThemeFile` → `getBank(theme)`。改 JSON 后**重启**生效。

**Envelope 推荐**：`{ "version", "updatedAt", "players": [...], "meta": {...} }`

### 3.2 字段角色

| 角色 | 说明 | 示例 |
|------|------|------|
| 身份 | id、name、aliases，提交精确匹配 | CS 的 `id` 即显示名 |
| 对比 | 进对比格，hit/close/miss | `team`, `height` |
| 提示 | 仅 hint，或运行时合成 | `divisionPosition`, `clubLeague` |
| 过滤 | 能否成为随机答案 | NBA `hasCareerSince2025` |
| 运行时 | 不在 JSON，会话生成 | `compareMove`, 逆向合成键 |

### 3.3 四主题速查

> 字段中文名与 `server/types.ts` 中 `THEME_FIELD_DEFS` / `getFieldLabel()` 一致。  
> **经典 / 对战 / 每日**的提示解锁与预抽规则见 [§2.4 经典 / 对战 / 每日 — 提示 Pipeline](#经典--对战--每日--提示-pipeline)；本节只列字段与主题特有问题。

#### CS `csgo` — 147 人，无过滤

| 项 | 内容 |
|----|------|
| 对比 6 项 | `team` 战队 · `nationality` 国籍 · `age` 年龄 · `rating` 近三月Rating · `top20Count` TOP 20次数 · `position` 位置 |
| 提示字段来源 | 首提示与额外提示均来自上表 6 项（无合成首提示） |
| 逆向额外 | `firepowerStat` 火力值 · `sniperStat` 狙击值 · `breakthroughStat` 突破 · `tradeStat` 补枪值 · `clutchStat` 残局值 · `utilityStat` 道具值（完美雷达回填） |
| meta | 无 |

#### 足球 `football` — ~1248 入库，可玩=白名单联赛球员

| 项 | 内容 |
|----|------|
| 对比 6 项 | `club` 俱乐部 · `nationalTeam` 国家队 · `age` 年龄 · `marketValue` 身价(万欧元) · `height` 身高(cm) · `position` 位置 |
| 题库筛选 | `isPlayableFootballAnswer`：**仅** `meta.allowedClubLeagues` 内联赛球员可成为答案 |
| 合成首提示 | `buildFootballPrimaryHint`：在已选答案上 **联赛 / 足联 50/50**（不进对比格；与筛库无关） |
| meta | `confederations`, `clubLeagues`, `allowedClubLeagues`, `ageReferenceYear` |
| 允许联赛 | 见 `meta.allowedClubLeagues`（英超、西甲、意甲、德甲、法甲、美职联、沙特联、J/K/中超等） |

#### NBA `nba` — ~538 入库，~415 可玩

| 项 | 内容 |
|----|------|
| 对比 6 项 | `team` 球队 · `age` 年龄 · `height` 身高(cm) · `draft` 选秀 · `playoffCount` 季后赛次数 · `position` 位置 |
| 合成首提示 | `divisionPosition` 赛区·选秀轮次（不进对比格） |
| 过滤 | `max(totalGpSince2025,bestGpSince2025) >= 30` 且 `hasCareerSince2025` |
| meta | `teams`, `divisions`, `positions`, `schools`, `playableMinTotalGpSince2025` |
| 球队 | JSON 存英文代码如 `Cavaliers`，展示用中文 |
| 逆向额外 | `currentSeasonGp` 本赛季出场 · `maxCareerGpSince2025` 2025来最高出场 · `division` 赛区（合成） |

#### 宝可梦 `pokemon` — 386 人，无过滤

| 项 | 内容 |
|----|------|
| 对比（动态） | 必含 `type1` 属性1 + 1 项种族值（`baseStatTotal` 种族值总和 / `hp` HP / `attack` 攻击 / `defense` 防御 / `spAttack` 特攻 / `spDefense` 特防 / `speed` 速度 中随机 1 项）+ 最多 4 项可选：`type2` 属性2 · `evolutionStage` 进化阶段 · `category` 分类 · `ability` 特性 · `eggGroup` 生蛋群；首提示为 `moveHint` 时另加 `learnableMove` 可学习技能 |
| 首提示池 | `category` 分类 · `ability` 特性 · `eggGroup` 生蛋群 · `moveHint` 可学会招式 |
| 运行时字段 | `weaknessHint` 属性弱点（规则见 §2.6） |
| 依赖 | `pokemon-type-chart.json`（弱点）、`aliases/pokemon-extra.json` |
| 蛋群 close | 共享蛋群但单/双蛋群数不同 → close + 文案 |

### 3.4 可玩规模（参考）

| 主题 | 入库 | 可玩 |
|------|------|------|
| csgo | 147 | 147 |
| football | ~1248 | ~626（仅白名单联赛） |
| nba | 538 | ~415 |
| pokemon | 386 | 386 |

数据维护脚本见 [`scripts/README.md`](../scripts/README.md)（爬虫/回填，**非运行时**）。

---

## 四、技术架构

### 4.1 技术栈

| 层 | 选型 |
|----|------|
| 前端 | React 18 + TS + Vite + Tailwind |
| 后端 | Express + **sql.js**（内存 SQLite，debounce 落盘） |
| 实时 | Socket.io `/socket.io`（🔴 待平台鉴权） |
| 题库 | 静态 JSON，运行时只读 |

### 4.2 目录（关键路径）

```
client/src/pages/     GamePage, ResultPage, LobbyPage, MultiplayerGamePage, SettlementPage
client/src/hooks/     useGameRoom.ts（Socket）
server/index.ts       Express + Socket 入口
server/db.ts          建表与持久化
server/routes/        game, leaderboard
server/services/      见 §2.1
server/data/          题库 JSON
scripts/              数据同步（puppeteer 等，不进生产镜像）
```

### 4.3 数据库（核心表）

| 表 | 用途 |
|----|------|
| `sessions` | 局状态：answer_id, active_fields, attempts, score, status, progressive_state, room_code（🔴） |
| `guesses` | 每次猜测 + field_results JSON |
| `leaderboard` | 单人模式总分榜（🔴 player_name → userId） |
| `daily_challenges` | 每日题目缓存 |
| `daily_leaderboard` | 每日成功榜 |
| `daily_player_attempts` | 每人每日一次（🔴 player_key） |

`progressive_state` / 逆向：复用同列存 `ProgressiveState` 或 `ReverseState` JSON。

**生产扩展**：多实例需外置 DB（如 PostgreSQL）；单实例 sql.js 可用。

### 4.4 API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/game/start` | body: playerName🔴, theme, gameMode |
| POST | `/api/game/guess` | 单人猜测（有 room_code 拒绝） |
| POST | `/api/game/next` | 下一题 |
| POST | `/api/game/quit` | 退出写榜 |
| POST | `/api/game/reverse-query` | 逆向提交条件 |
| GET | `/api/game/:sessionId` | 恢复局（含 revealedAnswer） |
| GET | `/api/game/suggest` | 搜索建议（模糊） |
| GET | `/api/leaderboard` | gameMode: classic-six / daily-one / progressive-hint / reverse-bomb |

**Socket 事件**：`room:create` | `room:join` | `room:guess` | `room:leave` | `room:state` | `game:start` | `game:finished`

### 4.5 前端路由

`/` 首页 · `/game` 单人（`CongratsBanner` / `AnswerRevealModal` / 逆向 `roundModal`） · `/lobby` 多人大厅 · `/multiplayer` 对局 · `/settlement` 多人结算 · `/result` 单人结算（`revealedAnswer`） · `/leaderboard` 榜

### 4.6 部署

```bash
npm run build    # client + server tsc
npm start        # PORT 默认 3001
```

| 变量 | 说明 |
|------|------|
| `PORT` | 监听端口 |
| `DB_PATH` | SQLite 文件路径 |
| `DB_SAVE_DEBOUNCE_MS` | 落盘 debounce（默认 400ms） |

扣子编程：`scripts/coze-deploy-build.sh` + `coze-deploy-run.sh`（PORT=5000）。  
构建需复制 `sql-wasm.wasm` 到 `dist/`。

---

## 附录：常量与枚举

```typescript
type GameMode = 'classic-six' | 'daily-one' | 'progressive-hint' | 'reverse-bomb' | 'battle' | 'relay-chain'
type Theme = 'csgo' | 'football' | 'nba' | 'pokemon'

MAX_ATTEMPTS = 10
DAILY_MAX_ATTEMPTS = 20
PROGRESSIVE_LIVES = 3
REVERSE_QUERY_ATTEMPTS = 5
REVERSE_ROUNDS_PER_GAME = 3
REVERSE_QUESTION_POOL_SIZE = 100
REVERSE_ACCURATE_HINT_AFTER = 3
BONUS_HINT_THRESHOLDS = [3, 6, 9]
```

---

*版本：2026-06。规则以 `server/types.ts`、`server/services/*.ts`、`server/data/*.json` 为准。*
