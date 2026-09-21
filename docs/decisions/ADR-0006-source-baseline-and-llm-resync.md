# ADR-0006：来源基线与 LLM 辅助的重新同步

## 状态

**已接受**（2026-09-21：用户批准方向；预实现复核的 4 条阻断项已修 —— 基线快照落盘、来源匹配与基线验证分开、原始字节哈希与语义哈希分开、移除一键绕过冲突；`reasoning_effort: low` 已实测可用）。关联规格：[CB-010](../features/CB-010-source-and-resync.md)。

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
    "baselineStatus": "verified",
    "baselineHash": "sha256:9f2c…",
    "parserVersion": "howtocook-parse@1",
    "lastSyncedAt": "2026-09-21"
  }
}
```

- `sourceRef` **可缺省**：手工菜（`家常做法`）没有它；旧文件不需要迁移（与既有"新增字段一律可选"一致）。
- **`baselineStatus` 是核心（复核 #6）**：
  - `"matched"` = 只匹配到**候选来源**（`path` 可信，基线未验证；`commit`/`baselineHash` 可缺省）；
  - `"verified"` = 基线已验证（必须有 `commit` + `baselineHash` + `parserVersion`，且 `data/baselines/<id>.json` 存在）；
  - **`matched` 的菜不参与自动覆盖**，只能走人工建立基线（§3）。
- `baselineHash` = **语义哈希**（canonical 投影，见 §2b），**不是**文件字节哈希（后者用于并发控制的 `revision`，与基线无关）。
- 本地"改没改"用 `语义哈希(当前文件) vs baselineHash` 判断，**不看 `updatedAt`**。

### 2. 基线**不复制不成立**：首版就存一份**解析后的基线快照**（修正版）

**修正原因（预实现复核 #7）**：靠 `git show <commit>:<path>` 现场重算看似省空间，但同一份 markdown 在不同版本解析器下会给出不同结果（CB-003 修过 9 个解析缺口），而 `data/` 备份就**不再能独立恢复同步能力**（还得有克隆 + 当时的解析器版本）。所以：

- **首版就把基线落盘**：`data/baselines/<id>.json` = 导入当时**解析后的菜谱 JSON**（规范化后），外加 `data/baselines/index.json` 记录 `{id, path, commit, parserVersion, baselineHash}`；
- `sourceRef.importedHash` = 这份快照的哈希（**语义哈希**，见 #7），三方比较用它；
- `revision`（并发控制）用**当前菜谱文件的完整字节哈希**，与基线无关；
- 克隆仍然需要（要拿“上游新”），但**基线不再依赖它**：克隆丢了只是暂时不能同步，不会把已有菜谱判成“无法合并”。

### 2b. 两种哈希必须分开（复核 #7）

| 哈希 | 算什么 | 用在哪 |
| --- | --- | --- |
| `revision` | 当前菜谱**文件字节**的完整 SHA-256 | 并发守卫（409）、`--apply` 前的重新校验 |
| `baselineHash` / 语义哈希 | **canonical 投影**（排除 `sourceRef`、`updatedAt`/时间、图片派生字段；数组按内容比较而非下标；归一化空白）后再哈希 | 三方比较、判断“本地是否改过” |
| `parserVersion` | 解析器/归一化器的版本号（常量，随 CB-003 改动递增） | 识别“基线口径漂移” |

**应用维护字段的所有权（必须定义，否则一加 `sourceRef` 就永远判"本地已改"）**：

- 应用写入的字段：`sourceRef`、`updatedAt` —— 语义哈希**排除**它们；
- 受控词表字段（`tags`/`equipment`）：三方比较时按**归一化后的集合**比（顺序不算改），并在提案里保留本地顺序；
- 其余内容字段（菜名/食材/步骤/小贴士/份量…）全部参与比较。

### 3. 一次性回填（`scripts/backfill-source-ref.ts`）——**匹配与基线要分开记**

现有 369 道导入菜没有 `sourceRef`，需要回填。**关键修正（复核 #6）**：上游今天的 HEAD **不能冒充**当初导入的基线 —— 这些菜谱在导入后又经过 tag/时间等改动，而且名称唯一只能证明“**候选来源**”，不能证明“**基线一致**”。所以回填分两步、分别记录：

| 步骤 | 产物 | 含义 |
| --- | --- | --- |
| ①**来源匹配** | `sourceRef{repo,path}`（commit 留空或标 `unverified`） | “这道菜应该来自这个文件”（候选） |
| ②**基线验证** | `data/baselines/<id>.json` + `baselineHash` + `commit` + `parserVersion` | 只有**证明**了这份内容就是从该 commit 解析来的，才算基线建立 |

- ②怎么证明？能用**语义哈希反推**：把当前菜谱按 canonical 投影算哈希，再与“该 commit 解析结果”的哈希比；一致 → 基线成立（本地未改过）；不一致 → **标记 `baseline-unverified`**（可能是本地改过，也可能只是口径不同）。
- **`baseline-unverified` 的菜不得自动覆盖**：它们只能走**人工建立基线**流程（`--rebaseline <id>`：以“当前本地内容”为基线起点，明确记下来“基线=某天某 commit 的解析结果，本地当时已有些不同”），并在报告里逐个列出。
- **匹配不唯一/找不到** → 列清单**让人决定**，不猜、不写入。
- 回填**幂等**：已有 `sourceRef` 与 baseline 的跳过。

### 4. 重新同步：先机械判断，再请 LLM

三方比较（基线 = `git show <commit>:<path>` 解析结果，上游新 = 克隆当前（或 `--ref` 指定）解析结果，本地 = 当前文件）：

| 上游 | 本地 | 动作 |
| --- | --- | --- |
| 未变 | 未变 | 跳过 |
| 变了 | 未变（语义哈希 == `baselineHash`，且 `baselineStatus=verified`） | **直接采用上游**（不需要 LLM），更新 `sourceRef`（新 commit / 新 `baselineHash` / 新 `parserVersion`） |
| 未变 | 变了 | 跳过（本地为准） |
| **变了** | **变了** | **LLM 出合并提案** → 人工**逐项**审阅 → 落地 |
| — | `baselineStatus=matched`（基线未验证） | **不进自动流程**，只报告 + 提示人工建立基线 |

这条决策表的意义：LLM 只处理**真正需要判断**的那一档，其余各档都是确定性的（免费、快、可预测）。

### 5. LLM 只提议，不落盘；人工逐项审阅后应用

- 提案写到 `data/sync-proposals/<id>.json`（结构化：合并后的菜谱 + 逐条说明 + **未决冲突清单**）+ `data/sync-proposals/<id>.md`（人类可读：上游改了什么、我改了什么、合并结果、冲突逐条）。
- **提案必须自描述**（复核 #8）：`{ proposalId, recipeId, baseRevision, baseHash, localHash, upstreamHash/localUpstreamHash, model, reasoningEffort, parserVersion, createdAt, status, conflicts: [...] }` —— 事后能说清“这份提案是基于哪个版本、用哪个模型与参数生成的”。
- 落地必须显式：`--apply <proposalId>`；落地时**重新校验本地 `revision`**（变了就拒），并**走与网页相同的保存/历史路径**（同一 `saveRecipe`：校验 → 历史 → 原子替换 → 索引更新），历史来源标 `llm-merge`。
- **首版移除 `--accept-conflicts`**（复核 #8）：未决冲突**必须逐项解决**（在提案里标 `resolved` 并写明人选了哪一边）才能 `--apply`。不提供一键绕过。
- **数组不按下标合并**（复核 #8）：食材/步骤的增删重排按**内容相似度**对齐（完全相同的条目先匹配，剩下的标记为“新增/删除/修改”与冲突），**不按位置硬套**；无法对齐的列为冲突。
- LLM 输出**必须过 zod 校验**（同一份 `createRecipeSchema` + 内容检查）；不合法 → 当提案失败，保留原始响应供排查，不写任何文件。
- LLM **不得决定**：`id`、`sourceRef`/基线、文件路径、审计来源字段 —— 这些由脚本在所有 LLM 调用之外写死/校验。

### 6. LLM 的硬约束（写进 prompt，也在审阅清单里核对）

1. **只合并，不新增事实**：不得发明用量、步骤、时间、火候；上游和本地都没有的内容不许出现。
2. **冲突逐条列出**：同一处两边都改（例如都改了"盐 3g"）→ 在提案里把两组值都列出来，**不自己拍板**。
3. **保留本地的个性化补充**：`tips`、`note`、别名这类本地新增要留下。
4. **胆小时给选项**：拿不准就保留两组值 + 标注"待决定"，不要含糊地编一个中间值。

### 7. 外网依赖只存在于**本地脚本**，应用运行时永不调用 LLM

- 应用（Fastify + 浏览器）**不引入任何外网依赖**：局域网断开外网时，浏览、搜索、编辑、点赞收藏全部照常（这条是 [REQUIREMENTS](../REQUIREMENTS.md) 的硬约束）。
- LLM 调用只发生在 `scripts/` 下的本地工具脚本里，通过环境变量 `IVAN_ONLINE_API_URL`（`https://api.ivan-online.xyz/v1/chat/completions`）与 `IVAN_ONLINE_API_KEY` 直接 POST（OpenAI 兼容，**不新增 npm 依赖**；用 **Node fetch** —— 实测 Python 客户端会被 Cloudflare 拦 `403/1010`）。
- 模型与档位：**`gpt-5.6-luna` + `reasoning_effort: "low"`**（用户指定，实测可用：curl 与 Node fetch 均 200）。**若代理拒绝它 → 作为配置阻断报错停下，不得自动去掉 `low`**（复核 #9）。
- **最小数据外发**（复核 #9）：只发送**目标菜谱的三方内容**（基线/上游新/本地），**不发送**环境变量、密钥、其他文件、路径信息；请求与响应落到 `data/sync-proposals/<id>.raw.txt` 时也要脱敏。
- **不重试滥用**：最多 2 次；失败即降级为"只报告"。**默认 `--dry-run`、一次只处理一道菜**（`--apply` 才写盘）；批量回填/覆盖真实 `data/` 前必须**单独取得操作授权**（T3 级）。
- **提示词不能保证“无新增事实”**（复核 #9）：zod 只能验结构，**人工逐项审阅是必要门禁** —— 报告里必须把“两边都没有、只出现在提案里”的内容单独列出来供人核对。

### 8. 可追溯

- 提案文件与历史快照里都标注产生者（`llm:gpt-5.6-luna`）与时间；提案**保留**（不自动删），便于回看"当时为什么这么合"。

## 后果

### 好处

- 上游更新可以持续吸收，而**本地修改不丢**（这是用户要的核心）；
- 三档确定性动作不依赖 LLM（省钱、可预测、可离线）；
- **`data/` 备份即可独立恢复同步能力**（基线快照落盘）—— 代价是多存约 1–2 MB 文本，换掉"克隆没了就永远合不了"的风险。

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
