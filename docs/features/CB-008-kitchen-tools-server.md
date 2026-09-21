# 功能规格：「我的厨具」改存服务端

## 元数据

| 字段 | 内容 |
| --- | --- |
| 编号 | `CB-008` |
| 状态 | `implemented`（本机验收通过，记录见 [verification/CB-008/CHECK.md](../verification/CB-008/CHECK.md)；**真机双设备待做**） |
| 变更等级 | `T1`（新增接口 + `data/user-state.json` 新增字段；沿用 ADR-0003 的写路径与信任模型，不新增 ADR，只在 ADR-0003 追加"扩展记录"） |
| 创建日期 | 2026-09-21 |
| 最后文档复核 | 2026-09-21 |
| 设计依据 | 用户 2026-09-21 反馈："我修改了餐具，再刷新没有了" → 诊断见 [CB-002 §11 第 5 条](CB-002-kitchen-tools.md)；用户选定"改存服务端（两口子共用一份）" |
| 关联 ADR | [ADR-0003](../decisions/ADR-0003-write-operations-user-state.md)（写操作边界；本文只是给同一文件加一个字段） |
| 预计实现路径 | `src/shared/types.ts`、`src/server/services/user-state-store.ts`、`src/server/routes/user-state.ts`、`src/client/lib/user-state.ts`、`src/client/lib/use-kitchen.ts`、`src/client/lib/api.ts`、`src/client/components/KitchenToolsPanel.tsx`、`src/client/lib/storage.ts`（本地键仅用于迁移） |
| 验收负责人 | 你（两台设备） |

## 1. 目标与非目标

### 目标

1. **一次勾选，处处生效**：手机上勾的厨具，电脑上也算数；换网址（含换端口）、清缓存、重启服务都不丢。
2. **两口子共用一份**（与点赞/收藏同一份 `data/user-state.json`）—— 同一个厨房，本来就只有一套厨具。
3. **不丢数据地迁移**：已经在浏览器本地勾过厨具的，第一次打开新版本时**自动上传一次**，不需要重新勾。
4. 保存失败**看得见**（沿用 CB-002 的既有承诺：不允许"看起来保存了其实没有"）。

### 非目标

1. **不做按人区分**（"谁有什么锅"）—— 共用一份；要分人得先有账号体系，明确不做（ADR-0003）。
2. 不做字段级合并/冲突提示：厨具是"一份配置"而非计数，**后写的覆盖先写的**（§5 有说明）。
3. 不改厨具的判定逻辑（CB-002 的三态与替代优先级完全不动）。
4. 不改词表（`data/equipment.json` 仍是唯一权威，仍是"改词表 + 重启"）。

## 2. 用户场景与状态流

```text
第一次打开新版（本地有旧数据）
  → 服务端没有 kitchen → 把本地那份 POST 上去 → 成功后删掉本地键
  → 之后所有设备都从服务端读

改厨具（任何设备）
  → 点勾选 → 界面立刻变（乐观更新）→ POST /api/kitchen
      ├─ 成功：以服务端返回的归一化结果为准
      └─ 失败：**回滚**界面 + 面板一行提示"这次改动没能保存"，下次再试

另一台设备
  → 打开/刷新页面时 GET /api/user-state 一起拿到 kitchen → 看到的是同一份
```

## 3. 交互细节与状态

| 状态 | 表现 | 说明 |
| --- | --- | --- |
| 默认（服务端没设置过） | 用 `/api/meta` 的 `defaultOwned` | 与现状一致（判定文案仍是"按默认厨具判断"） |
| 已设置 | 用服务端那份；`configured = true` | 面板"已选 N 件" |
| 全不选 | 明确存 `tools: []` | `[]` 与"没设置过"**必须区分**：前者是用户的选择，后者用默认值 |
| 保存中 | 界面**先变**（乐观），无 loading 文案 | 勾选是高频小操作，转圈反而碍事 |
| 保存失败 | 界面回滚 + 面板提示"这次改动没能保存，已恢复原状" | 文案要说明"已恢复"，避免用户以为改上了 |
| 服务端读不到（`GET /api/user-state` 失败） | 先用 `defaultOwned` 在内存里工作 | 面板提示"厨具清单没同步上，刷新重试"（不能静默退回默认值） |
| 词表未载入（`equipment` 为空） | 面板照旧显示"清单未载入，无法勾选" | 不写入、不判断 |
| 词表删掉了某件（本地存过） | 显示时忽略该件（`keepKnownTools` 不变） | 写入时服务端也会拒绝词表外的名字 |
| 两人同时改 | 后写覆盖；各自界面以服务端返回值为准 | 见 §5 |
| 手机端 | 勾选区域 ≥44px、不横向滚动 | 沿用现有样式，本次不改布局 |

## 4. 数据与接口变化

### 数据文件（`data/user-state.json`）

```json
{
  "version": 1,
  "recipes": { "ke-le-ji-chi": { "likes": 1, "favorite": true } },
  "kitchen": { "tools": ["炒锅", "砂锅", "空气炸锅", "烤箱", "电饭锅"], "updatedAt": "2026-09-21T02:10:00.000Z" }
}
```

- `kitchen` **整个字段可缺省**：缺省 = 从未设置过（用 `defaultOwned`）。旧文件不需要迁移。
- `tools` 只存词表里的值，**去重**且顺序按词表（保证同一份配置写出来的字节稳定，便于 `diff` 与备份比较）。
- 不改 `version`（只新增可缺省字段，向前向后都兼容；旧代码读新文件会忽略 `kitchen`）。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/user-state` | **响应新增 `kitchen`**：`{ recipes, kitchen: { tools: string[], updatedAt?: string } \| null }`（一次拿全，不新增读接口） |
| `POST` | `/api/kitchen` | body `{ "tools": string[] }` → 200 `{ tools, updatedAt }`（返回**归一化后**的存储值） |

错误码（与既有写接口一致）：

| 情形 | 状态码 |
| --- | --- |
| body 不是数组 / 含非字符串 | 400 `invalid_tools` |
| 含厨具词表以外的名字 | 400 `unknown_tool`（附 `message` 说明"厨具必须来自词表"） |
| 厨具词表未载入（`equipmentProblem`） | 503 `catalog_unavailable`（环境问题，不是用户输入问题；拒绝写入未校验的数据） |
| 写盘失败（磁盘满/只读） | 503 `write_failed` |

不做鉴权：与只读接口、与点赞收藏同一信任模型（局域网自用）。

## 5. 失败、降级与边界

| 情形 | 行为 | 用户可见反馈 |
| --- | --- | --- |
| 发送中又改一次 | 串行提交（服务端写队列）+ 前端乐观值按顺序推进 | 无（最终以最后一次为准） |
| 两台设备同时改 | 后写覆盖（**明确接受**：这是一份配置，不是计数；不做合并） | 刷新后看到最后一次的值 |
| 写失败 | 回滚前端状态；服务端内存不变（ADR-0003 的原子替换 + 失败回滚） | 面板提示"这次改动没能保存，已恢复原状" |
| 迁移时上传失败 | 保留本地键，下次打开再试（**不删本地**） | 面板提示同步失败 |
| 迁移后本地键删除失败 | 忽略（下次迁移会被服务端已有值挡住，不会重复上传） | 无 |
| 服务端有值、本地也有旧值 | **服务端优先**，本地值不再上传 | 无 |
| `data/user-state.json` 损坏 | 沿用现有行为：另存 `.broken` + 空状态启动 | 日志 warn（厨具退回默认值） |

## 6. 验收标准

- [ ] 在**手机**上勾选/取消厨具 → 电脑上刷新后是同一份（两台设备一次）。
- [ ] 换一个网址（`192.168.1.5:5173` ↔ `127.0.0.1:5173`）打开，厨具仍然是同一份。
- [ ] 清掉浏览器缓存（localStorage）后刷新，厨具还在。
- [ ] `docker restart` / 本地重启服务后厨具还在（`data/user-state.json` 里有 `kitchen`）。
- [ ] **迁移**：先在旧版本（本地存储）勾好厨具 → 打开新版本 → 自动上传（`data/user-state.json` 出现 `kitchen`），本地键被删除，不需要重新勾。
- [ ] 把 `data/user-state.json` 里的 `kitchen` 删掉（或换一台从没设置过的设备）→ 回到 `defaultOwned` 与"按默认厨具判断"文案。
- [ ] 全不选 → 存 `tools: []` → 刷新后仍是"已选 0 件"（而不是回到默认 5 件）。
- [ ] 写盘失败（模拟只读数据目录 / 磁盘满）：接口 503、界面**回滚**、面板提示出现。
- [ ] 词表外的名字（构造请求）→ 400；词表未载入 → 503。
- [ ] `npm run typecheck`、`npm test`、`npm run check:data`、`npm run build` 全绿。

## 7. 测试要点

| 层级 | 用例 |
| --- | --- |
| 单元（store） | `setKitchen` 落盘并可重载；去重 + 按词表顺序归一化；`[]` 与缺省区分；快照包含 `kitchen`；旧文件（无 `kitchen`）→ `null`；写失败回滚内存；串行队列（并发 10 次只留最后一次） |
| 单元（路由，`app.inject`） | 200 + 归一化返回值；非数组/非字符串 → 400；词表外 → 400；词表未载入 → 503；写盘失败（只读目录）→ 503；`GET /api/user-state` 带出 `kitchen` |
| 组件/Hook（jsdom） | 乐观更新 + 失败回滚（注入失败 API）；`defaultOwned` 兜底；服务端无值 + 本地有值 → 迁移只上传一次并删本地键；服务端有值 + 本地有值 → 不上传；读失败 → 提示"没同步上" |
| 手工/双设备 | 手机改 → 电脑看；换网址看；清缓存看；重启服务看；迁移路径（先用旧版勾，再升级） |
| 回归风险 | 点赞/收藏（同一文件、同一队列）；`CB-002` 的厨具三态与卡片标记；`freeze` 式断言（快照结构变化会影响这两个接口的既有测试） |

## 8. 风险、回滚与依赖

- **风险 1（写面变大）**：又多了一个写接口。缓解：同一个文件、同一条串行队列、同一套原子替换与回滚；接口只接受 `POST` + JSON 且严格校验。
- **风险 2（覆盖 vs 合并）**：两人同时改会互相覆盖。明确接受（一份配置、低频操作），并在 §5 写明；如果将来要分人，必须新立规格 + 账号体系。
- **风险 3（迁移重复上传）**：只在"服务端没有值 且 本地有值"时上传，且成功后删本地键 → 最坏情况是重复上传一次相同内容，无副作用。
- **回滚**：把 `use-kitchen` 改回读本地即可（服务端字段留着不影响任何功能；`data/user-state.json` 里的 `kitchen` 可以手工删）。
- **依赖**：无新依赖；依赖 CB-002（判定逻辑）与 ADR-0003（写路径）。

## 9. 实施拆解与顺序

1. **服务端存储**：`UserStateStore` 增加 `kitchen` 字段与 `setKitchen(tools)`（归一化、串行、回滚）+ 单测。
2. **接口**：`GET /api/user-state` 带出 `kitchen`；`POST /api/kitchen`（词表校验、400/503）+ 路由测试。
3. **前端**：客户端 store 扩展（`kitchen` 与乐观更新）、`useMyKitchen` 走服务端、迁移逻辑、面板文案与失败提示。
4. **文档与验收**：`DATA_MODEL §7`、`ADR-0003` 扩展记录、`README` 接口表、`CB-002` 演进路径指向本文、`START-HERE`/`ROADMAP`、`docs/verification/CB-008/CHECK.md`（含双设备实测）。

## 10. 文档影响与实施前复核

- [x] 已阅读 [START-HERE](../START-HERE.md)、[AGENTS](../../AGENTS.md)、[DATA_MODEL §7](../DATA_MODEL.md)、[ADR-0002](../decisions/ADR-0002-json-files-as-source-of-truth.md)、[ADR-0003](../decisions/ADR-0003-write-operations-user-state.md)、[CB-002](CB-002-kitchen-tools.md)、[CB-005](CB-005-likes-favorites.md)。
- [x] 与现有文档无冲突：ADR-0003 已允许该文件承载用户状态，本次只新增一个可缺省字段（不新增 ADR，在 ADR-0003 追加"扩展记录"）。
- [x] 每条事实的权威位置：写操作边界 → ADR-0003；文件字段 → DATA_MODEL §7；厨具判定 → CB-002；本文只写"改成服务端"的交互、接口与迁移。
- [x] 本规格已达到 `accepted`（2026-09-21 用户选定"改存服务端（两口子共用一份）"）。
- [x] 实现后同步：`DATA_MODEL.md`、`ADR-0003`（扩展记录）、`README.md`、`CB-002`（标旧口径已改进）、`START-HERE.md`、`ROADMAP.md`、`features/README.md`、`verification/CB-008/CHECK.md`。

## 11. 实现与验证证据（实现后填写）

| 项目 | 证据 |
| --- | --- |
| 实现路径 | `src/shared/types.ts`（`KitchenState` + `UserStateResponse.kitchen`）；`src/server/services/user-state-store.ts`（`kitchen` 字段、`setKitchen`、通用化 `#mutate`）；`src/server/routes/user-state.ts`（`POST /api/kitchen`）；`src/client/lib/api.ts`（`postKitchen`）；`src/client/lib/user-state.ts`（status store + `saveKitchen` 乐观更新/回滚）；`src/client/lib/use-kitchen.ts`（服务端权威 + 迁移）；`src/client/lib/kitchen.ts`（`readMyTools` 仅供迁移、`clearMyTools`）；`src/client/components/KitchenToolsPanel.tsx`；`src/client/pages/HomePage.tsx`、`RecipePage.tsx` |
| 静态检查 | `npm run typecheck` → exit 0（三套 tsconfig） |
| 自动化测试 | `npm test` → **241 passed**（新增 18：store 8、route 6、hook/组件 4；面板测试改为异步提交） |
| 数据校验 | `npm run check:data` → 371 通过 / 0 失败 |
| 生产构建 | `npm run build` → exit 0 |
| 真实运行（本机浏览器） | ① 迁移：本地 7 项（含词表外的名字）→ 服务端 6 项（过滤 + 按词表排序）+ 本地键清除；② `127.0.0.1` / `localhost` / `192.168.1.5` 三个 origin 显示**同一份**；③ 在 `.5` 取消一件 → `.4` 刷新后同步；④ 另起实例（端口 3100，同一数据目录）读到的厨具与写入一致（= 重启不丢）；⑤ 「全不选」存 `[]`、刷新后仍 0 件（未回到默认 5 件）；⑥ 拦截 `POST /api/kitchen` 返回 503 → 勾选**回滚** + 面板提示。逐条见 [verification/CB-008/CHECK.md](../verification/CB-008/CHECK.md) |
| **真机双设备** | **未做**：手机改、电脑看（本次用同一浏览器不同 origin 验证隔离性） |
| 已知限制或未验证假设 | 不做按人区分（共用一份）；两人同时改是**后写覆盖**（未实测并发）；服务端真实写失败（磁盘满/只读）未在真实环境模拟（前端回滚用 route 503 验证、服务端回滚有单测）；服务器未部署 |

## 12. 复核记录

| 日期 | 变更 | 阅读和复核的文档 | 结论 |
| --- | --- | --- | --- |
| 2026-09-21 | 建立规格（用户选定服务端存储；迁移策略与覆盖语义明确） | START-HERE、AGENTS、DATA_MODEL、ADR-0002/0003、CB-002/005 | `accepted`（开始实现） |
| 2026-09-21 | 实现完成（存储/接口/前端/迁移）+ 本机验收（迁移、跨 origin 共用、重启保持、失败回滚）；文档回填 | DATA_MODEL §7、ADR-0003 扩展记录、README、CB-002、START-HERE、ROADMAP、[CHECK.md](../verification/CB-008/CHECK.md) | `implemented`（**真机双设备待做**） |
