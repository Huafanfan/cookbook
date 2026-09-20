# 从这里开始

最后更新：2026-09-19 ｜ 这份文件的职责是**当前状态与阅读路径**，不重复其他文档的细节。

## 当前状态

**M0–M3 与 CB-001（做菜顺手）、CB-002（厨具匹配）已完成**，本机浏览器（手机视口）实测通过，**尚未真机验收**，**尚未部署到服务器**。

- 能用的：浏览、搜索（菜名/别名/食材/标签）、分类与标签筛选、详情页（食材分组、**厨具匹配与缺件标记**、步骤打勾、一键计时与到点提醒、吸顶回位、字号调节、屏幕常亮）；份量按原文显示，不做换算
- 数据：`data/recipes/` 下 2 道样例菜 + `data/equipment.json`（厨具权威词表 13 件，默认勾选 5 件：炒锅、砂锅、空气炸锅、烤箱、电饭锅）
- **独立复核已完成（2026-09-20）**：[overall-review/AUDIT.md](verification/overall-review/AUDIT.md) —— 结论 `OK with notes`：**P0 无、P1 × 7、P2 × 12**；CB-001/CB-002 的验收清单**全未勾选**，故两份规格保持 `implemented`，**不得称 `verified`**
- **稳定化第一轮已完成（2026-09-20）**：[FIXES.md](verification/overall-review/FIXES.md) —— P1 × 7 全部修完并逐条实测，P2 × 12 修完 12 条；两份规格仍为 `implemented`
- 下一步：**真机试做**并回填[试做反馈](features/CB-001-cooking-feedback.md) → 才能谈 `verified`；之后才是部署（T3，需授权）｜ 图片（M4，规格编号 `CB-003`）

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
