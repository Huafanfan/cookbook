# CB-008 「我的厨具」改存服务端 · 验收记录

日期：2026-09-21（2026-09-21 按复核意见修订：补隔离实例证据、记录真实数据写入事实、删掉夸大表述）

规格：[`../../features/CB-008-kitchen-tools-server.md`](../../features/CB-008-kitchen-tools-server.md) ｜ ADR：[`ADR-0003`](../../decisions/ADR-0003-write-operations-user-state.md)（扩展记录）

环境：

| 项 | 值 |
| --- | --- |
| 机器 / 开发服务 | Mac mini，开发模式（Vite `5173` + 后端 `3000`），真实数据（371 道菜 / 13 件厨具） |
| 浏览器 | Playwright 自带 Headless Chrome，手机视口 390×844，`zh-CN` |
| 隔离实例 | 临时数据目录（`mktemp -d`）+ 端口 `3102`，用完**按 PID** 停掉并删除目录（不碰真实 `data/`） |
| 数据文件 | `data/user-state.json`（新增 `kitchen` 字段） |

## 1. 逐条验收（对应规格 §6）

| # | 验收项 | 怎么验的 | 结果 |
| --- | --- | --- | --- |
| 1 | 换网址看到同一份 | `127.0.0.1:5173` / `localhost:5173` / `192.168.1.5:5173` 分别打开面板 | ✅ 三者显示同一份，且它们的 `localStorage['cookbook:kitchen']` 都是 `null` |
| 2 | 跨设备（存储隔离）等效验证 | 在 `192.168.1.5:5173` 取消「烤箱」→ 刷新 `127.0.0.1:5173` | ✅ 两处都是同一份 5 件。⚠️ 这是**同一浏览器的两个 origin**，只证明"存储不再按 origin 隔离"，**不等于真机双设备**（真机见 §5） |
| 3 | 清缓存后还在 | 三处本地键均为空，值全部来自 `GET /api/user-state` | ✅ 清 localStorage 不影响 |
| 4 | 重启服务后还在 | 另起实例（`COOKBOOK_PORT=3100`，同一数据目录）读 `/api/user-state` | ✅ 读到与写入一致；随后按 PID 停掉，开发服务不受影响 |
| 5 | **迁移**：旧浏览器本地值自动上传一次 | 隔离实例：种下本地旧值（含词表外名字）→ 重新加载 | ✅ 网络日志显示走的是 **`POST /api/kitchen/init`**（不是 `/api/kitchen`）；词表外的名字被过滤、顺序按词表、本地键清除、隔离目录的 `user-state.json` 出现 `kitchen` |
| 6 | **迁移不覆盖**（原子初始化） | ① 真实 HTTP：隔离实例已有配置时 `POST /api/kitchen/init {tools:["微波炉"]}` → `created:false`，存储值保持不变；② 路由测试：`created:false` 时文件字节不变（含 `updatedAt`） | ✅ 两台设备同时迁移时只有第一台会写 |
| 7 | **并发不变脏**（保存/回滚/乱序/陈旧拉取） | `test/kitchen-sync.test.ts`：连续两次修改、两次都失败、前失败后成功、陈旧 hydrate、迁移与保存共用队列 | ✅ 串行发出（同一时刻在飞 ≤ 1）、失败只回滚到已确认值、陈旧拉取被丢弃 |
| 8 | 服务端没设置过时用 `defaultOwned` | 组件测试（拉取成功但 `kitchen: null` → 用 `initial.test`）+ 迁移前面板曾显示默认 5 件 | ✅ 且 `configured=false` |
| 9 | 全不选存 `tools: []`，刷新后仍是 0 件 | 面板点「全不选」→ 刷新 | ✅ 刷新后仍"已选 0 件"（没回到默认 5 件）。验完已按当时状态还原（见 §4 的事实记录） |
| 10 | 写盘失败 → 503 + 界面回滚 + 提示 | Playwright 拦截 `POST /api/kitchen` 返回 503，再勾选「蒸锅」 | ✅ 勾选**回到未选状态**，面板提示"这次改动没能保存…已恢复原状" |
| 11 | 词表外 → 400；未知字段 → 400；词表未载入 → 503 | 路由测试（`app.inject`） | ✅ `unknown_tool` 400（列出全部可选值）；`{tools:[], extra:1}` → `invalid_body` 400；缺 `equipment.json` 的实例 → `catalog_unavailable` 503 |
| 12 | 门禁（**记真实退出码，不用管道**） | 四条命令各自重定向到文件后读 `$?` | ✅ `npm run typecheck` = **0**；`npm test` = **0**（20 files / **256 passed**）；`npm run check:data` = **0**（371 通过 / 0 失败）；`npm run build` = **0** |

## 2. 自动化测试分布（CB-008 相关共 33 例：落地 18 + 并发修复 15）

| 文件 | 用例数 | 覆盖 |
| --- | --- | --- |
| `test/kitchen-sync.test.ts`（新，并发修复） | **7** | 串行队列（在飞 ≤ 1）、两次都失败回滚到已确认值、前失败后成功不回退、陈旧 hydrate 被丢弃、hydrate 基本路径、迁移与保存共用队列、created/existing/failed |
| `test/kitchen-server.test.tsx`（接线，**用例间互不依赖**） | **6** | 服务端有值优先；拉取失败兜底 + 标记；迁移走 init 并清本地键；`created:false` 不覆盖；迁移失败保留本地键 + 标记；保存失败回滚 |
| `test/kitchen-route.test.ts` | **9** | 保存 200 + 词表排序 + 落盘；`[]` 合法；非数组 → 400；未知字段 → 400；词表外 → 400；词表未载入 → 503；不冲掉点赞收藏；**init 原子性**；init 同样严格校验 |
| `test/user-state.test.ts`（新增部分） | **8** | `setKitchen` 落盘/重载/不冲掉点赞收藏/去重/`[]` 与缺省区分/并发串行/写失败回滚；`normalizeState` 容错；`initializeKitchen` 仅在未设置时创建 + 不写盘 + 与 setKitchen 并发 |
| `test/kitchen-ui.test.tsx`（改） | — | 面板改为异步提交；失败提示；"没同步上"与"迁移没同步上"提示 |

## 3. 隔离实例补充证据（不碰真实 `data/`）

```text
POST /api/kitchen/init {tools:["微波炉"]}  →  200 { created: false, kitchen: { tools: ["空气炸锅","烤箱"] } }
浏览器（隔离实例）：localStorage 旧值 = ["烤箱","空气炸锅","词表外的锅"]
  → 网络日志：POST /api/kitchen/init 200
  → 落盘：{"tools":["空气炸锅","烤箱"],...}（词表外的名字被过滤，顺序按词表）
  → localStorage['cookbook:kitchen'] 变为 null（迁移结束）
```

## 4. 事实记录：验证期间对真实 `data/user-state.json` 的写入（应避免）

复核（[REVIEW.md](../current-review/REVIEW.md) P1-3）指出：验证阶段我**直接改过真实数据文件**。记录事实：

- 通过应用接口在真实 `data/user-state.json` 里写入过 `kitchen`（我在 Playwright 浏览器里勾的 6 件，不是你的设置）；
- 之后为了不挡住你设备上的真实旧值，**手工把 `kitchen` 字段整段删掉**；
- 再之后验证「全不选」时写入了 `[]`，验完用接口还原成那 6 件；
- 该文件的 `recipes` 部分自始至终为空，**菜谱、图片、点赞收藏数据一律未动**；
- 当前状态：`kitchen = null`（等你的设备首次打开时自动迁移上来）。

**结论**：这些写入没有破坏数据，但**做法不对**（不该拿用户数据文件当测试场地）。此后所有验证都在 `mktemp -d` 的隔离目录 + 独立端口实例上做（§3 就是按这个方式补的）。

## 5. 未执行的专项检查

本功能的用户验收已由用户标记为 `done`，见 [OWNER-ACCEPTANCE](../OWNER-ACCEPTANCE.md)。下表只记录尚未实际执行的双设备和存储失败检查。

| 项 | 现状 |
| --- | --- |
| **真机双设备**（手机改、电脑看） | **未做**：§1 第 2 项是同一浏览器的两个 origin，只等价于"存储不再按 origin 隔离"，不能替代真机 |
| 两人**同时**改（覆盖语义） | 未实测并发场景；规格 §5 已明确"后写覆盖"，实现是整份替换 |
| **两台设备同时迁移** | 用真实 HTTP 验了 `created:false` 不覆盖；两台设备真并发未实测（服务端判定在队列内，逻辑上是原子的） |
| 服务端磁盘满 / 只读数据目录的**真实**写失败 | 前端回滚用 route 拦截 503 验证；服务端侧由 ADR-0003 的写失败路径 + 单测覆盖（写失败回滚内存），真实只读挂载未实测 |
| 服务器部署 | 当前运行状态见 [DEPLOYMENT](../../DEPLOYMENT.md)。`data/user-state.json` 位于服务器数据卷；备份与恢复步骤见部署手册 §5，本次未核对是否配置定时备份 |
