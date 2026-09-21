# CB-008 「我的厨具」改存服务端 · 验收记录

日期：2026-09-21 ｜ 规格：[`../../features/CB-008-kitchen-tools-server.md`](../../features/CB-008-kitchen-tools-server.md) ｜ ADR：[`ADR-0003`](../../decisions/ADR-0003-write-operations-user-state.md)（扩展记录）

环境：

| 项 | 值 |
| --- | --- |
| 机器 / 服务 | Mac mini，开发模式（Vite `5173` + 后端 `3000`），真实数据（371 道菜 / 13 件厨具） |
| 浏览器 | Playwright 自带 Headless Chrome，手机视口 390×844，`zh-CN` |
| 数据文件 | `data/user-state.json`（新增 `kitchen` 字段） |

## 1. 逐条验收（对应规格 §6）

| # | 验收项 | 怎么验的 | 结果 |
| --- | --- | --- | --- |
| 1 | 一台设备改、另一台看到同一份 | 在 `192.168.1.5:5173` 取消「烤箱」→ 刷新 `127.0.0.1:5173` | ✅ 两处都是"已选 5 件"，服务端 `kitchen.tools` 同步为 5 件（**同一浏览器不同 origin 等价于不同设备的隔离**；真机双设备待你验，见 §3） |
| 2 | 换网址看到同一份 | `127.0.0.1:5173` / `localhost:5173` / `192.168.1.5:5173` 分别打开面板 | ✅ 三者都显示同一份 6 件，且它们的 `localStorage['cookbook:kitchen']` 都是 `null`（不再依赖浏览器存储） |
| 3 | 清缓存后还在 | 上面三处本地键均为空，值全部来自 `GET /api/user-state` | ✅ 清 localStorage 不影响（权威在服务端） |
| 4 | 重启服务后还在 | 另起一个实例（`COOKBOOK_PORT=3100 node dist/server/server/main.js`，同一数据目录）读 `/api/user-state` | ✅ 新实例读出 `['炒锅','砂锅','空气炸锅','微波炉','电饭锅']`；随后按 PID 停掉，开发服务不受影响 |
| 5 | **迁移**：旧版本浏览器里的值自动上传一次 | 手工造旧值 `["炒锅","砂锅","空气炸锅","烤箱","电饭锅","微波炉","已删除的锅"]` → 重新加载 | ✅ 上传 6 件（词表外的「已删除的锅」被过滤）、顺序按词表、`localStorage` 键被清掉、`data/user-state.json` 出现 `kitchen` |
| 6 | 服务端没设置过时用 `defaultOwned` | 单元测试（`kitchen-server.test.tsx` 用例 1/2 的兜底断言）+ 迁移前的面板曾显示"已选 5 件"（= `defaultOwned`） | ✅ 且 `configured=false`（判定文案仍说"按默认厨具判断"） |
| 7 | 全不选存 `tools: []`，刷新后仍是 0 件 | 面板点「全不选」→ 刷新 | ✅ 刷新后仍"已选 0 件"（没有回到默认 5 件）；服务端 `kitchen.tools = []`。验完已**还原**用户原来的 6 件 |
| 8 | 写盘失败 → 503 + 界面回滚 + 提示 | 用 Playwright 拦截 `POST /api/kitchen` 返回 503，再勾选「蒸锅」 | ✅ 勾选**回到未选状态**（回滚），面板提示"这次改动没能保存（没能写到服务器），已恢复原状…" |
| 9 | 词表外的名字 → 400；词表未载入 → 503 | 路由测试（`test/kitchen-route.test.ts`，`app.inject`） | ✅ `unknown_tool` 400（`message` 指名"不粘锅"、`allowed` 列出全部可选值）；缺 `equipment.json` 的实例 → `catalog_unavailable` 503 |
| 10 | 门禁 | 命令 | ✅ `npm run typecheck` exit 0；`npm test` **241 passed**（+18）；`npm run check:data` 371 通过 / 0 失败；`npm run build` exit 0 |

## 2. 自动化测试分布（新增 18 例）

| 文件 | 覆盖 |
| --- | --- |
| `test/user-state.test.ts`（+8） | `setKitchen` 落盘与重载、不冲掉点赞/收藏、`[]` 与"从未设置过"的区分、去重去空白、并发 10 次只留最后一次、写失败回滚内存、`normalizeState` 对旧文件/坏 `recipes`/非字符串项的容错 |
| `test/kitchen-route.test.ts`（+6，集成） | 200 + 词表顺序归一化 + 真的写进 `user-state.json`；`[]` 合法；非数组/非字符串 → 400；词表外 → 400 + 可选值；词表未载入 → 503；写厨具不冲掉点赞收藏 |
| `test/kitchen-server.test.tsx`（+4，jsdom） | 拉取失败 → 用默认清单并标记"没同步上"；**迁移一次**（词表过滤 + 清本地键）；保存失败回滚；保存成功以服务端归一化值为准 |
| `test/kitchen-ui.test.tsx`（改） | 面板改为异步提交（`apply` 返回 Promise）；失败提示改为"没能保存 + 已恢复原状"；新增"没同步上"提示 |

## 3. 未验证 / 待做

| 项 | 现状 |
| --- | --- |
| **真机双设备**（手机 + 电脑各改一次） | 未做：本次用同一浏览器不同 origin 验证隔离性；真机需你点一遍（这才是本功能的核心价值） |
| 两人**同时**改（覆盖语义） | 未实测并发场景；规格 §5 已明确"后写覆盖"，实现是整份替换 |
| 服务端磁盘满 / 只读数据目录的**真实**写失败 | 用 route 拦截 503 模拟了前端回滚；服务端侧由既有 ADR-0003 的写失败路径覆盖（单测：写失败回滚内存） |
| 服务器部署 | 未做（T3，需授权）。部署后 `data/user-state.json` 一起进备份，行为与本地一致 |

## 4. 截图

| 文件 | 内容 |
| --- | --- |
| `kitchen-panel-mobile.png` | 手机视口：面板显示"存在服务端（跟点赞、收藏一起），两口子共用一份…"+ 已选 N 件 |
