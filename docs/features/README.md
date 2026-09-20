# 功能规格目录

这里存放每个功能的可实现规格（T1 及以上变更）。**规格未达到 `accepted`，不开始写实现**——完整流程见 [`../../AGENTS.md`](../../AGENTS.md)。

新建规格：复制 [`../templates/feature-spec.md`](../templates/feature-spec.md) 为 `docs/features/CB-<编号>-<slug>.md`，然后在本文件登记。

| 编号 | 规格 | 状态 | 一句话 |
| --- | --- | --- | --- |
| CB-001 | [做菜顺手（详情页增强）](CB-001-cooking-mode.md) | `implemented` | 一键计时与到点提醒、吸顶回位、屏幕常亮；折叠与份量换算已移除——待真机试做验收（附[试做反馈表](CB-001-cooking-feedback.md)） |
| CB-003 | [从 HowToCook 导入菜谱](CB-003-howtocook-import.md) | `draft` | 用公有领域的 HowToCook（62k★）丰富菜单；**待你定导入范围** |
| CB-002 | [厨具匹配](CB-002-kitchen-tools.md) | `implemented` | 厨具受控词表（`data/equipment.json`）、勾选我的厨具、缺件标记、替代方案（"用空气炸锅代替烤箱"）——待真机验收 |

## 待建规格（来自 ROADMAP）

这些还没写规格，做之前先写：

| 里程碑 | 需要立项为 | 说明 |
| --- | --- | --- |
| M4 图片 | `CB-004`（建议） | 封面图与步骤配图：目录约定、缩略图、懒加载、占位图 |
| M5 网页录入 | `CB-004`（建议） | 浏览器内新增/编辑菜谱，写回 JSON —— 属 T2（引入写操作），需要 ADR；可一并把"我的厨具"存到服务端 |
| M5 收藏/最近浏览 | 待定 | 是否值得单独立项取决于实际使用频率 |
| 厨具别名表 | 待定 | 现在"不粘锅"与"煎锅"不互相匹配，看实际使用频率再决定 |
| 部署上线 | 非功能规格 | 按 [`../DEPLOYMENT.md`](../DEPLOYMENT.md) 执行，属 T3，需要明确授权 |

## 状态速查

`draft` 不能开工 ｜ `accepted` 可以开工 ｜ `implemented` 已写完待验收 ｜ `verified` 已验收 ｜ `superseded` 已被替代
