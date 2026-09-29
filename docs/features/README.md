# 功能规格目录

这里存放每个功能的可实现规格（T1 及以上变更）。**规格未达到 `accepted`，不开始写实现**——完整流程见 [`../../AGENTS.md`](../../AGENTS.md)。

新建规格：复制 [`../templates/feature-spec.md`](../templates/feature-spec.md) 为 `docs/features/CB-<编号>-<slug>.md`，然后在本文件登记。

当前版本所有用户验收项已由用户于 2026-09-26 标记为 `done`，范围与专项检查记录见[用户验收记录](../verification/OWNER-ACCEPTANCE.md)。专项检查是否执行仍以各功能 CHECK 为准。

| 编号 | 规格 | 实现状态 | 用户验收 | 一句话 |
| --- | --- | --- | --- |
| CB-001 | [做菜顺手（详情页增强）](CB-001-cooking-mode.md) | `implemented` | **done** | 一键计时与到点提醒、吸顶回位、屏幕常亮；份量按菜谱原文显示、不换算 |
| CB-002 | [厨具匹配](CB-002-kitchen-tools.md) | `implemented` | **done** | 厨具受控词表、我的厨具、缺件标记和替代方案 |
| CB-003 | [从 HowToCook 导入菜谱](CB-003-howtocook-import.md) | `implemented` | **done** | 共 371 道（自建 2 + HowToCook 369）；含来源与许可裁定、解析缺口修复 |
| CB-004 | [份量档位（按人数线性缩放）](CB-004-serving-scale.md) | `superseded` | 不适用 | 缩放实现已撤回；当前按菜谱原文显示份量，规则见 [CB-001 §3.2](CB-001-cooking-mode.md) |
| CB-005 | [点赞、收藏与排序](CB-005-likes-favorites.md) | `implemented` | **done** | 服务端存储（两人共享）、收藏优先排序；**本项目第一个写操作** → [ADR-0003](../decisions/ADR-0003-write-operations-user-state.md) |
| CB-006 | [tag 受控词表与逐道分类](CB-006-tags.md) | `implemented` | **done** | 受控 tag 词表 + LLM 逐道判定；当前覆盖与空标签说明见 [CB-006 §6b](CB-006-tags.md#6b-用户反馈后的一次修正2026-09-20) |
| CB-007 | [图片展示（封面、头图、步骤配图）](CB-007-images.md) | `implemented` | **done** | 服务端扫描与白名单托管；首版不做缩略图或上传（[CHECK](../verification/CB-007/CHECK.md) 记录专项检查状态） |
| CB-008 | [「我的厨具」改存服务端](CB-008-kitchen-tools-server.md) | `implemented` | **done** | `user-state.json` 保存共享厨具设置，旧浏览器值可自动迁移（专项检查见 [CHECK](../verification/CB-008/CHECK.md)） |
| CB-009 | [编辑模式与修改记录](CB-009-edit-mode.md) | `implemented` | **done** | 浏览器内编辑、历史快照、恢复与 409 版本守卫；专项检查见 [CHECK](../verification/CB-009/CHECK.md) |
| CB-010 | [来源、基线与 LLM 辅助重新同步](CB-010-source-and-resync.md) | `implemented` | **done** | 367 道有 `sourceRef`；三方比较、同步和提案脚本已实现；专项检查见 [CHECK](../verification/CB-010/CHECK.md) |
| CB-011 | [明亮、好找、想做的菜谱界面](CB-011-visual-redesign.md) | `implemented` | 待真机试做 | PC 与手机的整体视觉和布局改版；本机浏览器验证见规格 §11 |

## 后续候选

CB-009 编辑与历史、CB-010 来源同步均已实现。尚未立项的候选与优先级统一见 [ROADMAP](../ROADMAP.md)；其中网页上传图片属于 CB-007 首版之外的范围。

## 状态速查

规格生命周期：`draft` 不能开工 ｜ `accepted` 可以开工 ｜ `implemented` 代码已落地 ｜ `verified` 专项验证证据齐全 ｜ `superseded` 已被替代。用户验收是独立记录，不会把未执行的专项检查记成已执行。
