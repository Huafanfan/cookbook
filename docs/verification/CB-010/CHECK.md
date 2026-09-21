# CB-010 来源、基线与重新同步 · 验收记录

日期：2026-09-21 ｜ 规格：[`../../features/CB-010-source-and-resync.md`](../../features/CB-010-source-and-resync.md) ｜ ADR：[`ADR-0006`](../../decisions/ADR-0006-source-baseline-and-llm-resync.md)

## 1. 已验证（隔离数据目录 + 上游完整克隆 `~/Workspace/HowToCook`）

| 项 | 结果 |
| --- | --- |
| 回填（真实数据，用户授权后） | 367 道写 `sourceRef`（335 `verified` + 32 `matched`）+ 335 份基线快照；**逐文件比对：除 `sourceRef` 外内容一致 367/367** |
| 四档分类 | 临时目录实测：都没变 / 只有本地变 / 只有上游变 / 两边都变 四档判定正确（含用 `--ref <旧提交>` 构造"上游变"） |
| 直接采用上游版本 | `--apply-upstream <id>` → 内容换成上游版本、`sourceRef.commit` 更新为 `--ref` 的提交、**历史快照写出**（2 条：内容 + 来源信息） |
| 提案与落地守卫 | `--apply <proposalId>`：**未解决冲突时拒绝**（退出码 1）；提案文件缺失/坏掉的拒绝路径有 try/catch + 字段校验 |
| 0 冲突不调 LLM | 单测断言：两边改的是不同字段时**一次网络请求都不发**，直接机械合并（这是修掉的一个真 bug） |
| 门禁（真实退出码） | typecheck 0 / test 0（26 files / **311 passed**）/ check:data 0 / build 0 |

## 2. 未验证（必须如实记着）

| 项 | 现状 |
| --- | --- |
| **真实 `gpt-5.6-luna` 的冲突合并路径** | **未跑通**：第一次跑发现两个真 bug（0 冲突时仍发请求；提示词没写清输出要带 `recipe`）。两处都已修 + 单测覆盖（含"档位被拒=配置阻断不降级"、"输出结构不合法→拒绝"、"改了 id→拒绝"），但**修复后没有再用真实模型跑一次**。 |
| 提案 → 人工解决冲突 → `--apply` 落地 | 代码有守卫（未解决冲突拒绝、revision 复核），但真实模型产出的提案没走到落地 |
| 打包成 npm script | 现在要用 `npx tsx scripts/sync-howtocook.ts`；还没加 `npm run` 别名 |
| 真实上游更新 | 上游 HEAD 与导入时同一提交（`c2063eb7`），所以"上游真的更新了"这一场景还没在真实克隆上遇到 |
