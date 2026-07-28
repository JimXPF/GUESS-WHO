# Guess Who — 游戏设计文档

> **纯阅读**：先弄清玩法、出题与提示，再看实现与架构。  
> **权威实现**：`server-go/internal/services/`（状态机、比对、逆向、逐步提示）。  
> **界面 / 路由 / 文案**：见文末「界面与状态」；前端对接以该节 + 路由表为准。

## 阅读顺序

| 顺序 | 章节 | 适合 |
|------|------|------|
| 1 | **§一～三** 游戏规则 · 出题/提示 · 计分 | 产品、设计、开发（先读） |
| 2 | **§四～六** 实现逻辑 · 题库 · 技术架构 | 开发深入 |
| 3 | 文末「界面与状态」 | **前端 + 设计**（路由、状态、文案、Figma 对照） |

### 近期修订（宝可梦属性相克 · 2026-07）

| 项 | 说明 |
|----|------|
| `config.typeChart` | 按 **Gen6+ 防守表** 校正（`chart[防守方属性][攻击属性]`）。旧表曾把格斗写成弱于毒 ×2，属数据错误，不是计算方向反了 |
| 提示文案 | 统一为 **`受到{属性}属性攻击 *2` / `*4` / `*1/2` / `*1/4` / `无效`**（不再用「弱点：」「抗性：」前缀，倍率用 `*`） |
| 语义 | 「受到毒属性攻击 *2」= **毒属性技能打本题宝可梦** 的倍率 |
| 已展示保留 | `type1`/`type2` hit 后**不再新解锁** `weaknessHint`，但**已展示的相克提示不撤回** |
| 多人退出 | 倒计时中 / 对局中任一玩家退出或断线 → 整局 `finished`，其余人进 `/settlement` |

---

## 一、游戏规则

### 1.1 产品概览

多主题「猜人物」：系统隐藏一名角色，玩家根据**提示**和/或**对比格**缩小范围并提交名字。

| 维度 | 内容 |
|------|------|
| 主题 | CS 选手、2026 世界杯足球、NBA、宝可梦 Gen1–3 |
| 单人模式 | 经典六项、每日一题、逐步提示、逆向轰炸 |
| 多人模式 | 对战 2–5 人、接龙 2–5 人（Socket.io 房间） |
| 核心交互 | 搜索建议（模糊）+ 提交猜测（**精确匹配**题库名/别名/id） |

### 1.2 各模式怎么玩

> 从进入到结束：做什么、看到什么。界面结构见文末「界面与状态」；参数见 §1.3；出题/提示见 **§二**。

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

### 1.3 模式参数速查（与上文流程对照）

| 模式 | 机会 / 局量 | 核心差异 |
|------|-------------|----------|
| 经典 | 10 次，答对 +2（上限 10）；无限下一题 | 对比格 + 3/6/9 提示 |
| 每日 | 20 次；每主题每天 1 次 | 全员同题；结算始终显示答案 |
| 逐步 | 整局 3 命，跨题不补 | 无对比格；提示队列判定 |
| 逆向 | 每轮 5 筛 × 固定 3 轮 | 100 卡池；轮末弹窗含答案 |
| 对战 | 2–5 人；10 题；每题各 10 次 | 先猜对赢题；平局按 hit×40 |
| 接龙 | 2–5 人；30 题；每人整局 10 次 | 轮流 30s；字段认领计分 |

多人公共：大厅 **5 槽**、房主 ≥2 人在线可开局、开局 **3 秒**倒计时；猜测走 Socket `room:guess`（不走单人 REST）。


---

## 二、出题规则与提示规则

> 开发与设计先读懂「题怎么来、提示怎么给」。代码入口与状态机见 **§四**。

### 2.1 出题（选题）

出题两步：**① 从可玩池抽答案** → **② 为该答案生成对比列与提示**。各模式共用筛选；差异主要在随机源与是否预生成整局队列。

| 模式 | 怎么选题 |
|------|----------|
| 经典 / 逐步 | 即时随机（避开本局已用过的答案） |
| 每日一题 | UTC+8 日期 + 主题种子 → **全员同题** |
| 逆向轰炸 | 先定答案，再从同池抽 **100** 张卡（含答案） |
| 对战 | 开局预生成 **10** 题队列 |
| 接龙 | 开局预生成 **30** 题队列 |

**可玩池（答案必须来自）**

| 主题 | 规则 |
|------|------|
| CS / 宝可梦 | 全库 |
| 足球 | 仅白名单联赛球员（`allowedClubLeagues`） |
| NBA | 有 2025 起生涯且出场达标 |

足球注意：**筛库**与**首提示**是两件事——非白名单球员不会成为答案；首提示在已选答案上，联赛/足联 50/50。

### 2.2 经典系提示（经典 / 每日 / 对战 / 接龙）

适用：`classic-six` / `daily-one` / `battle` / `relay-chain`。实现：`pickQuestionHintsWithRng` → 存 `hint_field` + `extra_hint_fields`；展示：`BuildQueuedBonusSessionHints`。

#### A. 出题时如何生成提示队列

出题一次定死两条数据（之后不再重抽队列本身）：

| 字段 | 含义 |
|------|------|
| `hint_field` | **首提示**，开局立刻展示 |
| `extra_hint_fields` | **额外提示有序队列**，最多 **3** 条（对应阈值 3/6/9），先存库不展示 |

**各主题怎么抽**（`pickQuestionHintsWithRng` / 宝可梦 `BuildPokemonQuestion`）

| 主题 | 首提示 `hint_field` | 额外队列 `extra_hint_fields`（最多 3） |
|------|---------------------|----------------------------------------|
| CS | 对比 6 项 **shuffle** 后取第 1 项：`team` 战队 · `nationality` 国籍 · `age` 年龄 · `rating` 近三月Rating · `top20Count` TOP 20次数 · `position` 位置 | 同池第 2～4 项（去掉 `name` 名称 / 排除字段） |
| 足球 | `clubLeague` 联赛 或 `confederation` 洲际赛区（有则 50/50；**不进对比格**） | 足球对比提示池 shuffle：`club` 俱乐部 · `nationalTeam` 国家队 · `age` 年龄 · `marketValue` 身价 · `height` 身高 · `position` 位置；**去掉已作首提示的那项**，取前 3 |
| NBA | 固定 `divisionPosition` 赛区·选秀轮次（**不进对比格**） | NBA 额外池 shuffle：`team` 球队 · `age` 年龄 · `height` 身高 · `draft` 选秀 · `playoffCount` 季后赛次数 · `position` 位置，取前 3 |
| 宝可梦 | 首提示池随机 1：`category` 分类 / `ability` 特性 / `eggGroup` 生蛋群 / `moveHint` 可学会招式 / `weaknessHint` 属性相克 | `GetPokemonBonusHintFields(activeFields)` shuffle（本题对比列 + 首提示池剩余项），去掉首提示，取前 3 |

排除规则：`name` 名称、主题级 `IsHintFieldExcluded` / NBA 排除字段不能进提示池。宝可梦若首提示是 `moveHint` 可学会招式，对比格会加 `learnableMove` 可学习技能 并写入 `compareMove`（运行时选定的招式名）。

#### B. 何时解锁额外槽位

`BONUS_HINT_THRESHOLDS = [3, 6, 9]`：本题猜测次数 ≥ 阈值时，多开放 1 个额外槽（最多 3）。

| 模式 | 计数口径 |
|------|----------|
| 经典 / 每日 | 本题自己的 `question_attempts` |
| 对战 | 每人独立计数（同题 `extra_hint_fields` 相同，解锁进度可不同） |
| 接龙 | **全队**本题总猜测次数 |

#### C. 解锁时如何从队列取字段（命中跳过 / 递补）

每个额外槽位在**对应阈值那一刻**选定字段，之后该槽选择保持稳定（用「前 N 次猜测」的 hit 快照，而不是用当前全部 hit 重算乱序）。

对第 `k` 个槽（阈值 = 3/6/9）：

1. 取**前阈值次猜测**里对比格结果为 **hit** 的字段集合  
2. 按 `extra_hint_fields` **队列顺序**找下一条：  
   - 未用过  
   - **优先跳过**此时已 hit 的字段（不把「玩家已经从对比格知道的信息」再占一个提示槽）  
   - 且该字段当前能构建出有效提示（宝可梦特殊字段见下）  
3. 若队列里**没有**未 hit 可构建项 → **放宽**：允许选已 hit 的字段（避免槽位空着）  
4. 仍没有 → 该槽及后续不再解锁  

**已展示的提示不会因为后来 hit 而从界面消失**（首提示 + 已解锁额外提示都保留）。

宝可梦附加限制：

| 情况 | 行为 |
|------|------|
| 队列项是 `weaknessHint` 属性相克，但 `type1` 属性1 或 `type2` 属性2 已 hit | **跳过该队列项**（不占新槽）；**已展示的弱点提示仍保留** |
| 队列项是 `moveHint` 可学会招式，但对比列没有 `learnableMove` 可学习技能 | 不可构建，跳过 |
| 普通字段不在本题 `activeFields`（本题对比列） | 不可构建，跳过 |

#### D. 小例子

队列：`[rating 近三月Rating, team 战队, age 年龄]`，阈值 3/6/9。

| 时刻 | 前 N 次 hit | 本槽选取 |
|------|-------------|----------|
| 第 3 次猜完 | 无 | 取 `rating` 近三月Rating（队列第 1） |
| 第 6 次猜完 | 已 hit `rating` 近三月Rating | 跳过 `rating`，取 `team` 战队 |
| 第 9 次猜完 | 已 hit `rating`、`team` | 跳过前两项，取 `age` 年龄 |

若第 6 次时队列剩余全已 hit，则允许把已 hit 的下一项填进槽位（放宽规则），而不是空槽。

### 2.3 逐步提示

逐步模式**不用**上面的 3/6/9 额外队列；另建 `pendingQueue`。

#### A. 队列如何生成（`BuildProgressiveHintQueueFromSetup`）

| 主题 | 首条 `firstField` | `pendingQueue` |
|------|-------------------|----------------|
| 足球 | `clubLeague` 联赛 或 `confederation` 洲际赛区（50/50） | 足球提示池去掉首条后 shuffle |
| NBA | `divisionPosition` 赛区·选秀 | NBA 额外池去掉 `divisionPosition` 后 shuffle |
| 宝可梦 | 本题 `hintField`（同经典首提示池：`category` 分类 / `ability` 特性 / `eggGroup` 生蛋群 / `moveHint` 可学会招式 / `weaknessHint` 属性相克） | `activeFields` 对比列 + bonus + extra 去重，去掉首条后 shuffle |
| CS | 本题 `hintField`（对比 6 项之一） | 对比提示池去掉 `name` 名称 / 首条 / 排除项后 shuffle |

开局只展示首条；其余在 `pendingQueue` 排队。

#### B. 猜一次怎么判定

| 结果 | 行为 |
|------|------|
| 猜对名字 | 恭喜；**不**因提示解锁；命数不恢复 |
| 猜错，且**未满足**当前已解锁的全部提示 | **扣 1 命**；提示不增加 |
| 猜错，但已满足**全部已解锁提示** | **不扣命**；从队列解锁下一条 |

猜中**尚未解锁**的字段 → 只记入 `satisfiedFields`，**不提前弹出**该提示，也不从队列删除（正式解锁时再处理）。

#### C. 解锁下一条时的跳过逻辑（`UnlockNextProgressiveHint`）

按 `pendingQueue` 顺序尝试取下一条：

1. **优先跳过**已在 `satisfiedFields` 里的字段（玩家其实已通过猜测满足过，不必再作为「新提示」）  
2. 跳过与已展示提示 **field:value 完全重复** 的项  
3. 跳过已在 `hintFields` 里的字段  
4. 宝可梦：`weaknessHint` 属性相克 在 `type1` 属性1 / `type2` 属性2 已满足时跳过  
5. 若按「跳过已满足」找不到 → **放宽**：允许选已满足字段（仍要过重复/弱点检查）  
6. 仍没有 → 队列耗尽，不再解锁  

### 2.4 逆向轰炸（筛选，不是提示主路径）

- 每轮 5 次筛选：二选一字段 + 条件，按隐藏答案淘汰卡片  
- 第 4 次筛选前给 1 条准确提示（字段不在当轮二选一）  
- 存活剩 1 → 自动成功；筛尽 → 终极猜人  
- 卡池/条件下拉**禁止回退全库**，只在本题 100 卡内操作  


---

## 三、计分与结算

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



| 模式 | 排行榜 |
|------|--------|
| 经典 / 逐步 / 逆向 | `leaderboard`（按 mode 分榜） |
| 每日 | `daily_leaderboard` |
| 对战 / 接龙 | 仅房间结算页 |

---

## 四、实现逻辑

### 4.1 模块与关键函数

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
| `roomService.ts` | 多人 Socket 房间 | `registerRoomHandlers` 事件注册 · `roomToState` 广播快照 · `maybeStartWaitingRoom` 在线满员开局 · `scheduleRelayTurnTimer` 接龙回合计时 · `endRoom` 房间结束 |
| `relayScoring.ts` | 接龙认领计分 | `scoreRelayGuess` 单次猜测计分 · `applyClaimsToFieldResults` 对比格标注认领人 · 完全猜对查表见 `types.computeRelayFullCorrectBonus` |
| `relayTurn.ts` | 接龙回合轮转 | `advanceRelayTurn` 切换当前玩家 · `ensureRelayTurnActive` 校验回合有效性 |

### 4.2 猜题主流程

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

### 4.3 出题 / 提示 — 实现入口

产品规则见 **§二**。实现侧关键路径：

| 步骤 | 函数 / 位置 |
|------|-------------|
| 抽答案 | `pickRandomCharacter`（足球/NBA 可玩过滤） |
| 生成对比列+提示 | `resolveQuestionSetup` / `buildPokemonQuestion` / `pickQuestionHints` |
| 展示提示列表 | `buildSessionHints` · `buildQueuedBonusSessionHints` · `buildRelayHintsForRoom` |
| 逐步状态机 | `progressiveHint.ts` / `progressiveQueue.ts` |
| 逆向卡池与筛选 | `reverseBomb.ts`（`questionPoolIds` 不得空池扫全库） |

#### 出题 Pipeline（实现细节）

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
| ② 首提示 | `buildFootballPrimaryHint` | 在**已选答案**上，有联赛且有足联则 **50/50** 展示 `clubLeague` 联赛 或 `confederation` 洲际赛区（不进对比格） |

非白名单联赛球员（如伊朗联赛）不入池，故不会成为答案，也不会作为首提示的联赛项出现。

**每日一题**：`seed = hash(UTC+8日期:theme)` → 确定性选题 → `daily_challenges` 表缓存。



### 4.4 接龙计分实现 `relay-chain`

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

### 4.5 多人公共（实现）

- 每玩家独立 `sessions` 行，共享 `room_code`
- 揭晓：对战猜对 → `BattleRoundBanner`；对战平局 → `AnswerRevealModal`；房间因退出/耗尽结束 → `GameEndRevealModal` + `/settlement` 的 `revealedAnswer`（`endRoom` 正常打完「十道题已完成」/「题目已完成」不写揭晓）

### 4.6 比对引擎要点 `compareEngine.ts`

| 结果 | 含义 |
|------|------|
| hit | 完全匹配 |
| close | 接近（数值阈值 / 地理邻近 / 位置同组 / 蛋群等） |
| miss | 否 |

**数值 close 阈值（摘要）**：CS age±2 rating±0.08；足球 age±2 身价±20% 身高±3cm；NBA age±2 身高±3cm 季后赛±1；宝可梦种族±15 总和±30。

**合成提示判定**（逐步/提示用，`progressiveHint.evaluateHintHit`）：
- `divisionPosition` 赛区·选秀 = 同赛区 **且** 同选秀轮次（不含年份）
- `clubLeague` 联赛 / `confederation` 洲际赛区 = meta 映射字符串相等
- 宝可梦 `moveHint` 可学会招式 / `weaknessHint` 属性相克 专用逻辑

### 4.7 特殊处理清单

| 场景 | 处理 |
|------|------|
| 宝可梦首提示=`moveHint` 可学会招式 | 对比格加 `learnableMove` 可学习技能，session 存 `compareMove`（运行时招式） |
| 宝可梦 `weaknessHint` 属性相克 | 首提示池与 3/6/9 额外提示池均可随机抽到（与其它字段同等概率，**不优先**）；文案统一为「受到XX属性攻击 *2 / *4 / *1/2 / *1/4 / 无效」；**不进对比格**；`type1`/`type2` 已 hit 时**不再新解锁**该提示，但**已展示的不撤回** |
| 足球年龄 | 基准年 `config.ageReferenceYear`（2026） |
| NBA 球队展示 | 存英文代码，hint/UI 用 `config.teams` 中文 |
| NBA 可玩 | `hasCareerSince2025` 且 GP≥30（2025 起常规+季后） |
| 足球可玩 | 见 §二 / §4.3 · `config.allowedClubLeagues` + `isPlayableFootballAnswer` |
| CS 年龄 | 优先 `birthDate` 动态算 |
| 逆向数值输入 | 不预填；枚举/数值运算符见 `reverseBomb.validateCondition` |
| 答案揭晓 | `buildRevealedAnswer`：`quit`/`daily-one` 必返；逆向当前轮已在 `roundHistory` 则不返；其余看本题是否猜中 |
| 排行榜写入 | `handleGameEndLeaderboard` 排除 daily/battle/relay/failed |

---

---

## 五、题库与字段设计

### 5.1 文件布局

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
| csgo | `positionGroups` 位置合并组、`teamIgls` 各队 IGL、`roleOverrides` 角色覆盖 |
| football | `confederations` 足联表、`clubLeagues` 联赛表、`allowedClubLeagues` 允许联赛白名单、`ageReferenceYear` 年龄参考年、`positionGroups` 位置合并组 |
| nba | `teams` 球队表、`divisions` 赛区表、`positions` 位置表、`schools` 学校表、`playableMinTotalGpSince2025` 可玩出场门槛、`positionGroups` 位置合并组 |
| pokemon | `typeChart`（`types` 属性列表 + `chart` 克制表） |

**昵称**：写在每位选手的 `aliases[]`，不再使用独立 alias 文件。

**迁移脚本**：`node scripts/consolidate-theme-data.js`（合并旧 position-groups / type-chart / alias 文件）。

**非后台配置**：`geo/nationality-regions.json` 供 `compareEngine` 国籍 close 判定，CS `nationality` 与足球 `nationalTeam` 共用。

### 5.2 字段角色

| 角色 | 说明 | 示例 |
|------|------|------|
| 身份 | `id` 标识、`name` 名称、**`aliases` 昵称/别名**（搜索与精确猜均匹配） | CS 的 `id` 即提交名 |
| 对比 | 进对比格，hit/close/miss | `team` 战队/球队、`height` 身高 |
| 提示 | 仅 hint，或运行时合成 | `divisionPosition` 赛区·选秀、`clubLeague` 联赛 |
| config | 主题级配置（联赛表、位置合并、克制表等） | football `allowedClubLeagues` 允许联赛白名单 |
| 过滤 | 能否成为随机答案（选手字段或 config 规则） | NBA `hasCareerSince2025` 是否有 2025 起生涯 |
| 运行时 | 不在 JSON，会话生成 | `compareMove`（首提示为 `moveHint` 可学会招式 时） |

### 5.3 四主题速查

> 字段中文名与 `server-go/internal/types` 中 `ThemeFieldDefs` / `GetFieldLabel()` 一致（下文凡出现 `` `field` `` 均附中文注释）。  
> **经典 / 对战 / 每日 / 接龙**的提示解锁与预抽规则见 **§2.2**；本节只列字段与主题特有问题。

#### CS `csgo` — 147 人，无过滤

| 项 | 内容 |
|----|------|
| 对比 6 项 | `team` 战队 · `nationality` 国籍 · `age` 年龄 · `rating` 近三月Rating · `top20Count` TOP 20次数 · `position` 位置 |
| 提示字段来源 | 首提示与额外提示均来自上表 6 项（无合成首提示） |
| 逆向额外 | `firepowerStat` 火力值 · `sniperStat` 狙击值 · `breakthroughStat` 突破 · `tradeStat` 补枪值 · `clutchStat` 残局值 · `utilityStat` 道具值（完美雷达回填） |
| config | `positionGroups` 位置合并组、`teamIgls` 各队 IGL、`roleOverrides` 角色覆盖（见 §3.1） |

#### 足球 `football` — ~1248 入库，可玩=白名单联赛球员

| 项 | 内容 |
|----|------|
| 对比 6 项 | `club` 俱乐部 · `nationalTeam` 国家队 · `age` 年龄 · `marketValue` 身价(万欧元) · `height` 身高(cm) · `position` 位置 |
| 题库筛选 | 见 §2.3 `isPlayableFootballAnswer` |
| 合成首提示 | 见 §2.3 `buildFootballPrimaryHint` |
| config | `confederations` 足联表、`clubLeagues` 联赛表、`allowedClubLeagues` 允许联赛白名单、`ageReferenceYear` 年龄参考年、`positionGroups` 位置合并组 |
| 允许联赛 | 见 `config.allowedClubLeagues`（英超、西甲、意甲、德甲、法甲、美职联、沙特联、J/K/中超等） |

#### NBA `nba` — ~538 入库，~415 可玩

| 项 | 内容 |
|----|------|
| 对比 6 项 | `team` 球队 · `age` 年龄 · `height` 身高(cm) · `draft` 选秀 · `playoffCount` 季后赛次数 · `position` 位置 |
| 合成首提示 | `divisionPosition` 赛区·选秀轮次（不进对比格） |
| 过滤 | `max(totalGpSince2025,bestGpSince2025) >= 30` 且 `hasCareerSince2025` |
| config | `teams` 球队表、`divisions` 赛区表、`positions` 位置表、`schools` 学校表、`playableMinTotalGpSince2025` 可玩出场门槛、`positionGroups` 位置合并组 |
| 球队 | JSON 存英文代码如 `Cavaliers`，展示用中文 |
| 逆向额外 | `currentSeasonGp` 本赛季出场 · `maxCareerGpSince2025` 2025来最高出场 · `division` 赛区（合成） |

#### 宝可梦 `pokemon` — 386 人，无过滤

| 项 | 内容 |
|----|------|
| 对比（动态） | 必含 `type1` 属性1 + 1 项种族值（`baseStatTotal` 种族值总和 / `hp` HP / `attack` 攻击 / `defense` 防御 / `spAttack` 特攻 / `spDefense` 特防 / `speed` 速度 中随机 1 项）+ 最多 4 项可选：`type2` 属性2 · `evolutionStage` 进化阶段 · `category` 分类 · `ability` 特性 · `eggGroup` 生蛋群；首提示为 `moveHint` 时另加 `learnableMove` 可学习技能 |
| 首提示池 | `category` 分类 · `ability` 特性 · `eggGroup` 生蛋群 · `moveHint` 可学会招式 · **`weaknessHint` 属性相克**（见下） |
| `weaknessHint` 属性相克 | 首提示或 3/6/9 额外槽**随机**抽取（与其它 bonus 字段同等）；文案「受到XX属性攻击 *2 / *4 / *1/2 / *1/4 / 无效」；不进对比格；`type1`/`type2` 已 hit 时跳过**未展示**的队列项，已展示保留 |
| 逆向弱点/抗性 | 底部可选 `pokemonWeakTo` 弱点 · `pokemonResistTo` 抗性，与其它逆向字段一样随机出现在 2 个候选里；选属性类型（不展示倍率）：*2/*4 算弱点，*1/*1/2/*1/4/无效 算抗性 |
| config | `typeChart`：`types[]` + `chart`（防守表，见上「近期修订」）；维护脚本 `scripts/fix-pokemon-type-chart.py` |
| 蛋群 close | 共享蛋群但单/双蛋群数不同 → close + 文案 |
| UI 展示 | `HintCard`：`label`=「属性相克」，`value`=上表文案；多条提示并排，标题首条「提示」、后续「追加」 |

### 5.4 可玩规模（参考）

| 主题 | 入库 | 可玩 |
|------|------|------|
| csgo | 147 | 147 |
| football | ~1248 | ~626（仅白名单联赛） |
| nba | 538 | ~415 |
| pokemon | 386 | 386 |

数据维护脚本见 [`scripts/README.md`](../scripts/README.md)（爬虫/回填，**非运行时**）。

---

---

## 六、技术架构

### 6.1 技术栈

| 层 | 选型 |
|----|------|
| 前端 | React 18 + TS + Vite + Tailwind |
| 后端 | **Go + chi + modernc/sqlite**（纯 Go SQLite，已完全替代原 Node 后端） |
| 实时 | Socket.io `/socket.io` |
| 题库 | 静态 JSON，运行时只读 |

### 6.2 目录（关键路径）

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

### 6.3 数据库（核心表）

| 表 | 用途 |
|----|------|
| `sessions` | 局状态：answer_id, active_fields, attempts, score, status, progressive_state, room_code |
| `guesses` | 每次猜测 + field_results JSON |
| `leaderboard` | 单人模式总分榜 |
| `daily_challenges` | 每日题目缓存 |
| `daily_leaderboard` | 每日成功榜 |
| `daily_player_attempts` | 每人每日一次 |

`progressive_state` / 逆向：复用同列存 `ProgressiveState` 或 `ReverseState` JSON。

**生产扩展**：Go 后端为单二进制部署，SQLite 文件持久化即可；多实例建议外置 PostgreSQL + Redis 房间状态。原 Node `sql.js` 方案已废弃。

### 6.4 API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/game/start` | body: playerName, theme, gameMode |
| POST | `/api/game/guess` | 单人猜测（有 room_code 拒绝） |
| POST | `/api/game/next` | 下一题 |
| POST | `/api/game/quit` | 退出写榜 |
| POST | `/api/game/reverse-query` | 逆向提交条件 |
| GET | `/api/game/:sessionId` | 恢复局（含 revealedAnswer） |
| GET | `/api/game/suggest` | 搜索建议（模糊） |
| GET | `/api/leaderboard` | gameMode: classic-six / daily-one / progressive-hint / reverse-bomb |

**Socket 事件**：`room:create` | `room:join` | `room:rejoin` | `room:guess` | `room:leave` | `room:state` | `game:start` | `game:finished`

### 6.5 前端路由

`/` 首页 · `/game` 单人（`CongratsBanner` / `AnswerRevealModal` / 逆向 `roundModal`） · `/lobby` 多人大厅 · `/multiplayer` 对局 · `/settlement` 多人结算 · `/result` 单人结算（`revealedAnswer`） · `/leaderboard` 榜

### 6.6 本地开发

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

### 6.7 生产部署

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

---

## 附录 A：常量与枚举

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


## 附录 B：嵌入平台时的身份替换（备忘）

独立 Web 原型里的昵称 / localStorage / 自研房间码，接入平台后改为平台 userId、Token、Lobby。**局内规则与出题/提示逻辑可不变。** 产品侧入口与邀请见页面「前端接入功能」手写说明。
