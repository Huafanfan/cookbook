# 独立复核（advisor）· 2026-09-21 · CB-007 / 端口固定 / CB-008

被复核的提交：`ef832bc`（CB-007 图片展示）、`8dc593b`（端口固定 + 存储说明）、`a3a7587`（CB-008 厨具改存服务端）。

复核来源：pi `advisor`（更强模型，无文件访问权，只能看对话里贴出的 diff/证据）。
下面**逐条记录意见 + 我的处置**。处置分三类：`已修`／`部分接受（说明理由）`／`不采纳（说明理由）`。

## 处置结果汇总（提交 `e132d44`）

| 意见 | 处置 | 落在哪里 |
| --- | --- | --- |
| P1-1 客户端并发保存会与磁盘不一致 | **已修** | `src/client/lib/kitchen-sync.ts`（新）+ `test/kitchen-sync.test.ts`（7 例，deferred 控制时序）+ `user-state.ts` 改适配层 + `__resetUserStateForTests()` |
| P1-2 迁移会覆盖另一台设备的配置 | **已修** | `UserStateStore.initializeKitchen`（队列内原子）+ `POST /api/kitchen/init` + 迁移改走 init + `migrateFailed` 提示 |
| P1-3 测试写了真实用户数据；根因未确认 | **接受**（已停止 + 记录事实 + 改口径） | `CB-008/CHECK.md §4`（事实记录）；`CB-002 §11 第 5 条` 改为"机制已复现、用户那次途径未确认"；此后验证全走隔离目录 |
| P2-4 运行时校验位置 | **已修**（按 Astra 要求收口） | 新增 `kitchenStateSchema` / `kitchenWriteBodySchema` 到 `src/server/lib/schema.ts`；route 与 store 改为调用它们；类型仍在 `src/shared/types.ts`；**只动本次新增部分**（like/favorite 未动）；补 6 例 schema 测试 |
| P2-5 测试与验收记录夸大 | **已修**（逐项） | deferred 时序测试；真实退出码（0/0/0/0，20 files·256 passed）；`curl --path-as-is` 403 证据；符号链接 200 如实记录；删除未验证表述；CB-007 §6 恢复原始验收项、真机保持未勾选；CB-007 CHECK 修错链与用例数 |
| P2-6 图片/端口结论边界 | **已修** | ADR-0004 与 CB-007 CHECK 改口径（路径级白名单 ≠ realpath）；`start:lan` 显式固定 host/port + README 写明 `0.0.0.0` 含义 |

> 复核里没有被拒绝的意见；P2-4 是唯一"部分接受"（严格校验已补，模块位置待裁决）。

## 详细意见与处置

---

## P1-1 厨具并发保存会导致界面与磁盘不一致 —— 已修

**意见**：`saveKitchen` 每次保存整个 `before`，较早的请求失败或晚返回时会覆盖较新的成功值；服务端串行写队列**不解决客户端响应乱序**；迟到的 `GET` 也能覆盖已完成的 POST。要"单一客户端保存队列 + 已确认状态"，不要只加响应序号。并要求：连续两次修改、两次都失败、前失败后成功、响应乱序、`GET` 晚于 POST 的可控 deferred-promise 测试。

**我的判断**：成立。原实现里 `before = status` 是"调用瞬间的快照"，两个 in-flight 保存交错时确实会把新值回滚掉；发出顺序 ≠ 响应顺序。

**修复**：
- 新增 `src/client/lib/kitchen-sync.ts`：**可独立实例化**的同步器（`createKitchenSync`）——
  - 单一串行队列（save 与 migrate 共用一条链，避免迁移与保存交错）；
  - 区分**乐观值**与**已确认值**（`confirmed` 只在 replace/init/全量拉取成功后更新）；失败回滚到 `confirmed`；
  - 失败时若后面还排着更新的意图，回滚后显示那个更新的意图（不闪回旧值）；
  - `hydrate()` 带**修订号**：拉取发起时的修订号与落地时不一致就丢弃（只用来挡住陈旧 GET，**不是**用它解决顺序问题——顺序由队列解决）。
- `src/client/lib/user-state.ts` 改为该同步器的适配层（对外 API 不变，`status.kitchen` 仍是快照）。
- 测试 `test/kitchen-sync.test.ts`：`deferred` 控制 resolve/reject 顺序，覆盖上面要求的 5 种时序（每例新建同步器，无模块级状态、不依赖执行顺序）。

## P1-2 自动迁移有覆盖已有服务器设置的竞态 —— 已修

**意见**：`use-kitchen.ts` 在 GET 返回 `null` 后**无条件 POST**；两台设备可同时认为"尚未配置"，旧浏览器数据会覆盖另一台刚保存的配置。迁移必须有**服务端队列内原子"仅不存在时初始化"**语义；条件不成立返回现有配置。确认成功或确认已存在前**保留本地键**；迁移失败要有可见反馈；避免 effect 重跑形成连续自动重试。

**我的判断**：成立。原实现是"读-判断-写"，窗口期真实存在。

**修复**：
- 服务端 `UserStateStore.initializeKitchen(tools)`：在**同一条串行队列内的任务里**判断 `this.#state.kitchen === undefined`，是才写；返回 `{ kitchen, created }`。
- 新接口 `POST /api/kitchen/init`（`created: false` 时**不写盘**，返回服务端现有配置）。
- 前端迁移改走 `init`：`created` / `existing` → 采用服务端结果并清掉本地键；`failed` → **保留本地键**、置 `migrateFailed`（面板可见提示），只在下次打开时重试（同一次挂载内不会连续重试）。
- 规格 CB-008 §4/§5 同步补"原子初始化"与并发语义。

## P1-3 测试写入真实用户数据；根因未确认 —— 接受（已停止 + 记录）

**意见**：不应修改 `data/user-state.json`、删除厨具字段或"恢复用户原来的六件"（那六件是我测试浏览器的，不是用户的）；后续全部用 `mkdtemp` 隔离目录与隔离实例；记录此前操作事实；**不能声称已证明用户实际丢失设置的原因**——只证明了同 origin 持久化正常、跨 origin 隔离。

**我的处置**：
- 事实记录（`docs/verification/CB-008/CHECK.md` §5 新增一节）：验证期间通过**应用接口**对真实 `data/user-state.json` 写入过 `kitchen`（我的测试浏览器勾的 6 件），并曾把该字段整段清掉；该文件 `recipes` 部分始终为空，**未触碰任何菜谱/图片/点赞收藏数据**。清掉的动机是避免挡住用户设备上的真实旧值（当时判断那 6 件是我造的，事实成立），但**写法上确实是直接改用户数据文件**，不该做——后续一律 mkdtemp。
- 口径修正：CB-002 §11 第 5 条与 CB-008 相关表述改为"复现出机制（同 origin 正常 / 跨 origin 隔离），**用户那次的具体途径未确认**"。
- 后续所有新增验证走临时目录 + 临时实例（本条修正后新增的证据全部如此）。

## P2-4 运行时校验位置 —— 已修（收口到 schema.ts）

**意见**：厨房请求/文件字段的校验应集中在 `src/server/lib/schema.ts`（zod），不要散在 route/store；严格拒绝未知请求字段；新增类型放 `src/shared/types.ts`；仅修本次新增部分。

**处置**（用户 2026-09-21 明确"按 Astra 的要求走"，所以 P2-4 不再留待裁决）：
- **已搬进 `schema.ts`**：`kitchenStateSchema`（`user-state.json` 的 `kitchen` 字段结构）与 `kitchenWriteBodySchema`（`strictObject`，写接口请求体）—— 运行时校验现在只有一个权威位置；类型 `KitchenState` 已经在 `shared/types.ts`。
- **严格拒绝未知字段**：本来就是 [ADR-0003 §4](../../decisions/adr-0003-write-operations-user-state.md) 的约定（原实现漏了），现在由 `strictObject` 强制。
- **边界的容错分工**：文件侧的“坏一个条目”仍然只丢那个条目（与 `recipes` 同一口径），
  结构不对才当作"从没设置过"；也就是说：**清洗在 store，结构校验在 schema**。
- **没有顺手重构**：`like/favorite` 的 body 校验仍在 route（既有的同类偏差，早于本次改动），要收需单独立项。
- 补了 6 例 schema 测试（`test/schema.test.ts`：接受合法值、拒绝未知字段、拒绝非字符串数组、拒绝坏结构）。

## P2-5 测试与验收记录夸大 —— 已修（逐项）

| 意见 | 处置 |
| --- | --- |
| `kitchen-server.test.tsx` 依赖执行顺序，不算稳健回归 | 逻辑抽成可独立实例化的 `createKitchenSync`，用 deferred 测试（每例全新实例）；React 适配层加 `__resetUserStateForTests()`（仅测试用，注释写明用途），组件用例 `beforeEach` 调用 → 不再顺序依赖 |
| `npm ... \| tail/grep` 的退出码可能来最后一个命令 | 重跑四项门禁：`set -o pipefail` + 直接记录退出码（见 CB-008/CHECK.md §6 与本次提交说明） |
| 缺真实 HTTP 符号链接测试、原始路径穿越测试 | 补：临时数据目录 + 临时实例上，`curl --path-as-is` 发**字面 `..`**（不经客户端规范化）与 `%2e%2e`；`ln -s` 指向目录外文件后走 HTTP 取图。结果记入 CB-007/CHECK.md §2 |
| "Linux 一定 404"、CLS 测量、"同浏览器多 origin 等价真机" | 改口径：大小写变体的状态码**取决于文件系统**（本机 macOS 实测 403，Linux 未实测）；"无跳动"是**盒子高度不变**的实测，**未测 CLS**；多 origin 只证明**存储隔离等价**，**不等于**真机双设备 |
| `CB-007/CHECK.md` 错链 + 测试分项数量错 | 修正链接（`ADR-0004-image-static-hosting.md`）与数量（33 = 10 + 5 + 12 + 6） |
| "新增封面后重启"被换成"新增步骤图"，真机要求被本机测试打勾 | CB-007 §6 恢复原始要求并**实测封面**（临时数据目录：无图 → 重启前 404 → 放 `cover.jpg` → 重启 → 列表/详情出现）；真机相关项**保持未勾选**，单独标注"真机待做" |

## P2-6 图片与端口的有限结论 —— 已修

| 意见 | 处置 |
| --- | --- |
| URL 白名单不是 **realpath** 边界：允许符号链接就不能声称"绝不暴露目录外内容" | 改口径：白名单是**路径级**约束；`data/images` 内的符号链接会被跟随（指向目录外也会提供）。ADR-0004 与 CB-007/CHECK.md 都改为显式风险陈述，**不改政策**（政策是"接受"，理由仍是"能建链接的人已有该目录写权限"） |
| `strictPort` 合理 | 保留 |
| `start:lan` 未显式固定 `COOKBOOK_PORT`，且 `0.0.0.0` 包含全部接口（含 Tailscale/VPN），不等于"仅家庭 LAN" | 脚本改为显式 `COOKBOOK_HOST=${COOKBOOK_HOST:-0.0.0.0} COOKBOOK_PORT=${COOKBOOK_PORT:-3000}`；README 写明 `0.0.0.0` 的含义与收窄办法（`COOKBOOK_HOST=192.168.1.5 npm run start:lan`）；**不改动用户正在用的 5173 URL**，不新增更多启动模式 |

---

## 未采纳

无。P2-4 是"部分接受"（严格校验已做，模块位置待裁决），已在上文说明理由。

## 复核对我的提醒（照做）

- 先记录复核意见（本文件），再按规格门槛修（CB-008 规格先补语义，后改代码），补独立测试，最后收口。
- 清理只动本会话确实创建的临时产物；不用 `git clean -fdx`、不用模糊 `pkill`、不按端口杀进程（会误伤浏览器等客户端）；保留用户正在用的 5173/3000 服务；`data/`、`node_modules/`、构建产物、验收截图都不动。
