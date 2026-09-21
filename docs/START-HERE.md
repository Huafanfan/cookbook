# 从这里开始

最后更新：2026-09-19 ｜ 这份文件的职责是**当前状态与阅读路径**，不重复其他文档的细节。

## 当前状态

**M0–M4 与 CB-001…CB-008 已完成**（做菜顺手、厨具匹配、导入、份量档位、点赞收藏、tag、图片、厨具改服务端），本机浏览器（手机视口 + 桌面）实测通过，**尚未真机验收**，**尚未部署到服务器**。

- 能用的：浏览、搜索（菜名/别名/食材/标签）、分类与标签筛选、详情页（食材分组、**厨具匹配与缺件标记**、步骤打勾、一键计时与到点提醒、吸顶回位、字号调节、屏幕常亮）、**图片（列表封面、详情头图、步骤配图；无图不破图）**；份量按原文显示，不做换算
- **我的厨具存服务端**（[CB-008](features/CB-008-kitchen-tools-server.md) `implemented`）：与点赞/收藏同一份 `data/user-state.json`，两口子共用一份；升级时会把浏览器里的旧值自动上传一次（走 `POST /api/kitchen/init`，服务端原子判定）。独立复核后已修掉并发保存与迁移竞态，见 [verification/current-review/REVIEW.md](verification/current-review/REVIEW.md)
- 数据：**371 道菜**（自建 2 + 从 HowToCook 导入 369）+ `data/equipment.json`（厨具权威词表 13 件）；179 道有成品图（`data/images/`，56MB，不进 git）
- **内容来源**：HowToCook 为 Unlicense（公有领域）可自由使用；老乡鸡的 CookLikeHOC **无 LICENSE** 故不使用其内容。见 [DATA_MODEL §8](DATA_MODEL.md)
- **独立复核已完成（2026-09-20）**：[overall-review/AUDIT.md](verification/overall-review/AUDIT.md) —— 结论 `OK with notes`：**P0 无、P1 × 7、P2 × 12**；CB-001/CB-002 的验收清单**全未勾选**，故两份规格保持 `implemented`，**不得称 `verified`**
- **稳定化第一轮已完成（2026-09-20）**：[FIXES.md](verification/overall-review/FIXES.md) —— P1 × 7 全部修完并逐条实测，P2 × 12 修完 12 条；两份规格仍为 `implemented`
- **点赞/收藏已完成（2026-09-20）**：[CB-005](features/CB-005-likes-favorites.md) + [ADR-0003](decisions/ADR-0003-write-operations-user-state.md) —— 本项目**第一个写操作**（服务端共享、原子替换、失败回滚）；排序＝收藏优先→点赞降序（无搜索词时）
- **tag 与时间提取已完成（2026-09-20）**：[CB-006](features/CB-006-tags.md) —— 14 个受控 tag（`data/tags.json`）+ LLM 逐道分类 371/371，筛选栏每个 tag 都有菜；36 条"多个时间"由 LLM 判定补 `minutes`（内容警告 52→19）
- **份量档位已实现（2026-09-20）**：[CB-004](features/CB-004-serving-scale.md) —— 多一人多 0.5 倍（2/3/4/5 人），非基准档位时提示"步骤用量按基准写"
- **菜单已丰富（2026-09-20）**：从 HowToCook 导入 369 道菜，菜单从 2 道扩到 371 道（[CB-003](features/CB-003-howtocook-import.md)，`implemented`）；解析器 33 个单测
- **图片已完成（2026-09-20）**：[CB-007](features/CB-007-images.md) + [ADR-0004](decisions/ADR-0004-image-static-hosting.md)，`implemented`：启动扫描 `data/images/<id>/`（179/371 道菜有封面）、`/images/*` 只提供扫描认下的文件、`no-cache` + ETag；列表懒加载、详情限高头图、步骤图在完成按钮之外。验收记录 [verification/CB-007/CHECK.md](verification/CB-007/CHECK.md)（**待真机**）；首版**不做缩略图**（已批准）
- **组件层测试已建立（2026-09-20）**：jsdom + Testing Library，新增 20 个组件测试（计时到点提醒、完成索引清洗、面板保存失败、词表未载入的三态与标记）→ 测试总数 **261**（含图片路由/降级、厨具服务端并发时序与 schema 校验的用例）
- 下一步：**真机试做**并回填[试做反馈](features/CB-001-cooking-feedback.md) → 才能谈 `verified`；真机顺便看图片（滚动是否卡）与双设备厨具同步 ｜ M4 图片（[CB-007](features/CB-007-images.md)）与厨具改服务端（[CB-008](features/CB-008-kitchen-tools-server.md)）均已实现 → 之后才是部署（T3，需授权）
- **编辑菜谱 + 修改记录已完成（2026-09-21）**：[CB-009](features/CB-009-edit-mode.md) + [ADR-0005](decisions/ADR-0005-editable-recipes-and-history.md)，`implemented`：详情页有「✎ 编辑」「🕘 修改记录」；保存前留历史快照、版本守卫 409 不静默覆盖、可恢复旧版；导入器改为默认拒绝覆盖。验收记录 [verification/CB-009/CHECK.md](verification/CB-009/CHECK.md)（**待真机**）
- 待做：**来源基线 + LLM 辅助重新同步**（[CB-010](features/CB-010-source-and-resync.md) + [ADR-0006](decisions/ADR-0006-source-baseline-and-llm-resync.md)，已 `accepted`，排在 CB-009 之后）；预实现复核的 9 条阻断项见 [verification/current-review/PRE-REVIEW-CB-009-010.md](verification/current-review/PRE-REVIEW-CB-009-010.md)

## 新 session 的阅读路径

| 你要做的事 | 先读这些 |
| --- | --- |
| 任何改动 | [`../AGENTS.md`](../AGENTS.md)（变更等级、门槛），然后按下表读对应文档 |
| 改功能行为 | 对应 `features/CB-*.md` 规格 → [REQUIREMENTS.md](REQUIREMENTS.md) |
| 改数据结构 / 加字段 | [DATA_MODEL.md](DATA_MODEL.md) → [ADR-0002](decisions/ADR-0002-json-files-as-source-of-truth.md) |
| 改架构 / 换技术 | [ARCHITECTURE.md](ARCHITECTURE.md) → `decisions/` |
| 部署或改服务器 | [DEPLOYMENT.md](DEPLOYMENT.md)（T2/T3，需要明确授权） |
| 不确定目前进度 | [ROADMAP.md](ROADMAP.md) 的进度总览 |

## 每条事实的权威位置

改文档时先看这张表：**一条事实只写在一个地方**，别处用链接引用。

| 事实 | 权威位置 |
| --- | --- |
| 协作流程、变更等级、代码/数据规则 | [`../AGENTS.md`](../AGENTS.md) |
| 产品目标、功能范围、明确不做、总体验收标准 | [REQUIREMENTS.md](REQUIREMENTS.md) |
| 技术选型与理由、模块职责、数据流、风险 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 菜谱文件字段、厨具词表、校验规则、图片目录约定 | [DATA_MODEL.md](DATA_MODEL.md) |
| 里程碑拆分、进度、每个里程碑的验证结果 | [ROADMAP.md](ROADMAP.md) |
| 部署步骤、服务器实测事实、备份恢复、排障 | [DEPLOYMENT.md](DEPLOYMENT.md) |
| 单个功能的目标/边界/交互/验收 | `features/CB-*.md` |
| 厨房场景的试做反馈（做菜时记录） | [features/CB-001-cooking-feedback.md](features/CB-001-cooking-feedback.md) |
| 跨模块、难逆转的决定及其代价 | `decisions/ADR-*.md` |
| 尚未决定的问题与默认建议 | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) |

## 目录约定

```text
docs/
├── START-HERE.md          # 本文件：状态 + 阅读路径 + 权威位置表
├── REQUIREMENTS.md        # 产品需求
├── ARCHITECTURE.md        # 架构与技术选型
├── DATA_MODEL.md          # 数据模型
├── ROADMAP.md             # 里程碑与进度
├── DEPLOYMENT.md          # 部署与运行
├── OPEN_QUESTIONS.md      # 未决问题
├── templates/feature-spec.md   # 功能规格模板（新功能从这里复制）
├── features/              # 每个功能一份规格：CB-001、CB-002…
├── decisions/             # ADR：跨模块、难逆转的决定
└── verification/          # 验收证据（截图、命令输出、真机记录）
```

## 常用命令

```bash
npm run dev          # 开发：前端 5173 + 后端 3000（手机可访问 http://<Mac IP>:5173）
npm run typecheck    # 三套 tsconfig
npm test             # vitest
npm run check:data   # 校验 data/recipes/*.json
npm run build && npm start   # 生产模式本地跑一遍
```

## 工作流程（一句话版）

写规格（`draft`）→ 你审阅批准（`accepted`）→ 实现（回填证据）→ 真机/试做验收（`verified`）→ 把结论回流到需求与架构文档。
