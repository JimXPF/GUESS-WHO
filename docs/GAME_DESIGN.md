# Guess Who — 游戏设计文档

> **用途**：供 AI 或接手开发者快速理解玩法、实现逻辑、题库结构与工程架构。  
> **代码入口**：`server-go/internal/services/game_service.go`（状态机）、`compare_engine.go`（比对）、`reverse_bomb.go` / `progressive_hint.go`（模式专项）。

---

## 文档结构

| 章节 | 内容 |
|------|------|
| [§0 PWA 接入待替换](#0-pwa-电竞平台接入待替换) | 身份、房间、会话等需对接平台的项 |
| [§一 游戏玩法](#一游戏玩法) | 面向玩家/产品的规则说明 |
| [§1.2 各模式游玩说明](#12-各模式游玩说明产品功能介绍) | **产品向**：如何开始、怎么玩、每步反馈 |
| [§1.3 模式规则速查](#13-模式规则速查) | 规则参数速查表 |
| [§1.4 计分与结算](#14-计分与结算) | 分数表、揭晓时机、排行榜 |
| [§二 实现逻辑](#二实现逻辑) | 出题、状态机、特殊处理（开发必读） |
| [§三 题库与字段](#三题库与字段设计) | JSON 结构、四主题字段速查 |
| [§四 技术架构](#四技术架构) | 栈、DB、API、本地开发、部署 |

---

## 0. PWA 电竞平台接入待替换

当前为**独立 Web 小游戏**实现；嵌入 PWA 电竞平台后，下列标识与存储需替换为**平台统一身份与房间服务**（标注 【PWA】）。

| 现状 | 位置 | 平台接入方案（待实现） |
|------|------|------------------------|
| **玩家昵称** `player_name` | 首页手填 → `POST /api/game/start` body | 【PWA】 改用平台 **userId + displayName**，禁止客户端自填唯一标识 |
| **用户唯一键** `player_key` | `daily_player_attempts.player_key`；`getClientKey()` | 【PWA】 现为 `uid:{localStorage UUID}` 或回退 `ip:`；改为 **平台 userId** |
| **请求头** `X-User-Id` | `client/src/api.ts` 注入；`server/utils/clientKey.ts` 读取 | 【PWA】 改为平台 **JWT / Session Token**，服务端验签后取 userId |
| **会话 ID** `sessions.id` | UUID v4，前端 `localStorage` `guess-who-session-id` | 【PWA】 可保留局内 UUID，或改为平台 **matchId**；需定义恢复/断线策略 |
| **多人房间码** `room_code` | 内存 Map + 6 位随机码（`roomService.ts`） | 【PWA】 改为平台 **Lobby / Room ID**；房间生命周期由平台或 Redis 管理 |
| **Socket 连接** | 无鉴权，`/socket.io` 明文 join | 【PWA】 握手携带平台 token；房间权限校验 |
| **排行榜键** | `leaderboard.player_name` 文本 | 【PWA】 改为 **userId** 存榜 + displayName 展示；防同名冲突 |
| **每日限次** | `UNIQUE(challenge_date, theme, player_key)` | 【PWA】 `player_key` → 平台 userId |
| **接龙认领** `FieldClaim.playerName` | 房间内显示名 | 【PWA】 绑定 userId，展示用平台昵称 |

**暂可保留（局内逻辑）**：`answer_id`、`question_index`、`active_fields`、`progressive_state` / 逆向 `ReverseState` 结构——与平台身份正交。

---

## 一、游戏玩法

### 1.1 产品概览

多主题「猜人物」：系统隐藏一名角色，玩家根据**提示**和/或**对比格**缩小范围并提交名字。

| 维度 | 内容 |
|------|------|
| 主题 | CS 选手、2026 世界杯足球、NBA、宝可梦 Gen1–3 |
| 单人模式 | 经典六项、每日一题、逐步提示、逆向轰炸 |
| 多人模式 | 对战 2–5 人、接龙 2–5 人（Socket.io 房间，【PWA】 见 §0） |
| 核心交互 | 搜索建议（模糊）+ 提交猜测（**精确匹配**题库名/别名/id） |

### 1.2 各模式游玩说明（产品功能介绍）

> 面向产品、设计与新玩家：说明**从进入到结束**的完整路径——做什么、看到什么反馈。  
> 界面清单见 [`docs/UI_SCREENS.md`](UI_SCREENS.md)；本节侧重**玩法与反馈**。

#### 通用：如何进入游戏

| 步骤 | 用户操作 | 系统反馈 |
|------|----------|----------|
| 1 | 打开首页，输入昵称 | 昵称本地保存，后续局内展示 |
| 2 | 选择「玩法」与「主题」 | 选中项高亮；每日模式会查询今日是否已玩 |
| 3 | 点击主按钮 | 单人 → 进入游戏页；多人 → 进入大厅；每日已完成 → 直达结算 |
| 4 | （可选）首页点「查看排行榜」 | 进入排行榜，按模式/主题筛选 |

**猜测交互（全模式共用）**

| 操作 | 反馈 |
|------|------|
| 输入名字，下拉选建议 | 模糊搜索题库，展示头像与名称 |
| 提交猜测 | 精确匹配 name / 别名 / id；**题库外** → 橙色 Toast「题库中没有该角色」，**不扣机会** |
| 猜错但还有机会 | 更新猜测列表与对比结果（或有对比格的模式）；顶栏机会/生命减少 |
| 猜对 | 题内恭喜横幅或轮次弹窗（见各模式）；不弹失败揭晓 |

---

#### 经典六项 — 完整流程

**一句话**：看提示 + 对比格，在 10 次机会内猜中隐藏角色；可无限换题刷分。

| 阶段 | 用户做什么 | 看到什么反馈 |
|------|------------|--------------|
| **开始** | 首页选「经典：六项提示」+ 主题 →「开始游戏」 | 进入游戏页；首条提示 + 空猜测区；机会 **10/10** |
| **阅读线索** | 看顶部提示卡片 | 1 条主题相关首提示（如联赛、赛区等） |
| **第 1～2 次猜** | 输入名字 → 猜测 | 新增一行 **6 列对比格**（宝可梦 4～6 列）：绿 hit / 黄 close / 红 miss；提示区不变 |
| **第 3 次猜** | 继续猜 | 同上；累计满 **3 次** → **解锁第 2 条额外提示** |
| **第 6 次猜** | 继续猜 | 累计满 **6 次** → **解锁第 3 条额外提示** |
| **第 9 次猜** | 继续猜 | 累计满 **9 次** → **解锁第 4 条额外提示** |
| **猜对** | 某次提交正确答案 | 顶栏 **恭喜横幅**（本题次数 + 得分）；机会 **+2**（上限 10）；底栏变为 **「下一题 →」** |
| **下一题** | 点下一题 | 新答案、对比列与提示重置；猜测列表清空；**总分累加** |
| **机会用尽且未猜对** | 继续错猜至 0 次 | **弹窗揭晓**正确答案 → 点「查看结算」→ 结算页（总分 + 排行榜） |
| **主动结束** | 顶栏「结束本局」→ 确认 | 保存当前成绩 → 结算页 |
| **结算** | 查看总分、答对题数、排行榜 | 「回到首页」开始新局 |

---

#### 每日一题 — 完整流程

**一句话**：每天每主题只有 **1 道题、1 次机会**，全员同题，比谁先猜对、用的次数少。

| 阶段 | 用户做什么 | 看到什么反馈 |
|------|------------|--------------|
| **开始** | 选「每日一题」+ 主题 | 若**今日已完成** → 按钮变「查看今日成绩」；若**进行中** →「继续今日挑战」 |
| **进入** | 开始 / 继续 | 进入游戏页；布局同经典六项；机会 **20 次**；顶栏可显示用时 |
| **游玩** | 同经典：提示 + 对比格 + 猜测 | 反馈同经典（3/6/9 次解锁额外提示） |
| **猜对** | 提交正确答案 | 题内恭喜横幅；**无失败弹窗**；自动进入结束态 |
| **失败** | 20 次用尽仍未猜对 | **弹窗揭晓** → 结算页标题「挑战失败」 |
| **结算** | 查看轮次、耗时、今日答案 | **始终展示今日正确答案**；每日专用排行榜（轮次少优先，其次用时） |
| **限制** | 同日同主题再次开局 | 提示已玩过，引导查看成绩 |

---

#### 逐步提示 — 完整流程

**一句话**：没有对比格，靠**逐条解锁的文字提示**缩小范围；整局只有 **3 条命**。

| 阶段 | 用户做什么 | 看到什么反馈 |
|------|------------|--------------|
| **开始** | 选「逐步提示」+ 主题 → 开始 | 游戏页：**无对比格**；提示面板仅第 1 条可见；**3 颗心** |
| **每次猜测** | 输入名字 → 猜测 | 猜测列表为**简版一行**（对错标记，无字段格） |
| **判定 A** | 猜的名字错，且**未满足**当前已解锁的全部提示 | **扣 1 命**；心形减少；提示不增加 |
| **判定 B** | 猜错，但猜测已**满足全部已解锁提示** | **不扣命**；**解锁下一条提示** |
| **判定 C** | 猜对 | 题内恭喜横幅 → 下一题；命数**不恢复** |
| **下一题** | 点下一题 | 新题；提示从第 1 条重新开始；**剩余命数带入** |
| **命尽** | 3 命用完 | **弹窗揭晓** → 结算页 |
| **结算** | 总分 + 逐步提示排行榜 | 回到首页 |

---

#### 逆向轰炸 — 完整流程

**一句话**：已知池中有隐藏答案，用 **5 次筛选条件**淘汰卡片，最后猜人；**固定 3 轮**，比三轮总分。

| 阶段 | 用户做什么 | 看到什么反馈 |
|------|------------|--------------|
| **开始** | 选「逆向轰炸」+ 主题 → 开始 | 游戏页：**100 张卡片网格**；顶栏「第 1 / 3 轮」 |
| **筛选 1～3 次** | 底部 **二选一字段** → 设条件（等于/不等于 或 大于/小于）→ 提交 | 根据隐藏答案是否满足条件，**批量淘汰**不符卡片（炸弹动画 → 卡片移除）；存活数减少 |
| **第 4 次筛选前** | （自动） | 弹出 **1 条准确提示**（字段不在本轮二选一中） |
| **筛选 4～5 次** | 继续设条件 | 同上淘汰动画 |
| **筛至唯一** | 存活剩 1 张 | **自动判定成功** → **轮次结果弹窗**（答案 + 得分，含筛至唯一加分） |
| **筛尽需猜** | 5 次筛完仍多张 | 进入 **终极猜测**：可点选卡片或输入名字 |
| **轮次结束** | 猜对 / 猜错 / 自动成功 | **轮次弹窗**：答案头像、本轮得分、成功/失败文案 |
| **下一轮** | 弹窗关闭 → 点「下一题」 | 新答案、新 100 卡池；轮次 +1 |
| **3 轮打完** | — | 跳转结算页：**三轮总分** + 每轮小卡明细 |
| **结算** | 逆向轰炸排行榜 | 回到首页 |

---

#### 对战模式 — 完整流程

**一句话**：2～5 人同房，共享 **10 道题**；每题各自 10 次机会，**先猜对者拿本题大分**。

| 阶段 | 用户做什么 | 看到什么反馈 |
|------|------------|--------------|
| **开始** | 首页选「对战模式」+ 主题 →「进入房间」 | 进入**多人大厅**（尚未进房） |
| **创建房间** | 在大厅选「新建房间」或「邀请天梯同房间好友」→ 点对应主按钮 | 进入等待页：6 位**房间号**、邀请链接、**5 人槽位**（自己占 1 格）；天梯房另有紫色说明条与平台邀请 |
| **邀请** | 分享房间号/链接；天梯房可「再次发起邀请」 | 好友输入房间号加入；槽位显示头像、昵称、在线状态 |
| **等待** | 非房主等待；房主见 ≥2 人在线 | 房主按钮「开始游戏」可点；不足 2 人时灰色提示 |
| **开局** | 房主点开始 | 全屏 **3 秒倒计时** → 自动进入对局页 |
| **每题进行中** | 看共享提示 + 自己对比格猜测 | 侧栏显示全员分数；本题第 x/10 题；各自机会独立 |
| **本题有人猜对** | — | **题间 Banner**：谁赢、本题得分；输入短暂禁用 |
| **本题无人猜对** | 全员本题次数用尽 | 平局：按字段 hit 数加分；可能 **答案揭晓弹窗**（继续） |
| **题间** | 等待约 5 秒 | Banner 展示后自动下一题 |
| **10 题打完** | — | 自动跳转 **房间结算页**（排名、总分，无全局榜） |
| **退出** | 对局页「退出」 | 全员进入结算（有人中途离开会结束整局） |
| **大厅** | 房主「解散房间」/ 他人「返回」 | 解散需二次确认，全员回首页；返回仅自己离开 |

---

#### 接龙模式 — 完整流程

**一句话**：2～5 人**轮流**猜同一题，抢认对比字段得分；每人整局 10 次机会，**30 题**或全员机会用尽结束。

| 阶段 | 用户做什么 | 看到什么反馈 |
|------|------------|--------------|
| **开始 / 大厅** | 同对战（选「接龙模式」） | 大厅流程与对战相同 |
| **轮到他人** | 等待 | 输入禁用；文案「等待 {昵称} 作答」；**30 秒倒计时**显示当前回合玩家 |
| **轮到我** | 输入猜测 | 倒计时高亮；对比格字段旁可显示**认领人** |
| **字段首次 hit** | 猜中某字段且无人认领 | **+80 分**，该字段标记为我认领 |
| **已认领字段再 hit** | 猜中他人已认领字段 | 对比格更新，**不加分** |
| **已认领字段答错** | 猜测与已认领字段冲突 | **-25 分** |
| **完全猜对** | 提交正确全名 | 本题结束；**完全猜对加分**（认领越多加分越少）；5 秒题间 → 下一题 |
| **超时** | 30 秒内未提交 | **-50 分**，消耗 1 次机会，轮转下一位 |
| **对手机会用尽** | （系统） | **弹窗**「{昵称} 机会已用尽」 |
| **提示解锁** | 全队本题累计猜测 | 满 3/6/9 次解锁额外提示（全队共享） |
| **局结束** | 30 题打完或全员机会用尽 | 结算页；若异常结束则揭晓当前题答案 |
| **大厅 / 退出** | 同对战 | 同上 |

---

#### 反馈类型速查（设计对照）

| 反馈形式 | 出现场景 | 视觉要点 |
|----------|----------|----------|
| 对比格 hit/close/miss | 经典、每日、对战、接龙 | 绿 / 黄 / 红列；接龙带认领名 |
| 提示卡片 | 有提示的模式 | 首提示 + 解锁条数递增 |
| 恭喜横幅 | 单人/多人猜对 | 本题次数 + 得分，无全屏遮罩 |
| 轮次/题间 Banner | 对战平局/赢题；接龙题末 | 玩家名 + 得分明细 |
| 答案揭晓弹窗 | 机会/命尽；逆向每轮；对战平局 | 头像 + 正确名 + 主按钮 |
| 轮次结果弹窗 | 逆向每轮结束 | 答案 + 得分 + 成功/失败 |
| Toast | 题库外名字 | 橙色条，3 秒消失 |
| 倒计时 Overlay | 大厅开局 | 全屏 3 秒 |
| 接龙回合倒计时 | 接龙他人/自己回合 | 顶栏 30 秒，紧迫时变红 |
| 结算页 | 各模式结束 | 单人带排行榜；多人仅房间排名 |

---

### 1.3 模式规则速查

#### 经典六项 `classic-six`

| 项 | 规则 |
|----|------|
| 机会 | 初始 10，答对 +2（上限 10） |
| UI | 6 列对比格 + 1 条首提示；猜 3/6/9 次各解锁 1 条额外提示（已 hit 字段递补队列下一条，见 §2.4） |
| 对比格 | CS/足球/NBA 固定 6 字段；**宝可梦每题动态 4–6 字段** |
| 结束 | 机会耗尽 → 弹窗揭晓（§1.4）；答对仅题内恭喜；可无限「下一题」 |
| 排行榜 | `leaderboard`，`game_mode=classic-six` |

#### 每日一题 `daily-one`

| 项 | 规则 |
|----|------|
| 题目 | 每主题每天 1 题（UTC+8），全员同答案（种子随机） |
| 机会 | 20 次；**每人每主题每日 1 次**（【PWA】 设备 UUID / 平台 userId） |
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
| 结束 | 命尽 → 弹窗揭晓（§1.4）；猜对仅题内恭喜 |
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

#### 对战 `battle`

| 项 | 规则 |
|----|------|
| 人数 | 2–5 人，同房共享 **10 题**（`BATTLE_QUESTION_COUNT`） |
| 机会 | **每题**各 10 次（题间重置）；先完全猜对者赢本题 |
| 计分 | 猜对按次数 `scoreForQuestion`（500→…→最低 300）；无人猜对则平局，按字段 hit 每项 +40 |
| 提示 | 同房同题 `extra_hint_fields` 一致；各自 `question_attempts` 独立解锁（§2.4） |
| 题间 | 5 秒间歇（`BATTLE_INTERMISSION_SECONDS`）后下一题 |
| 排行榜 | 仅房间结算页 |

#### 接龙 `relay-chain`

| 项 | 规则 |
|----|------|
| 人数 | 2–5 人，同房共享 **30 题**（`QUESTION_QUEUE_SIZE`，`roomService.ts`） |
| 回合 | **轮流**作答，每回合 **30 秒**；超时 **-50 分并消耗 1 次机会**，然后轮转 |
| 机会 | 每人整局 **10 次**（跨题累计，题间不重置）；完全猜对 +2（上限 10）；**须全员机会用尽**才触发局结束 |
| 计分 | 字段首次认领 +80；已认领字段再 hit 不加分；已认领字段答错 -25；完全猜对查表（§1.4）；超时 -50 |
| 提示 | **全队**本题累计猜测次数解锁（`buildRelayHintsForRoom`，规则同 §2.4） |
| 本题结束 | 任一人完全猜对 → 5 秒间歇 → 下一题（认领重置） |
| 局结束 | 30 题打完，或**全员**机会用尽 → 弹窗揭晓（§1.4） |
| 排行榜 | 仅房间结算页 |

#### 对战 / 接龙 — 公共

| 项 | 规则 |
|----|------|
| 房间 | Socket.io 大厅，**固定 5 槽**；**房主**在 ≥2 人在线时开始；开局前 **3 秒倒计时**（【PWA】 见 §0） |
| 通信 | 猜测走 `room:guess`；REST `/api/game/guess` 有 `room_code` 时拒绝 |

### 1.4 计分与结算

**经典 / 逐步 / 对战（本题完全猜对）**：1→500，2→420，3→340，4+→`max(300, 340-(n-3)×55)`（`scoreForQuestion`，最低 300）。

**对战平局（本题）**：无人完全猜对且全员本题次数用尽 → 各玩家按字段 hit 数 × 40（`BATTLE_PARTIAL_POINTS_PER_HIT`）加分。

**逆向（单轮）**：猜对 500；筛至唯一 600+50×剩余筛选；猜错 100~450（按存活比例）。

**接龙（本题 / 回合）**

| 事件 | 分数 |
|------|------|
| 字段首次 hit 认领 | +80（`RELAY_FIELD_POINTS`） |
| 已被他人认领的字段再 hit | 0 |
| 已认领字段答错 | -25（`RELAY_WRONG_CLAIM_PENALTY`） |
| 完全猜对 | 查表：0→300，1→270，2→230，3→180，4→120，5+→80（`computeRelayFullCorrectBonus`） |
| 回合超时 | -50 分，并消耗 1 次机会（`processRelayTurnTimeout`） |

设计意图：**抢认字段**——已认领字段越多越容易猜人，完全猜对按上表非等差递减（5 个及以上仅 80 分）。

**答案揭晓**（单人 `/result` · 多人 `/settlement`）

| 时机 | 题内 UI | 结算页答案 |
|------|---------|------------|
| 猜对（经典 / 逐步 / 对战 / 接龙） | `CongratsBanner` 或题间 banner，**无弹窗** | 否 |
| 猜对（每日） | 同上 +「查看成绩」，**无弹窗** | **始终展示**（含猜对） |
| 猜对（逆向每轮） | `roundModal` 含答案与得分 | 否（三轮明细见 `reverseRoundHistory`） |
| 猜错且局/题结束 | `AnswerRevealModal` / 多人 `GameEndRevealModal` | 是（本题为未猜中结束） |
| 猜错但仍有次数（对战/接龙题中） | 对比格更新，**无弹窗** | 否 |
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

### 2.1 模块与关键函数

| 模块 | 职责 | 关键函数 |
|------|------|----------|
| `gameService.ts` | 单人/多人猜题、下一题、退出、会话恢复 | `startGame` 开局 · `submitGuess` 单人猜 · `processRoomGuess` / `processRelayGuess` 多人猜 · `nextQuestion` 下一题 · `buildSessionHints` / `buildQueuedBonusSessionHints` 提示列表 · `buildRevealedAnswer` 结算揭晓 · `buildRelayHintsForRoom` 接龙全队提示 |
| `compareEngine.ts` | 全主题字段比对 | `compareField` 单字段 hit/close/miss · `compareAllFields` 对比格批量比对 |
| `themeConfig.ts` | 主题 JSON 读取与缓存 | `readThemeDocument` 读 `{theme}.json` · `getThemeConfig` 取 `config` · `getPositionGroups` · `getPokemonTypeChart` |
| `dataLoader.ts` | 读 JSON、搜索、选题 | `getBank` 读题库 · `findCharacterByGuess` 精确匹配猜测 · `pickRandomCharacter` 随机答案 |
| `activeFields.ts` | 非宝可梦固定 6 对比列 | `pickActiveFields` 选题对比列 |
| `pokemonQuestion.ts` | 宝可梦动态对比列 | `buildPokemonQuestion` 生成 activeFields + compareMove + 首提示 |
| `footballHints.ts` | 足球提示与可玩过滤 | `isPlayableFootballAnswer` 白名单联赛筛库 · `buildFootballPrimaryHint` 联赛/足联首提示 |
| `nbaHints.ts` | NBA 提示与可玩过滤 | `isPlayableNBAAnswer` GP 门槛筛库 · `buildNBAPrimaryHint` 赛区·轮次首提示 |
| `progressiveQueue.ts` | 逐步提示队列构建 | `buildProgressiveHintQueueFromSetup` 首字段 + pending 队列 |
| `progressiveHint.ts` | 逐步提示状态机 | `createInitialProgressiveState` 初始态 · `submitProgressiveGuess` 判定 · `unlockNextProgressiveHint` 解锁下一条 |
| `reverseBomb.ts` | 逆向池、筛选、计分 | `createInitialReverseState` 100 卡池 · `submitReverseQuery` 提交条件 · `finishReverseRound` 轮次结算 |
| `dailyChallenge.ts` | 每日种子题 | `getOrCreateDailyChallenge` 同日同题 |
| `roomService.ts` | 多人 Socket 房间（【PWA】 内存态） | `registerRoomHandlers` 事件注册 · `roomToState` 广播快照 · `maybeStartWaitingRoom` 在线满员开局 · `scheduleRelayTurnTimer` 接龙回合计时 · `endRoom` 房间结束 |
| `relayScoring.ts` | 接龙认领计分 | `scoreRelayGuess` 单次猜测计分 · `applyClaimsToFieldResults` 对比格标注认领人 · 完全猜对查表见 `types.computeRelayFullCorrectBonus` |
| `relayTurn.ts` | 接龙回合轮转 | `advanceRelayTurn` 切换当前玩家 · `ensureRelayTurnActive` 校验回合有效性 |

### 2.2 猜题主流程

**单人** — `POST /api/game/guess` → `submitGuess`

**多人** — Socket `room:guess` → `processRoomGuess`（对战）或 `processRelayGuess`（接龙）；有 `room_code` 时 REST 拒绝。

```
findCharacterByGuess（精确：name / englishName / aliases；CS 含 id）
  → notInBank：不扣次
  → 分模式：
       classic/daily     → compareAllFields → 更新 attempts/score/status
       battle            → compareAllFields → scoreForQuestion 或平局 partial
       relay-chain       → compareAllFields → scoreRelayGuess（认领 + 查表完全猜对）
       progressive-hint  → submitProgressiveGuess
       reverse-bomb      → submitReverseBombGuess 或 reverse-query
  → 猜错且机会/命尽：返回 correctAnswer（题内弹窗）；结算见 buildRevealedAnswer
```

**Session 状态**：`playing` → 答对 `question_done` → 下一题；耗尽 `game_over`；每日失败 `failed`。

### 2.3 出题 Pipeline

出题分两步：**① 从可玩池抽答案** → **② 为该答案生成对比列与提示**。各模式共用同一套筛选与 `resolveQuestionSetup`，仅随机源与是否批量预生成不同。

```
① pickRandomCharacter(theme, excludeIds?, rng?)
     csgo / pokemon  → getBank 去重后随机
     football        → isPlayableFootballAnswer（仅 config.allowedClubLeagues）
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
| 对战 / 接龙 | `generateQuestionQueue` → 循环 `pickRandomCharacter` + `resolveQuestionSetupWithRng` | 开局一次生成整局队列；对战 **10** 题、接龙 **30** 题（`roomService`） |
| 下一题 | `nextQuestion` → `pickRandomCharacter`（去 `used_answer_ids`） | 经典 / 逐步 / 逆向 |

**足球：筛库与首提示是两件事**（勿混用）

| 阶段 | 函数 | 作用 |
|------|------|------|
| ① 筛题库 | `isPlayableFootballAnswer` | 答案**必须**来自 `allowedClubLeagues` 内联赛球员 |
| ② 首提示 | `buildFootballPrimaryHint` | 在**已选答案**上，有联赛且有足联则 **50/50** 展示 `clubLeague` 或 `confederation`（不进对比格） |

非白名单联赛球员（如伊朗联赛）不入池，故不会成为答案，也不会作为首提示的联赛项出现。

**每日一题**：`seed = hash(UTC+8日期:theme)` → 确定性选题 → `daily_challenges` 表缓存。

### 2.4 模式专项

#### 经典 / 对战 / 每日 / 接龙 — 提示 Pipeline

适用：`classic-six`、`daily-one`、`battle`（`buildQueuedBonusSessionHints`）；接龙全队次数见 `buildRelayHintsForRoom`。

**通用规则**

- 开局展示 **1 条**首提示（`hint_field`）
- 出题时预抽 **3 条**有序额外提示（`extra_hint_fields`），存库作队列
- 本题第 **3 / 6 / 9** 次猜测各解锁 **1 个槽位**（`BONUS_HINT_THRESHOLDS` → `countUnlockedBonusHints`）
- 每解锁 1 槽，从队列取下一条展示：**未 hit 优先**（`collectHitFields`）；队列未 hit 项用尽后再展示 **已 hit** 项
- 对比格已 hit 的字段**不会占槽空缺**，自动递补队列中下一条

**对战额外**：同房 `generateQuestionQueue` 种子固定 → 每题 `extra_hint_fields` 相同；各自 `question_attempts` 独立 → 解锁进度不同步。

**接龙额外**：提示解锁看**全队**本题总猜测次数（`countRelayQuestionAttempts`）；hit 字段集合亦全队合并（`collectRelayHitFields`）。

**各主题：首提示与额外池来源**

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

**逆向-only 字段**：CS 雷达五维、NBA 赛区/出场、足球 league/confederation 合成、宝可梦 `pokemonWeakTo`/`pokemonResistTo` 等（见 `reverseBomb.ts` `EXTRA_REVERSE_FIELD_DEFS` / `SYNTHETIC_REVERSE_FIELDS`）。

#### 接龙 `relay-chain`

**计分查表**（`types.ts` → `computeRelayFullCorrectBonus`）

| 已认领 n | 0 | 1 | 2 | 3 | 4 | 5+ |
|---------|---|---|---|---|---|-----|
| 完全猜对 | 300 | 270 | 230 | 180 | 120 | 80 |

```
scoreRelayGuess(theme, fieldResults, isCorrect, claims, …)
  isCorrect → computeRelayFullCorrectBonus(已认领字段数)；status=question_done，attempts +2
  否则遍历 fieldResults：
    hit 且未认领 → +RELAY_FIELD_POINTS，写入 claims
    hit 且已认领 → 0
    miss 且字段已认领 → -RELAY_WRONG_CLAIM_PENALTY
  → advanceRelayTurn 轮转；30s 计时（scheduleRelayTurnTimer）

buildRelayHintsForRoom(playerOrder, theme, questionIndex)
  countRelayQuestionAttempts + collectRelayHitFields
  → buildQueuedBonusSessionHints（规则同经典 §2.4 提示 Pipeline）
```

| 函数 | 所在 | 作用 |
|------|------|------|
| `computeRelayFullCorrectBonus(n)` | `types.ts` | 完全猜对：`RELAY_FULL_CORRECT_BY_CLAIMED_COUNT[n]`，n≥5 为 80 |
| `initRelayClaims` / `parseRelayClaims` | `relayScoring.ts` | 初始化 / 解析房间 `relayFieldClaims` |
| `scoreRelayGuess` | `relayScoring.ts` | 单次接龙猜测计分，返回 scoreDelta、新 claims、breakdown |
| `applyClaimsToFieldResults` | `relayScoring.ts` | 对比格附加 `claimedBy` 展示名 |
| `buildRelayHintsForRoom` | `gameService.ts` | 全队累计次数解锁提示 |
| `advanceRelayTurn` | `relayTurn.ts` | 切换 `relayTurnSessionId` |
| `processRelayTurnTimeout` | `gameService.ts` | 超时：-50 分、扣 1 次机会，可能置 `game_over` |
| `scheduleRelayTurnTimer` | `roomService.ts` | 30s 回合计时，触发超时处理并轮转 |
| `finishRoomIfNeeded` | `roomService.ts` | 接龙：全员 `attemptsLeft≤0` 时结束房间 |

#### 对战 / 接龙 — 多人公共（实现）

- 每玩家独立 `sessions` 行，共享 `room_code`（【PWA】）
- 揭晓：对战猜对 → `BattleRoundBanner`；对战平局 → `AnswerRevealModal`；房间因退出/耗尽结束 → `GameEndRevealModal` + `/settlement` 的 `revealedAnswer`（`endRoom` 正常打完「十道题已完成」/「题目已完成」不写揭晓）

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
| 宝可梦 weaknessHint | 首提示池与 3/6/9 额外提示池均可随机抽到（与其它字段同等概率，**不优先**）；展示完整相克列表（弱点 ×2/×4、抗性 1/2/1/4/无效）；**不进对比格**；type1/type2 hit 后不再展示 |
| 足球年龄 | 基准年 `config.ageReferenceYear`（2026） |
| NBA 球队展示 | 存英文代码，hint/UI 用 `config.teams` 中文 |
| NBA 可玩 | `hasCareerSince2025` 且 GP≥30（2025 起常规+季后） |
| 足球可玩 | 见 §2.3 · `config.allowedClubLeagues` + `isPlayableFootballAnswer` |
| CS 年龄 | 优先 `birthDate` 动态算 |
| 逆向数值输入 | 不预填；枚举/数值运算符见 `reverseBomb.validateCondition` |
| 答案揭晓 | `buildRevealedAnswer`：`quit`/`daily-one` 必返；逆向当前轮已在 `roundHistory` 则不返；其余看本题是否猜中 |
| 排行榜写入 | `handleGameEndLeaderboard` 排除 daily/battle/relay/failed |

---

## 三、题库与字段设计

### 3.1 文件布局

```
server/data/
├── csgo.json | football.json | nba.json | pokemon.json   # 每主题单文件（选手 + config）
└── geo/nationality-regions.json                            # 国籍/国家队地理邻近（写死，不进后台）
```

加载：`themeConfig.readThemeDocument` → `dataLoader.getBank(theme)`。改 JSON 后**重启**生效。

**Envelope 格式**（后台按主题编辑一个文件即可）：

```json
{
  "version": 2,
  "updatedAt": "ISO8601",
  "config": { "…主题专属配置块…" },
  "players": [
    { "id": "…", "name": "…", "aliases": ["昵称1", "昵称2"], "…对比字段…" }
  ]
}
```

| 主题 | `config` 块（可后台配置） |
|------|---------------------------|
| csgo | `positionGroups`、`teamIgls`、`roleOverrides` |
| football | `confederations`、`clubLeagues`、`allowedClubLeagues`、`ageReferenceYear`、`positionGroups` |
| nba | `teams`、`divisions`、`positions`、`schools`、`playableMinTotalGpSince2025`、`positionGroups` |
| pokemon | `typeChart`（`types` + `chart`，属性克制） |

**昵称**：写在每位选手的 `aliases[]`，不再使用独立 alias 文件。

**迁移脚本**：`node scripts/consolidate-theme-data.js`（合并旧 position-groups / type-chart / alias 文件）。

**非后台配置**：`geo/nationality-regions.json` 供 `compareEngine` 国籍 close 判定，CS `nationality` 与足球 `nationalTeam` 共用。

### 3.2 字段角色

| 角色 | 说明 | 示例 |
|------|------|------|
| 身份 | id、name、**aliases**（昵称/别名，搜索与精确猜均匹配） | CS 的 `id` 即提交名 |
| 对比 | 进对比格，hit/close/miss | `team`, `height` |
| 提示 | 仅 hint，或运行时合成 | `divisionPosition`, `clubLeague` |
| config | 主题级配置（联赛表、位置合并、克制表等） | football `allowedClubLeagues` |
| 过滤 | 能否成为随机答案（选手字段或 config 规则） | NBA `hasCareerSince2025` |
| 运行时 | 不在 JSON，会话生成 | `compareMove`（首提示为 moveHint 时） |

### 3.3 四主题速查

> 字段中文名与 `server/types.ts` 中 `THEME_FIELD_DEFS` / `getFieldLabel()` 一致。  
> **经典 / 对战 / 每日 / 接龙**的提示解锁与预抽规则见 [§2.4 提示 Pipeline](#经典--对战--每日--接龙--提示-pipeline)；本节只列字段与主题特有问题。

#### CS `csgo` — 147 人，无过滤

| 项 | 内容 |
|----|------|
| 对比 6 项 | `team` 战队 · `nationality` 国籍 · `age` 年龄 · `rating` 近三月Rating · `top20Count` TOP 20次数 · `position` 位置 |
| 提示字段来源 | 首提示与额外提示均来自上表 6 项（无合成首提示） |
| 逆向额外 | `firepowerStat` 火力值 · `sniperStat` 狙击值 · `breakthroughStat` 突破 · `tradeStat` 补枪值 · `clutchStat` 残局值 · `utilityStat` 道具值（完美雷达回填） |
| config | `positionGroups`、`teamIgls`、`roleOverrides`（见 §3.1） |

#### 足球 `football` — ~1248 入库，可玩=白名单联赛球员

| 项 | 内容 |
|----|------|
| 对比 6 项 | `club` 俱乐部 · `nationalTeam` 国家队 · `age` 年龄 · `marketValue` 身价(万欧元) · `height` 身高(cm) · `position` 位置 |
| 题库筛选 | 见 §2.3 `isPlayableFootballAnswer` |
| 合成首提示 | 见 §2.3 `buildFootballPrimaryHint` |
| config | `confederations`, `clubLeagues`, `allowedClubLeagues`, `ageReferenceYear`, `positionGroups` |
| 允许联赛 | 见 `config.allowedClubLeagues`（英超、西甲、意甲、德甲、法甲、美职联、沙特联、J/K/中超等） |

#### NBA `nba` — ~538 入库，~415 可玩

| 项 | 内容 |
|----|------|
| 对比 6 项 | `team` 球队 · `age` 年龄 · `height` 身高(cm) · `draft` 选秀 · `playoffCount` 季后赛次数 · `position` 位置 |
| 合成首提示 | `divisionPosition` 赛区·选秀轮次（不进对比格） |
| 过滤 | `max(totalGpSince2025,bestGpSince2025) >= 30` 且 `hasCareerSince2025` |
| config | `teams`, `divisions`, `positions`, `schools`, `playableMinTotalGpSince2025`, `positionGroups` |
| 球队 | JSON 存英文代码如 `Cavaliers`，展示用中文 |
| 逆向额外 | `currentSeasonGp` 本赛季出场 · `maxCareerGpSince2025` 2025来最高出场 · `division` 赛区（合成） |

#### 宝可梦 `pokemon` — 386 人，无过滤

| 项 | 内容 |
|----|------|
| 对比（动态） | 必含 `type1` 属性1 + 1 项种族值（`baseStatTotal` 种族值总和 / `hp` HP / `attack` 攻击 / `defense` 防御 / `spAttack` 特攻 / `spDefense` 特防 / `speed` 速度 中随机 1 项）+ 最多 4 项可选：`type2` 属性2 · `evolutionStage` 进化阶段 · `category` 分类 · `ability` 特性 · `eggGroup` 生蛋群；首提示为 `moveHint` 时另加 `learnableMove` 可学习技能 |
| 首提示池 | `category` · `ability` · `eggGroup` · `moveHint` · **`weaknessHint`**（属性相克，见下） |
| weaknessHint | 首提示或 3/6/9 额外槽**随机**抽取（与其它 bonus 字段同等）；展示完整相克（弱点 ×N、抗性 1/2/1/4/无效）；不进对比格；type1/type2 hit 后隐藏 |
| 逆向弱点/抗性 | 底部可选 `pokemonWeakTo`（弱点）· `pokemonResistTo`（抗性），与其它逆向字段一样随机出现在 2 个候选里；选属性类型（不展示倍率）：×2/×4 算弱点，×1/×1/2/×1/4/无效 算抗性 |
| config | `typeChart`（属性克制，§3.1） |
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
| 后端 | **Go + chi + modernc/sqlite**（纯 Go SQLite，已完全替代原 Node 后端） |
| 实时 | Socket.io `/socket.io`（【PWA】 待平台鉴权） |
| 题库 | 静态 JSON，运行时只读 |

### 4.2 目录（关键路径）

```
client/src/pages/     GamePage, ResultPage, LobbyPage, MultiplayerGamePage, SettlementPage
client/src/hooks/     useGameRoom.ts（Socket）
server-go/cmd/server/main.go    Go 入口（chi + Socket + static）
server-go/internal/db/            SQLite 持久化（modernc/sqlite）
server-go/internal/api/           REST 接口 + 静态文件托管
server-go/internal/services/      游戏核心逻辑（compareEngine、hints、RNG、状态机）
server-go/internal/socket/        房间管理与 Socket.io 事件
server-go/data/                   题库 JSON
scripts/                          数据同步（puppeteer 等，非运行时）；start-dev.ps1 / kill-dev.ps1
```

### 4.3 数据库（核心表）

| 表 | 用途 |
|----|------|
| `sessions` | 局状态：answer_id, active_fields, attempts, score, status, progressive_state, room_code（【PWA】） |
| `guesses` | 每次猜测 + field_results JSON |
| `leaderboard` | 单人模式总分榜（【PWA】 player_name → userId） |
| `daily_challenges` | 每日题目缓存 |
| `daily_leaderboard` | 每日成功榜 |
| `daily_player_attempts` | 每人每日一次（【PWA】 player_key） |

`progressive_state` / 逆向：复用同列存 `ProgressiveState` 或 `ReverseState` JSON。

**生产扩展**：Go 后端为单二进制部署，SQLite 文件持久化即可；多实例建议外置 PostgreSQL + Redis 房间状态。原 Node `sql.js` 方案已废弃。

### 4.4 API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/game/start` | body: playerName【PWA】, theme, gameMode |
| POST | `/api/game/guess` | 单人猜测（有 room_code 拒绝） |
| POST | `/api/game/next` | 下一题 |
| POST | `/api/game/quit` | 退出写榜 |
| POST | `/api/game/reverse-query` | 逆向提交条件 |
| GET | `/api/game/:sessionId` | 恢复局（含 revealedAnswer） |
| GET | `/api/game/suggest` | 搜索建议（模糊） |
| GET | `/api/leaderboard` | gameMode: classic-six / daily-one / progressive-hint / reverse-bomb |

**Socket 事件**：`room:create` | `room:join` | `room:rejoin` | `room:guess` | `room:leave` | `room:state` | `game:start` | `game:finished`

### 4.5 前端路由

`/` 首页 · `/game` 单人（`CongratsBanner` / `AnswerRevealModal` / 逆向 `roundModal`） · `/lobby` 多人大厅 · `/multiplayer` 对局 · `/settlement` 多人结算 · `/result` 单人结算（`revealedAnswer`） · `/leaderboard` 榜

### 4.6 本地开发

| 命令 | 说明 |
|------|------|
| `npm run dev` | 推荐：清理旧进程后启动 Go 后端（`:3001`）+ Vite（`:5173`） |
| `start.bat` | Windows 双击启动，等同 `npm run dev` |
| `npm run restart` | 清理 + 重装依赖 + 再启动 |

**前置**：安装 [Go 1.26+](https://go.dev/dl/) 并加入 PATH；Node.js 18+。

**流程**：`dev:inner` 会先释放 `:3001` / `:5173` 端口，再等待 `/api/health` 就绪后启动 Vite（避免代理 ECONNREFUSED）。

**常见启动失败**：

| 现象 | 处理 |
|------|------|
| `Port 5173 is already in use` | 运行 `npm run dev`（含端口清理），或手动结束占用 5173 的 node/vite |
| `Backend not ready` | 检查 Go 是否安装；`cd server-go && go run ./cmd/server` 看报错 |
| `go not found` | 安装 Go 并重启终端 |

开发地址：前端 http://localhost:5173 ，API/Socket 由 Vite 代理到 http://127.0.0.1:3001 。

### 4.7 生产部署

```bash
npm run build    # client 构建 + server-go 编译 server.exe
npm start        # 运行 server-go/server.exe，PORT 默认 3001
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

// 对战
BATTLE_QUESTION_COUNT = 10
BATTLE_INTERMISSION_SECONDS = 5
BATTLE_PARTIAL_POINTS_PER_HIT = 40
FULL_CORRECT_MIN_SCORE = 300

// 接龙（QUESTION_QUEUE_SIZE = 30 在 roomService.ts）
RELAY_FIELD_POINTS = 80
RELAY_WRONG_CLAIM_PENALTY = 25
RELAY_FULL_CORRECT_BY_CLAIMED_COUNT = [300, 270, 230, 180, 120]
RELAY_FULL_CORRECT_MIN = 80  // n ≥ 5
RELAY_TURN_SECONDS = 30
RELAY_TIMEOUT_PENALTY = 50
```

---

*版本：2026-07。规则以 `server-go/internal/`、`server-go/data/*.json` 为准。*
