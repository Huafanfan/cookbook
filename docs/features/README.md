# 功能规格目录

这里存放每个功能的可实现规格（T1 及以上变更）。**规格未达到 `accepted`，不开始写实现**——完整流程见 [`../../AGENTS.md`](../../AGENTS.md)。

新建规格：复制 [`../templates/feature-spec.md`](../templates/feature-spec.md) 为 `docs/features/CB-<编号>-<slug>.md`，然后在本文件登记。

| 编号 | 规格 | 状态 | 一句话 |
| --- | --- | --- | --- |
| CB-001 | [做菜顺手（详情页增强）](CB-001-cooking-mode.md) | `implemented` | 一键计时与到点提醒、吸顶回位、屏幕常亮；份量按菜谱原文显示、不换算；待真机试做验收（附[试做反馈表](CB-001-cooking-feedback.md)） |
| CB-002 | [厨具匹配](CB-002-kitchen-tools.md) | `implemented` | 厨具受控词表（`data/equipment.json`）、勾选我的厨具、缺件标记、替代方案——待真机验收 |
| CB-003 | [从 HowToCook 导入菜谱](CB-003-howtocook-import.md) | `implemented` | 共 371 道（自建 2 + HowToCook 369）；含来源与许可裁定、9 个解析缺口修复——待你翻一遍菜单质量 |
| CB-004 | [份量档位（按人数线性缩放）](CB-004-serving-scale.md) | `superseded` | 缩放实现已撤回；当前按菜谱原文显示份量，规则见 [CB-001 §3.2](CB-001-cooking-mode.md) |
| CB-005 | [点赞、收藏与排序](CB-005-likes-favorites.md) | `implemented` | 服务端存储（两人共享）、收藏优先排序；**本项目第一个写操作** → [ADR-0003](../decisions/ADR-0003-write-operations-user-state.md) |
| CB-006 | [tag 受控词表与逐道分类](CB-006-tags.md) | `implemented` | 14 个受控 tag（`data/tags.json`）+ LLM 逐道判定，**371/371 全覆盖**，筛选栏不再有空 tab |
| CB-007 | [图片展示（封面、头图、步骤配图）](CB-007-images.md) | `implemented` | 服务端扫描 `data/images/<id>/` + `/images/*` 只提供扫描认下的文件（[ADR-0004](../decisions/ADR-0004-image-static-hosting.md)）；**首版不做压缩缩略图、不做上传**——本机验收通过（[验收记录](../verification/CB-007/CHECK.md)），**待真机** |
| CB-008 | [「我的厨具」改存服务端](CB-008-kitchen-tools-server.md) | `implemented` | `user-state.json` 新增 `kitchen` + `POST /api/kitchen`（词表校验）；旧浏览器本地值自动迁移，两口子共用一份——本机验收通过（[验收记录](../verification/CB-008/CHECK.md)），**待真机双设备** |
| CB-009 | [编辑模式与修改记录](CB-009-edit-mode.md) | `implemented` | 浏览器内改菜谱全部字段（含来源）+ 历史快照（独立 `historyId`）+ 版本守卫（409 不静默覆盖、可恢复旧版）——T2，[ADR-0005](../decisions/ADR-0005-editable-recipes-and-history.md)；本机浏览器验收通过（[CHECK](../verification/CB-009/CHECK.md)），**待真机** |
| CB-010 | [来源、基线与 LLM 辅助重新同步](CB-010-source-and-resync.md) | `implemented` | 367 道有 `sourceRef`；三方比较、同步和提案脚本已实现，真实 luna 冲突路径已补验；真实上游更新场景仍待演练（[CHECK](../verification/CB-010/CHECK.md)） |

## 后续候选

CB-009 编辑与历史、CB-010 来源同步均已实现。尚未立项的候选与优先级统一见 [ROADMAP](../ROADMAP.md)；其中网页上传图片属于 CB-007 首版之外的范围。

## 状态速查

`draft` 不能开工 ｜ `accepted` 可以开工 ｜ `implemented` 已写完待验收 ｜ `verified` 已验收 ｜ `superseded` 已被替代
