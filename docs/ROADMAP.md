# 逐步实施计划

状态：M0–M4 已完成并本地验证，M5 待做
日期：2026-09-19

本文件只负责**里程碑拆分与进度**（权威位置）；具体功能的目标、交互、数据与验收在 `features/` 的规格里，本文件只链接。

規矩：T1 及以上变更先有状态为 `accepted` 的功能规格再开工，见 [`../AGENTS.md`](../AGENTS.md)。

每个里程碑都是**可运行、可验收**的，做完就能用，不存在"做一半不能用"的中间态。

## 进度总览

| 里程碑 | 状态 | 验证方式 |
| --- | --- | --- |
| M0 工程骨架 | ✅ 完成 | `npm run typecheck` 三套配置全过 |
| M1 列表页 | ✅ 完成 | 生产构建下 2 道样例菜正常展示 |
| M2 搜索筛选 | ✅ 完成 | 菜名/别名/食材/标签命中、叠加筛选均实测通过 |
| M3 详情页 | ✅ 完成 | 食材分组、步骤打勾、进度条、字号调节均实测通过 |
| M3+ 做菜顺手 | ✅ 用户验收 done | [CB-001](features/CB-001-cooking-mode.md)（`implemented`）：一键计时与到点提醒、吸顶回位、屏幕常亮；折叠与份量换算均按反馈**移除** |
| M3++ 厨具匹配 | ✅ 用户验收 done | [CB-002](features/CB-002-kitchen-tools.md)（`implemented`）：厨具受控词表、勾选我的厨具、缺件标记、替代方案 |
| 组件层测试基础设施 | ✅ 已完成 | jsdom + Testing Library；20 个组件测试覆盖到点提醒、索引清洗、保存失败、词表未载入 |
| 稳定化（独立复核后） | ✅ 已完成第一轮 | [overall-review/FIXES.md](verification/overall-review/FIXES.md)：P1 × 7 已修（假承诺、词表两洞、保存失败、44px、到点提醒） |
| 丰富菜单（导入） | ✅ 已完成 | [CB-003](features/CB-003-howtocook-import.md)：总计 371 道，其中从公有领域 HowToCook 导入 **369 道** |
| 份量档位 | 已撤回 | [CB-004](features/CB-004-serving-scale.md) 已 `superseded`；详情页按菜谱原文显示，不做换算 |
| 点赞/收藏/排序 | ✅ 已完成 | [CB-005](features/CB-005-likes-favorites.md) + [ADR-0003](decisions/ADR-0003-write-operations-user-state.md)：服务端共享、失败回滚 |
| tag 词表与分类 | ✅ 已完成 | [CB-006](features/CB-006-tags.md)：受控 tag 词表与逐道分类；当前覆盖与空标签说明见规格 §6b |
| 厨具改存服务端 | ✅ 用户验收 done | [CB-008](features/CB-008-kitchen-tools-server.md)：`data/user-state.json` 新增 `kitchen` 字段 + `POST /api/kitchen`；旧浏览器本地值自动迁移；专项检查状态见 [verification/CB-008/CHECK.md](verification/CB-008/CHECK.md) |
| 导入内容的时间提取 | ✅ 已完成 | 36 条交 LLM 判定：填入 34、判定不填 2；内容警告从 52 条降到 19 条 |
| M4 图片 | ✅ 用户验收 done | [CB-007](features/CB-007-images.md)（`implemented`）+ [ADR-0004](decisions/ADR-0004-image-static-hosting.md)：封面/头图/步骤图，服务端扫描 + `/images/*` 白名单托管；专项检查状态见 [verification/CB-007/CHECK.md](verification/CB-007/CHECK.md) |
| CB-009 编辑与历史 | ✅ 用户验收 done | [CB-009](features/CB-009-edit-mode.md)：编辑、历史快照、恢复与 409 版本守卫；专项检查状态见 [verification/CB-009/CHECK.md](verification/CB-009/CHECK.md) |
| CB-010 来源与重新同步 | ✅ 用户验收 done | [CB-010](features/CB-010-source-and-resync.md)：来源基线、三方比较、同步和 LLM 提案；真实上游更新演练尚未执行，见用户[验收记录](verification/OWNER-ACCEPTANCE.md) |
| M5 后续候选 | ⬜ 按需选做 | 见下方列表；每个新写操作仍需单独规格与 ADR |

已跑通的验证命令（截至 2026-09-19）：

```bash
npm run typecheck   # 0 错误（前端 / 后端 / 测试 三套 tsconfig）
npm test            # 190 passed
npm run check:data  # 2 个样例菜谱校验通过
npm run build && npm start   # 生产构建启动，HTTP 接口与页面均返回 200
```

---

## M0 · 工程骨架（约 1 小时）✅

做什么：

1. 初始化工程：`package.json`、`tsconfig.json`、`tsconfig.server.json`、`vite.config.ts`、`.gitignore`
2. 依赖：`fastify`、`@fastify/static`、`zod`、`react`、`react-dom`、`vite`、`typescript`、`tsx`、`vitest`
3. 目录落地（本仓库已有结构）+ 空实现占位
4. npm scripts：`dev` / `dev:web` / `dev:server` / `build` / `typecheck` / `test`
5. 数据校验脚本 `scripts/check-data.ts`（经 tsx 运行），先跑通现有 2 个样例菜谱

验收：

```bash
npm install
npm run typecheck        # 通过
npm run check:data       # 2 个样例菜谱全部校验通过
```

实际结果：通过。补充了三套 tsconfig（`tsconfig.json` / `tsconfig.server.json` / `tsconfig.test.json`），
数据校验脚本改用与后端**同一份 zod 规则**（`scripts/check-data.ts`，经 tsx 运行），避免两套规则漂移。

---

## M1 · 能浏览：列表页（约 2 小时）✅

做什么：

1. 后端 `recipe-repository.ts`：启动读取 `data/recipes/*.json` → zod 校验 → 内存索引（含坏文件跳过与告警）
2. 后端路由：`GET /api/recipes`、`GET /api/meta`
3. 前端首页：菜品卡片网格（菜名、分类、标签、耗时、难度），移动端单列
4. 前端 `lib/api.ts`、`lib/types.ts`
5. 空状态、加载状态、错误提示

验收：

- 浏览器打开首页，看到 2 道样例菜
- 故意放一个坏 JSON，服务仍能启动，日志指出坏文件名，页面照常显示其他菜
- 手机宽度（390px）无横向滚动

实际结果：通过。坏文件场景由 `test/recipe-repository.test.ts` 覆盖（坏 JSON、缺字段、id 与文件名不符、目录不存在）；
390×844 视口截图确认无横向滚动，列表为单列卡片。

---

## M2 · 能找到：搜索与筛选（约 2 小时）✅

做什么：

1. 后端 `/api/recipes?q=&category=&tag=` 搜索：匹配 `name`、`aliases`、`ingredients[].name`、`tags`
2. 前端搜索框：输入即时筛选（debounce 150ms），命中的菜名/食材**高亮**
3. 分类与标签筛选条（来自 `/api/meta`），可与搜索叠加
4. 无结果时的友好提示（"没找到，试试搜食材名"）

验收：

- 输入"西红柿"→ 出现西红柿炒鸡蛋；输入"小葱"（食材名）→ 同样命中
- 输入"番茄"→ 命中（别名命中）
- 搜索 + 标签筛选叠加结果正确
- 命中关键词在页面上高亮

实际结果：通过。实测：`q=西红柿`→1 条；`q=番茄`（别名）→1 条；`q=小葱`（食材，不在菜名里）→1 条；
`q=可乐&tag=宴客`→1 条；`q=可乐&tag=快手`→0 条（叠加生效）。搜索词同步到地址栏，从详情页返回时原样恢复。

---

## M3 · 能做菜：详情页（约 2 小时）✅

做什么：

1. 后端 `GET /api/recipes/:id`（含 404 处理）
2. 详情页布局：菜名 → 摘要 → 元信息（份量/耗时/难度）→ **食材清单** → **编号步骤** → 小贴士
3. 步骤卡片显示 `heat`（火候）、`minutes`（时间）、`tip`（小提醒）
4. 做菜模式：点击步骤可标记"已完成"（灰化 + 划线），进度 `3/5`
5. 字号调节按钮（A- / A+，用 CSS 变量实现）
6. 返回列表时保留搜索词与滚动位置

验收：

- 手机上：食材与步骤无需横向滚动；点击区域足够大
- 标记进度在页面跳转回来时仍保留（本次会话内）
- 直接从 URL 打开详情页（刷新）正常

实际结果：通过。实测：点步骤 → `aria-pressed=true`、进度条 50%、状态写入 sessionStorage；
A+ 字号 → 步骤正文 16px→17.92px（16×1.12）并持久化；
直接访问 `/recipe/xxx` 刷新返回 200（SPA 兜底生效）；`/recipe/不存在的id` 显示"没有这道菜"。

> 未验证（数据太少）：长列表的滚动位置恢复——只有 2 道菜时页面不足一屏，无法真正测出，等菜谱变多后复验。
>
> 到这里，`REQUIREMENTS.md` 的 F1–F6 全部完成，第一期可交付并部署。
>
> 后续增强不再在本文件里描述细节：厨具匹配见 [CB-002](features/CB-002-kitchen-tools.md)，做菜顺手（计时/吸顶/常亮）见
> [CB-001](features/CB-001-cooking-mode.md)。两者均为 `implemented`；当前版本已由用户验收，见[用户验收记录](verification/OWNER-ACCEPTANCE.md)。

---

## M4 · 图片（约 2–3 小时）✅ 已实现，用户验收 done

| 产物 | 状态 |
| --- | --- |
| [CB-007 图片展示](features/CB-007-images.md) | `implemented`（范围、交互、失败降级、验收、测试要点都在这里） |
| [ADR-0004 从数据目录托管图片](decisions/ADR-0004-image-static-hosting.md) | 已接受（暴露面白名单、缓存语义、为什么首版不做缩略图） |
| [验收记录](verification/CB-007/CHECK.md) | 逐条验收 + 安全边界实测 + 截图（**真机待做**） |

结果：371 道菜中 **179 道有封面**；列表懒加载、无图回落首字色块；详情限高头图；步骤图在完成按钮之外。
**首版不做压缩缩略图**（用户已批准该取舍）：列表用原图 + 懒加载，滚动看完现有图片累计约 56 MiB —— 真机若卡，另立规格做缩略图。

---

## M5 · 增值（按需选做）

> CB-009 编辑与 CB-010 来源同步已按各自 ADR/规格实现。新增网页写入口（例如上传图片）仍会改变 [ADR-0002](decisions/ADR-0002-json-files-as-source-of-truth.md) 的写入边界，需先立 ADR 与功能规格。

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| ~~撤销~~ | ~~份量换算~~ | **2026-09-20 撤销**：两人份是家庭基准，不是缩放授权；且与步骤文案矛盾。要重启先立规格（见 [OPEN_QUESTIONS](OPEN_QUESTIONS.md) Q10） |
| 低 | 最近浏览 | 收藏已由 CB-005 实现；最近浏览可按实际使用频率决定 |
| 中 | **编辑菜谱 + 修改记录** | ✅ [`CB-009`](features/CB-009-edit-mode.md)（`implemented`，用户验收 done）：编辑页 + 修改记录 + 恢复 + 409 冲突 UI；后端写入协议与专项检查记录见 [CHECK](verification/CB-009/CHECK.md) |
| 中 | **来源基线与重新同步** | ✅ [`CB-010`](features/CB-010-source-and-resync.md)（`implemented`，用户验收 done）：`sourceRef` + 基线快照 + 三方合并；真实模型冲突流程已验，真实上游更新场景未实际演练 |
| 中 | 上传图片 | 网页上传并自动压缩到 `data/images/` |
| 低 | 购物清单 | 多选菜谱合并食材，可勾选 |
| 低 | PWA | 加到手机桌面，像 App 一样打开 |
| 低 | 模糊/拼音搜索 | 引入 Fuse.js 或加拼音索引 |

---

## 每步的通用节奏

1. **写文档/接口先定**：字段或 API 变了，先改 `docs/`，再改代码。
2. **小步提交**：一个里程碑内 2–4 次提交，消息写清楚"做了什么、为什么"。
3. **本地验收 → 再上服务器**：本地 `npm run typecheck && npm test` 通过才部署。
4. **部署后实测**：按 `DEPLOYMENT.md` 的验证清单在手机上真机点一遍。

## 时间预估汇总

| 里程碑 | 预估 | 累计 |
| --- | --- | --- |
| M0 骨架 | 1h | 1h |
| M1 列表 | 2h | 3h |
| M2 搜索筛选 | 2h | 5h |
| M3 详情页 | 2h | 7h |
| M4 图片 | 2–3h | 9–10h |
| M5 增值 | 按需 | —— |

> 估算基于"我来实现 + 你验收"，不含你整理菜谱内容的时间。
