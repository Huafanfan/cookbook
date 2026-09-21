# ADR-0006：来源基线与 LLM 辅助的重新同步

## 状态

**提议中**（2026-09-21）—— 待用户批准；批准前不写实现。关联规格：[CB-010](../features/CB-010-source-and-resync.md)。

## 背景

371 道菜里有 **369 道来自 HowToCook**（[CB-003](../features/CB-003-howtocook-import.md)），`source` 字段只写了一行人类可读的字符串：

```text
HowToCook（Unlicense 公有领域）· https://github.com/Anduin2017/HowToCook · 原文未声明份量，按官方模板约定记为 2 人份
```

这行字**不足以重新同步**：既不知道对应的上游**文件路径**，也不知道导入时上游的**哪个 commit**，更不知道**当时的内容**。

而现在有两个新事实叠加：

1. 菜谱在应用里**可编辑**了（[ADR-0005](ADR-0005-editable-recipes-and-history.md)）；
2. 上游 HowToCook **还在更新**（本地克隆 `/tmp/howto` 已经落在 `c2063eb`，2026-09-18）。

所以"以后再同步到这个菜"时，必须回答一个三方问题：**上游改了没有？我改了没有？两边都改的那部分怎么合？**
没有基线（"我改之前它长什么样"）就没有第三个点，三方合并无从谈起。

用户要求在这个环节用 LLM 整合内容（"再同步到这个菜，就要结合 llm 接口来对内容做整个（整合）"），
并指定用本地已有的 `IVAN_ONLINE` 配置、模型 `luna`（实测 id = `gpt-5.6-luna`）、思考档位 `low`。

## 决策

### 1. 来源结构化：新增**可选**字段 `sourceRef`，人类可读的 `source` 保留

```json
{
  "id": "ang-ci-yu-dou-fu-tang",
  "source": "HowToCook（Unlicense 公有领域）· https://github.com/Anduin2017/HowToCook",
  "sourceRef": {
    "repo": "https://github.com/Anduin2017/HowToCook",
    "path": "汤/昂刺鱼豆腐汤/昂刺鱼豆腐汤.md",
    "commit": "c2063eb",
    "importedHash": "sha256:9f2c…",
    "lastSyncedAt": "2026-09-21"
  }
}
```

- `sourceRef` **可缺省**：手工菜（`家常做法`）没有它；旧文件不需要迁移（与既有"新增字段一律可选"一致）。
- `importedHash` = **基线内容**（用导入器解析出的菜谱 JSON）的规范化哈希，用来校验"我们从上游拿到的那份"确实是当初导入的那份。
- `customizedAt` 不单独存：本地改没改，用"当前文件哈希 vs `importedHash`"判断（见 §4 的决策表）。

### 2. 基线**不复制**：靠克隆 + commit 取回

基线内容 = 本地 HowToCook 克隆里 `git show <commit>:<path>` 交给导入器解析的结果；再用 `importedHash` 校验。
理由：复制一份基线等于把 371 份原文再存一遍（约 1–2 MB 且会漂移）；而 git 克隆本来就能按 commit 取回任意历史版本。

**前置**：本地有 HowToCook 克隆，且 `commit` 在该克隆里可达。克隆缺失 / commit 取不到 / 哈希不匹配 → **报错并停下**，不猜、不静默降级。

### 3. 一次性回填（`scripts/backfill-source-ref.ts`）

现有 369 道导入菜没有 `sourceRef`，需要回填：

- 用导入器**既有的 name → 路径**规则（`分类/菜名.md` 与 `分类/菜名/菜名.md` 两种层级）在当前克隆上匹配；
- 能唯一匹配 → 写入 `sourceRef`（`commit` = 克隆当前 HEAD，`importedHash` = 该 commit 下解析结果的哈希）；
- **匹配不唯一或找不到**（改名、合并、删除、同菜名多份）→ 输出清单**让人决定**，不猜、不写入；
- 回填是**幂等**的：已有 `sourceRef` 的跳过。

### 4. 重新同步：先机械判断，再请 LLM

三方比较（基线 = `git show <commit>:<path>` 解析结果，上游新 = 克隆当前（或 `--ref` 指定）解析结果，本地 = 当前文件）：

| 上游 | 本地 | 动作 |
| --- | --- | --- |
| 未变 | 未变 | 跳过 |
| 变了 | 未变（本地哈希 == `importedHash`） | **直接采用上游**（不需要 LLM），更新 `sourceRef`（新 commit / 新 hash） |
| 未变 | 变了 | 跳过（本地为准） |
| **变了** | **变了** | **LLM 出合并提案** → 人工审阅 → 落地 |

这条决策表的意义：LLM 只处理**真正需要判断**的那一档，其余三档都是确定性的（免费、快、可预测）。

### 5. LLM 只提议，不落盘；人工审阅后才应用

- 提案写到 `data/sync-proposals/<id>.json`（结构化：合并后的菜谱 + 逐条说明）+ `data/sync-proposals/<id>.md`（人类可读 diff：上游改了什么、我改了什么、合并结果）。
- 落地必须显式：`--apply <id>`（或 `--apply-all-reviewed`），落地时**先写历史快照**（`llm-merge` 来源，见 ADR-0005 §5）再替换文件。
- LLM 输出**必须过 zod 校验**（同一份 `createRecipeSchema`）；不合法 → 当提案失败，保留原始响应供排查，不写任何文件。

### 6. LLM 的硬约束（写进 prompt，也在审阅清单里核对）

1. **只合并，不新增事实**：不得发明用量、步骤、时间、火候；上游和本地都没有的内容不许出现。
2. **冲突逐条列出**：同一处两边都改（例如都改了"盐 3g"）→ 在提案里把两组值都列出来，**不自己拍板**。
3. **保留本地的个性化补充**：`tips`、`note`、别名这类本地新增要留下。
4. **胆小时给选项**：拿不准就保留两组值 + 标注"待决定"，不要含糊地编一个中间值。

### 7. 外网依赖只存在于**本地脚本**，应用运行时永不调用 LLM

- 应用（Fastify + 浏览器）**不引入任何外网依赖**：局域网断开外网时，浏览、搜索、编辑、点赞收藏全部照常（这条是 [REQUIREMENTS](../REQUIREMENTS.md) 的硬约束）。
- LLM 调用只发生在 `scripts/` 下的本地工具脚本里，通过环境变量 `IVAN_ONLINE_API_URL`（`https://api.ivan-online.xyz/v1/chat/completions`）与 `IVAN_ONLINE_API_KEY` 直接 POST（OpenAI 兼容，**不新增 npm 依赖**），模型 `gpt-5.6-luna`，`reasoning_effort: "low"`。
- 没有 key / 网络失败 / 代理拒绝参数：**只报告差异，不合并**（并打印可诊断原因）；`--apply` 那三档确定性动作不受影响。代理若拒绝 `reasoning_effort`，退回不带该参数的调用并在输出里记录实际用法。

### 8. 可追溯

- 提案文件与历史快照里都标注产生者（`llm:gpt-5.6-luna`）与时间；提案**保留**（不自动删），便于回看"当时为什么这么合"。

## 后果

### 好处

- 上游更新可以持续吸收，而**本地修改不丢**（这是用户要的核心）；
- 三档确定性动作不依赖 LLM（省钱、可预测、可离线）；
- 基线不占额外存储（靠 git 取回），也没破坏"JSON 是唯一数据源"。

### 代价与必须接受的风险

1. **依赖本地克隆**：克隆没了、commit 被 force-push 冲掉 → 基线取不回来。缓解：`data/backup/` 与克隆目录都在备份范围内（写进 DEPLOYMENT）。
2. **LLM 可能改坏内容** → 人工审阅是唯一有效兜底；提案留档 + 历史快照 + git 三层可回看。
3. **模型与 prompt 会变** → 同一次同步的结果可能不同；因此提案**必须留档**，且 `--apply` 是显式动作。
4. **`importedHash` 语义要写清楚**：它是"导入时解析结果的哈希"，不是 markdown 原文哈希；解析器升级（CB-003 的 9 个缺口修复）会让同一份原文算出不同结果 → 脚本必须能识别这种情况并提示"基线口径变了"。

### 需要注意

- 这是一条**离线可用**的工具链：不做定时任务、不后台常驻（要跑就手动跑一次，见 DEPLOYMENT 的"按需"约定）。
- 图片同步仍按现状（`--no-images` 选项保留）；图片不参与 LLM 合并。

## 关联

- 规格：[CB-010 来源、基线与重新同步](../features/CB-010-source-and-resync.md)
- 依赖：[ADR-0005](ADR-0005-editable-recipes-and-history.md)（菜谱可写 + 历史快照）、[ADR-0002](ADR-0002-json-files-as-source-of-truth.md)（JSON 是唯一数据源）、[CB-003](../features/CB-003-howtocook-import.md)（导入器与许可）
