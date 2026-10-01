# 架构决策记录（ADR）

这里放**跨模块或难逆转**的决定。只影响单个功能、随时能改的选择写在对应功能规格里，不放这里。

| 编号 | 决定 | 状态 |
| --- | --- | --- |
| [ADR-0001](ADR-0001-documentation-driven-development.md) | 采用文档驱动的规格先行开发 | 已接受 |
| [ADR-0002](ADR-0002-json-files-as-source-of-truth.md) | 菜谱数据以 JSON 文件为唯一数据源 | 已接受 |
| [ADR-0003](ADR-0003-write-operations-user-state.md) | 引入写操作：用户状态（点赞/收藏）存服务端 | 已接受 |
| [ADR-0004](ADR-0004-image-static-hosting.md) | 从数据目录托管菜谱图片（`/images/*`） | 已接受 |
| [ADR-0005](ADR-0005-editable-recipes-and-history.md) | 菜谱内容变为可写（编辑模式 + 修改记录） | 已接受 |
| [ADR-0006](ADR-0006-source-baseline-and-llm-resync.md) | 来源基线与 LLM 辅助的重新同步 | 已接受 |
| [ADR-0007](ADR-0007-reviewed-cover-sources.md) | 逐张审核封面来源与 AI 示意图 | 已接受 |
| [ADR-0008](ADR-0008-open-photo-attribution.md) | 其他开放许可图片与本地署名页 | 已接受 |
| [ADR-0009](ADR-0009-recipe-workshop.md) | 创意工坊：本地草稿、DS 整理与受控新建 | 已接受 |

## 什么时候要写 ADR

- 换数据存储、换技术栈、换部署方式
- 引入写操作（网页录入、图片上传）——改变"只有一个写者"的前提
- 改变网络暴露面（公网访问、HTTPS、端口变更）
- 数据删除、批量迁移或任何不可逆操作
- 任何"以后想改回来代价很大"的选择

## 格式

`ADR-<四位编号>-<kebab-slug>.md`，包含四节：**状态**（提议中／已接受／已废弃）／**背景**／**决策**／**后果**（好处、代价、需要注意什么）。

不要修改已接受的 ADR 的结论：要变更时新写一份 ADR 并在两份里互相链接，或在原文件标注"已被 ADR-XXXX 替代"。
