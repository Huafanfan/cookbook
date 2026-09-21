# 功能规格目录

这里存放每个功能的可实现规格（T1 及以上变更）。**规格未达到 `accepted`，不开始写实现**——完整流程见 [`../../AGENTS.md`](../../AGENTS.md)。

新建规格：复制 [`../templates/feature-spec.md`](../templates/feature-spec.md) 为 `docs/features/CB-<编号>-<slug>.md`，然后在本文件登记。

| 编号 | 规格 | 状态 | 一句话 |
| --- | --- | --- | --- |
| CB-001 | [做菜顺手（详情页增强）](CB-001-cooking-mode.md) | `implemented` | 一键计时与到点提醒、吸顶回位、屏幕常亮；折叠已移除、份量换算已改由 CB-004 承接——待真机试做验收（附[试做反馈表](CB-001-cooking-feedback.md)） |
| CB-002 | [厨具匹配](CB-002-kitchen-tools.md) | `implemented` | 厨具受控词表（`data/equipment.json`）、勾选我的厨具、缺件标记、替代方案——待真机验收 |
| CB-003 | [从 HowToCook 导入菜谱](CB-003-howtocook-import.md) | `implemented` | 从公有领域的 HowToCook 导入 371 道；含来源与许可裁定、9 个解析缺口修复——待你翻一遍菜单质量 |
| CB-004 | [份量档位（按人数线性缩放）](CB-004-serving-scale.md) | `implemented` | 多一人多 0.5 倍（2/3/4/5 人 → 1.0/1.5/2.0/2.5×）；非基准档位提示"步骤用量按基准写" |
| CB-005 | [点赞、收藏与排序](CB-005-likes-favorites.md) | `implemented` | 服务端存储（两人共享）、收藏优先排序；**本项目第一个写操作** → [ADR-0003](../decisions/ADR-0003-write-operations-user-state.md) |
| CB-006 | [tag 受控词表与逐道分类](CB-006-tags.md) | `implemented` | 14 个受控 tag（`data/tags.json`）+ LLM 逐道判定，**371/371 全覆盖**，筛选栏不再有空 tab |
| CB-007 | [图片展示（封面、头图、步骤配图）](CB-007-images.md) | `implemented` | 服务端扫描 `data/images/<id>/` + `/images/*` 只提供扫描认下的文件（[ADR-0004](../decisions/ADR-0004-image-static-hosting.md)）；**首版不做压缩缩略图、不做上传**——本机验收通过（[验收记录](../verification/CB-007/CHECK.md)），**待真机** |
| CB-008 | [「我的厨具」改存服务端](CB-008-kitchen-tools-server.md) | `implemented` | `user-state.json` 新增 `kitchen` + `POST /api/kitchen`（词表校验）；旧浏览器本地值自动迁移，两口子共用一份——本机验收通过（[验收记录](../verification/CB-008/CHECK.md)），**待真机双设备** |
| CB-009 | [编辑模式与修改记录](CB-009-edit-mode.md) | `implemented` | 浏览器内改菜谱全部字段（含来源）+ 历史快照（独立 `historyId`）+ 版本守卫（409 不静默覆盖、可恢复旧版）——T2，[ADR-0005](../decisions/ADR-0005-editable-recipes-and-history.md)；本机浏览器验收通过（[CHECK](../verification/CB-009/CHECK.md)），**待真机** |
| CB-010 | [来源、基线与 LLM 辅助重新同步](CB-010-source-and-resync.md) | `implemented` | `sourceRef` 回填 367 道 + 基线快照 + 三方比较四档 + 同步/提案脚本（LLM 只出提案、写盘走与网页同一条路径）——T2，[ADR-0006](../decisions/ADR-0006-source-baseline-and-llm-resync.md)；**真实 luna 冲突路径待验证**（[CHECK](../verification/CB-010/CHECK.md)） |

## 待建规格（来自 ROADMAP）

| 里程碑 | 需要立项为 | 说明 |
| --- | --- | --- |
| M4 图片 | ✅ 已立为 [`CB-007`](CB-007-images.md) | 封面图与步骤配图：目录约定（已有 179 张落盘）、懒加载、占位图；**首版明确不做压缩缩略图**（口径见规格 §1）——`implemented`（[验收记录](../verification/CB-007/CHECK.md)） |
| M5 网页录入/编辑 | ✅ 已立为 [`CB-009`](CB-009-edit-mode.md) | 浏览器内编辑菜谱（含来源可编辑）+ **修改记录**（独立 `historyId` 快照）+ 版本守卫；不做新建/删除（删除属 T3）——`accepted`，实现中 |
| 来源与重新同步 | ✅ 已立为 [`CB-010`](CB-010-source-and-resync.md) | `sourceRef` + 基线快照 + 三方合并（LLM 只出提案、人审逐项后落地；**应用运行时不调 LLM**）——`accepted`，排在 CB-009 之后 |
| 上传图片 | 待定（CB-011 建议） | 网页上传并压缩到 `data/images/`（CB-007 明确把它排除在首版之外） |
| ~~导入内容的时间提取修正~~ | ✅ 已完成 | 归入 CB-003 后续：36 条交 LLM 判定，填入 34 条、判定不填 2 条；内容检查同步改为"已填 minutes 就不再提示" |
| M5 收藏/最近浏览 | 待定 | 收藏已由 CB-005 承接；"最近浏览"本地存储即可，视使用频率决定 |
| 部署上线 | 非功能规格 | 按 [`../DEPLOYMENT.md`](../DEPLOYMENT.md) 执行，属 T3，需要明确授权 |

## 状态速查

`draft` 不能开工 ｜ `accepted` 可以开工 ｜ `implemented` 已写完待验收 ｜ `verified` 已验收 ｜ `superseded` 已被替代
