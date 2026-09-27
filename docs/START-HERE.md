# 从这里开始

最后更新：2026-09-27 ｜ 这份文件的职责是**当前状态与阅读路径**，不重复其他文档的细节。

## 当前状态

**应用已部署在 iStoreOS `192.168.1.2:18081`。** 2026-09-24 现场检查容器为 `healthy`，健康接口返回 371 道菜；部署细节与检查边界见[部署状态](DEPLOYMENT.md)。

- 能用的：浏览、搜索、分类与标签筛选、菜谱详情、图片、步骤勾选与计时、到点提醒、吸顶回位、字号和屏幕常亮；厨具匹配、点赞/收藏、编辑与历史恢复也已实现。份量只按菜谱原文显示，不自动换算。
- 数据：**371 道菜**（自建 2 + 从 HowToCook 导入 369）、13 件厨具词表、13 个标签；仓库中 368 道菜有标签，3 道暂无标签（空标签允许，见 [CB-006](features/CB-006-tags.md)）。179 道有成品图。菜谱内容与许可说明见[数据模型](DATA_MODEL.md)。
- **当前功能状态以[功能索引](features/README.md)为准**：CB-001、CB-002、CB-003、CB-005 至 CB-010 为 `implemented`；CB-004 已 `superseded`，份量缩放已撤回。当前版本的用户验收已由用户于 2026-09-26 标为 `done`，见[用户验收记录](verification/OWNER-ACCEPTANCE.md)。
- 尚未实际执行的真机、厨房、双设备、菜单逐道复核和真实上游更新检查仍记录在各自 CHECK/规格中；它们不再阻塞当前版本的用户验收。后续使用反馈进入迭代。
- **CB-010** 的真实模型冲突提案和人工解决路径已验证；真实上游更新场景尚未实际演练，但用户已接受当前版本。来源覆盖与验证记录见 [CB-010 验收记录](verification/CB-010/CHECK.md)。

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
