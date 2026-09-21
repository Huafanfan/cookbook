# 功能规格：来源、基线设置与 LLM 辅助重新同步

## 元数据

| 字段 | 内容 |
| --- | --- |
| 编号 | `CB-010` |
| 状态 | `implemented`（回填 + 三方比较 + 同步/提案脚本已落地；确定性路径端到端验证过，**真实 `gpt-5.6-luna` 的冲突合并路径未跑通**——见 [verification/CB-010/CHECK.md](../verification/CB-010/CHECK.md)） |
| 变更等级 | `T2`（新增数据字段 `sourceRef`、新增提案目录；工具链首次引入**外网 LLM 依赖** → [ADR-0006](../decisions/ADR-0006-source-baseline-and-llm-resync.md)） |
| 创建日期 | 2026-09-21 |
| 最后文档复核 | 2026-09-21 |
| 设计依据 | 用户 2026-09-21："给每个菜单增加一个来源……之后如果再同步到这个菜，就要结合 llm 接口来对内容做整个（整合）。我本地的 env 里面有 llm 的配置，IVAN_ONLINE……使用 luna low" |
| 关联 ADR | [ADR-0006](../decisions/ADR-0006-source-baseline-and-llm-resync.md)（基线与 LLM 边界）、[ADR-0005](../decisions/ADR-0005-editable-recipes-and-history.md)（历史快照） |
| 预计实现路径 | `src/shared/types.ts`（`RecipeSourceRef`）、`src/server/lib/schema.ts`（`sourceRef` 可选字段的校验）、`scripts/lib/llm.ts`（新：OpenAI 兼容客户端，fetch，无新依赖）、`scripts/backfill-source-ref.ts`（新）、`scripts/sync-howtocook.ts`（新）、`scripts/lib/merge.ts`（新：三方合并的纯函数）、`docs/verification/CB-010/` |
| 验收负责人 | 你（跑一次回填 + 一次同步） |

## 1. 目标与非目标

### 目标

1. **每道导入菜都能回答"它从哪来"**：`sourceRef = { repo, path, commit, importedHash }` 写进菜谱文件；人类可读的 `source` 保留不变。
2. **离线也能判断"要不要同步"**：上游未变/本地未改这些确定性的档位**不调用 LLM**，直接给出结论。
3. **本地修改不丢**：上游和本地都改了时，由 LLM（`gpt-5.6-luna`，`low`）出一份**合并提案**，人工审阅后显式落地；落地前先写历史快照。
4. **一切可追溯**：提案文件 + 报告 + 历史快照都标注产生者与时间；应用运行时**永不调用 LLM**。

### 非目标

1. **不做定时/后台同步**：手动跑一次（要跑才跑），与部署文档的"按需"一致。
2. 不做应用内的 diff/审阅界面（第一期用 markdown 报告 + JSON 提案 + 命令行 `--apply`）。
3. 不做图片同步（保留 `--no-images`；图片不参与合并）。
4. 不做"从上游新增菜"（新增是导入脚本的事，本次只处理**已存在菜谱的重新同步**）。
5. 不自动删除提案/历史（删除属数据操作，需授权）。

## 2. 用户场景与状态流

```text
一次性：npm run backfill:source-ref --source ~/Workspace/HowToCook
  → 为 369 道导入菜写 sourceRef（能唯一匹配的）
  → 匹配不唯一的列出清单（人决定），不猜

以后每次上游更新后：npm run sync:recipes --source ~/Workspace/HowToCook
  → 逐道菜比较（基线 / 上游新 / 本地），打印报告：
       跳过（都没变） / 直接更新（只有上游变） / 保留本地（只有本地变）
       / 需要合并（都变了）→ 生成 data/sync-proposals/<id>.json + .md
  → 我人工看提案（md 里有三方差异与冲突逐条）
  → npm run sync:recipes --apply <id>     # 显式落地，落前写历史（来源 llm-merge）
```

## 3. 交互细节与状态（命令行工具）

| 状态 | 表现 |
| --- | --- |
| 默认无参数 | **`--dry-run` 是默认**：只报告、不写任何文件；一次只处理一道菜（`--id <id>` 或 `--next`） |
| 无克隆 / 路径不对 | 立刻报错退出，提示"需要 HowToCook 克隆路径" |
| commit 在克隆里不可达 | 该菜标记 `baseline-missing`，跳过并计入报告（**不猜**、不写任何文件） |
| `baselineHash` 对不上基线快照 | 标记 `baseline-drift`（可能是解析器升级导致口径变了），跳过 + 报告里说明 |
| `baselineStatus=matched`（基线未验证） | **不进自动流程**：只报告 + 提示人工建立基线（`--rebaseline <id>`） |
| 只有上游变 | 报告里写"可直接更新"；`--apply <proposalId>` 落地（不需要 LLM） |
| 只有本地变 | 报告里写"保留本地"，跳过 |
| 两边都变 | 生成提案（json + md）；`--apply <proposalId>` 前必须已存在提案文件且**冲突已逐项解决**，否则拒绝 |
| LLM 无 key / 网络失败 | 该菜标记 `llm-unavailable`，**只报告差异**（报告里含两侧全文），不生成提案 |
| LLM 输出不合法（不过 zod/内容检查） | 标记 `llm-invalid`，保留**脱敏后**的原始响应供排查，不写提案 |
| 提案里有未决冲突 | `--apply` **拒绝**（首版**没有**一键绕过开关）；冲突在提案里逐项标 `resolved` 后才能应用 |
| 报告 | 默认打印到终端，同时写 `data/sync-proposals/report-<日期>.md` |

## 4. 数据与接口变化

### 菜谱文件（新增**可选**字段）

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

- 校验（`lib/schema.ts`）：`sourceRef` 可选；`path`/`repo` 必填非空；`baselineStatus` 只能是 `matched`/`verified`，`verified` 时必须有 `commit`+`baselineHash`+`parserVersion`。
- **两种哈希分开**（复核 #7）：`revision` = 当前菜谱**文件字节** SHA-256（并发控制）；`baselineHash` = **语义哈希**（canonical 投影，排除 `sourceRef`/`updatedAt`/图片派生字段）—— 三方比较只用后者。
- 旧文件不需要迁移；手工菜（`家常做法`）没有 `sourceRef`。

### 新增目录

```text
data/baselines/<id>.json            # 基线快照：导入当时**解析后**的整份菜谱（canonical）
data/baselines/index.json           # {id, path, commit, parserVersion, baselineHash}
data/sync-proposals/<id>.json       # 提案：合并后的整份菜谱 + 逐条说明 + 冲突清单 + 提案元数据
data/sync-proposals/<id>.md         # 人类可读：上游改了什么 / 我改了什么 / 合并结果 / 冲突逐条
data/sync-proposals/report-<日期>.md
data/sync-proposals/<id>.raw.txt    # 仅当 LLM 输出不合法时保留（已脱敏）
```

**基线为什么改成落盘（复核 #6/#7 的修正）**：靠 `git show <commit>:<path>` 现场重算看似省空间，但同一份 markdown 在不同版本解析器下结果不同（CB-003 修过 9 个解析缺口），而且 `data/` 备份就**不再能独立恢复同步能力**。首版就把解析后的基线存下来（371 道 × 约 3 KB ≈ 1–2 MB 文本），代价可接受。

### LLM 调用（只在脚本里）

| 项 | 值 |
| --- | --- |
| 端点 | `$IVAN_ONLINE_API_URL`（`https://api.ivan-online.xyz/v1/chat/completions`） |
| 鉴权 | `$IVAN_ONLINE_API_KEY`（**只从环境变量读，不落盘、不进日志、不外发**） |
| 客户端 | **Node fetch**（项目已有运行时）—— 实测 Python/urllib 会被 Cloudflare 拦 `403/1010`；**不新增 npm 依赖** |
| 模型 | `gpt-5.6-luna`（可 `--model` 覆盖） |
| 思考档位 | `reasoning_effort: "low"`（**必需**：已被用户指定；实测 curl 与 Node fetch 均 200） |
| 档位被拒时 | **报配置阻断并停下**（退出码非 0），**不得**自动去掉 `low` 继续跑（复核 #9） |
| 发送内容 | **只发目标菜谱的三方内容**（基线/上游新/本地）；不发环境变量、密钥、其他文件、路径 |
| 重试 | 最多 2 次；失败即降级为"只报告" |

## 5. 失败、降级与边界

| 情形 | 行为 |
| --- | --- |
| 上游文件在克隆里被删除/改名 | 标记 `upstream-missing`，报告里给出候选（同菜名/相似路径），**人决定** |
| 上游改了、但本地 `baselineStatus=matched`（基线未验证） | **不自动覆盖**；报告里列为"需人工建立基线"（`--rebaseline <id>`） |
| 本地文件被手工改坏（校验不过） | 该菜跳过 + 报告；不参与合并 |
| 本地有 `sourceRef` 但菜谱文件不存在 | 忽略（可能是删除的菜） |
| 同一菜名匹配到多个上游文件 | 回填时列为**待决定**，不写 |
| 解析器口径升级导致 `baselineHash` 不匹配 | 标记 `baseline-drift`；提供 `--rebaseline <id>`（以当前本地内容为基线起点，显式记录） |
| 提案与当前文件不一致（审阅后又改了文件） | `--apply` 时**重新校验本地 `revision`**；不一致 → 拒绝并提示重新生成提案 |
| 提案里有未决冲突 | `--apply` 拒绝（逐项解决后才能应用）；**没有**一键绕过 |
| 数组重排/删除 | 按**内容相似度**对齐（不按下标硬套）；无法对齐的列为冲突 |
| 无外网 | 三档确定性动作照常；需要 LLM 的那档降级为报告 |
| 代理拒绝 `reasoning_effort` | **配置阻断**：停下报错，不自动降级（复核 #9） |
| 上游 force-push 导致老 commit 不可达 | `baseline-missing`；报告里建议更新克隆并 `--rebaseline` |

## 6. 验收标准

- [ ] `npm run backfill:source-ref --source <克隆>` 在**临时数据目录**上跑通：能唯一匹配的写 `sourceRef`（`baselineStatus` 为 `matched` 或 `verified`，**分开统计**）、未匹配/多匹配的列清单（**不写**）；`baseline-unverified` 的菜**不会被自动覆盖**。
- [ ] **基线快照可离线恢复**：删掉克隆目录后，`data/baselines/` + `sourceRef` 仍能确定"本地是否改过"（三方比较不依赖克隆）。
- [ ] 构造三种工况（只上游变 / 只本地变 / 两边都变）在临时目录上各跑一次：
  - 只上游变 → 报告"可直接更新"；`--apply` 落地并写历史（来源 `import`）；
  - 只本地变 → 跳过，本地内容**一个字节不变**；
  - 两边都变 → 生成提案（json + md），**未审阅前文件不变**。
- [ ] 提案里的冲突（同一字段两边都改）在 md 里**逐条列出**；`--apply` 在存在未决冲突时**拒绝**（首版**没有** `--accept-conflicts`）；逐项标 `resolved` 后能落地。
- [ ] **本地 `revision` 变了之后 `--apply` 被拒**（提案重新生成才行）。
- [ ] **默认 dry-run + 单菜**：不带 `--apply` 跑一次 → 不写任何文件；不带 `--id` 的批量操作需要**单独授权**（脚本拒绝直接批量写）。
- [ ] **不外发多余数据**：用假 fetch 断言请求体只含目标菜谱的三方内容（不含环境变量、密钥、其他菜谱；日志里 `Bearer` 已打码）。
- [ ] **`reasoning_effort` 被拒 → 配置阻断**：假 fetch 返回 400 且报错信息指向该参数 → 脚本**停下报错**，不自动去掉 `low` 重试。
- [ ] 离线（清空 `IVAN_ONLINE_*`）跑一次：三档确定性动作正常，需要合并的那档降级为报告，退出码非 0 但**不写任何文件**。
- [ ] `--apply` 落地后：菜谱文件是提案内容、`sourceRef` 更新、`data/history/.../<时间>-llm-merge.json` 存在、`npm run check:data` 仍全绿。
- [ ] LLM 故意返回不合法 JSON（用 `--model` 指一个不存在的模型或注入假响应）→ 标记 `llm-invalid`，不写提案、不写菜谱。
- [ ] 真实跑一次（我的克隆 + 真实 `luna`）：至少一道菜完成"提案 → 审阅 → 落地"全流程，并把报告存档到 `docs/verification/CB-010/`。
- [ ] 应用运行时**不出现任何外网请求**（跑一次应用 + 浏览，`lsof`/日志确认；架构上 LLM 只在 scripts 里）。
- [ ] `npm run typecheck`、`npm test`、`npm run check:data`、`npm run build` 全绿（记真实退出码）。

## 7. 测试要点

| 层级 | 用例 |
| --- | --- |
| 单元（merge 纯函数） | 三方决策表四档（含 `matched` 不进自动流程）；字段级差异识别（新增/删除/修改）；**数组按内容相似度对齐**（重排/插入/删除/改一个字段）而不是按下标；冲突判定与冲突清单结构；canonical 投影（排除 `sourceRef`/时间/派生字段；tag/厨具按归一化集合比）；提案 → 整份菜谱的组装；"两边都没有、只出现在提案里"的内容能被标识出来（供人核对） |
| 单元（基线/哈希） | 语义哈希稳定性（同样的菜谱不同排版 → 同哈希）；`parserVersion` 变化 → `baseline-drift`；基线快照读写与 `index.json` 一致性 |
| 单元（llm 客户端） | 请求体（model/`reasoning_effort`/system prompt）、环境变量缺失时的行为、非 2xx、超时、非法 JSON、`reasoning_effort` 被拒后的退回路径（用注入的假 fetch，不发真实请求） |
| 单元（回填匹配） | name→路径的两种层级、重名（列待决定）、找不到（列待决定）、幂等（已有 `sourceRef` 跳过） |
| 脚本端到端（临时目录 + 假 LLM + 假克隆） | 三档工况；`--apply` 的守卫（无提案 / 哈希变了 / 有未决冲突）；历史快照来源标记 |
| 回归 | 菜谱读取/搜索/图片/收藏点赞不受影响；`check:data` 对新增可选字段仍全绿 |
| 手工 | 用真实克隆 + 真实 `luna` 跑一道菜，人工审阅提案（这正是"人审"这一环的验收） |

## 8. 风险、回滚与依赖

- **风险 1（LLM 改坏内容）**：唯一有效兜底是人工审阅；再加提案留档、历史快照、git 三层可回看，以及"不得新增事实"的校验（能自动查的部分）。
- **风险 2（基线丢失）**：克隆被删 / commit 不可达 → 该菜无法合并（只能报告）。缓解：把克隆目录纳入备份说明（DEPLOYMENT）。
- **风险 3（口径漂移）**：解析器升级会让 `importedHash` 与新解析结果不一致 → 明确报 `baseline-drift`，提供显式 `--rebaseline`，不静默。
- **风险 4（误落地）**：`--apply` 是显式动作 + 二次哈希校验 + 默认拒绝未决冲突。
- **风险 5（密钥）**：`IVAN_ONLINE_API_KEY` 只从环境变量读，不写文件、不进日志（日志里出现 `Bearer` 一律打码）。
- **回滚**：删掉两个脚本与 `data/sync-proposals/` 即可；菜谱文件里的 `sourceRef` 是无害的可选字段（也可手工删）。
- **依赖**：CB-009（历史快照与写路径）、CB-003（解析器）、一个**完整的**本地 HowToCook 克隆（`~/Workspace/HowToCook`，用 `git pull` 更新）、`IVAN_ONLINE_*` 环境变量。

## 9. 实施拆解与顺序

1. **`sourceRef` 字段**：类型 + zod 校验 + `DATA_MODEL` 记录（纯 schema 改动，先跑通 `check:data`）。
2. **回填脚本**：匹配规则（复用导入器的 name→路径逻辑）+ 待决定清单；临时目录测试。
3. **merge 纯函数 + 三档确定性动作**（不含 LLM）：报告 + `--apply` 守卫 + 历史快照。
4. **LLM 客户端**（fetch + 环境变量 + `gpt-5.6-luna` + `reasoning_effort: low` + 降级路径）+ 假 fetch 测试。
5. **提案生成 + 人工审阅 + `--apply`**（含冲突与 `--accept-conflicts`）。
6. **真跑一次**：真实克隆 + 真实 `luna`，把报告与一份提案存档到 `docs/verification/CB-010/`。
7. **文档回填**：`DATA_MODEL`（`sourceRef`）、`DEPLOYMENT`（克隆与脚本、密钥来源、备份）、`README`（命令）、`ROADMAP`/`START-HERE`、CB-003（指向本规格）。

## 10. 文档影响与实施前复核

- [x] 已阅读 [START-HERE](../START-HERE.md)、[AGENTS](../../AGENTS.md)、[DATA_MODEL](../DATA_MODEL.md)、[ARCHITECTURE](../ARCHITECTURE.md)、[ADR-0002](../decisions/ADR-0002-json-files-as-source-of-truth.md)、[ADR-0005](../decisions/ADR-0005-editable-recipes-and-history.md)、[CB-003](CB-003-howtocook-import.md)。
- [x] 与现有文档无冲突；`source` 已存在（371/371），本规格只**新增可选** `sourceRef`。
- [x] 外网依赖的边界已写清：**只在本地脚本**，应用运行时不调用 LLM（[REQUIREMENTS](../REQUIREMENTS.md)"不依赖任何第三方在线服务"指的是应用运行时）。
- [x] 每条事实的权威位置：基线与 LLM 策略 → ADR-0006；字段定义 → DATA_MODEL；交互与验收 → 本规格。
- [x] 本规格已达到 `accepted`（2026-09-21：用户批准方向；预实现复核 4 条阻断项已落入 §3/§4/§5/§6/§7；**实施顺序上排在 CB-009 之后**，且批量回填/覆盖真实 `data/` 前需单独授权）。
- [ ] 实现后同步：`DATA_MODEL.md`、`DEPLOYMENT.md`、`README.md`、`ROADMAP.md`、`START-HERE.md`、`features/README.md`、`CB-003`。

## 11. 实现与验证证据（实现后填写）

### 已完成部分：基础件（2026-09-21）

| 项目 | 证据 |
| --- | --- |
| 实现路径 | `src/shared/types.ts`（`RecipeSourceRef`：`matched`/`verified`、`baselineHash`、`parserVersion`）；`src/server/lib/schema.ts`（`sourceRef` 的运行时校验：`verified` 时必须有 `commit`/`baselineHash`/`parserVersion`，并把 refiner 改成**总是挂上**——跨字段规则与词表无关）；`src/server/lib/recipe-canonical.ts`（**语义投影 + 语义哈希** + `PARSER_VERSION` + `sameContent`，字段所有权见 [ADR-0006 §2b](../decisions/ADR-0006-source-baseline-and-llm-resync.md)） |
| 静态检查 | `npm run typecheck` → **退出码 0** |
| 自动化测试 | `npm test` → **退出码 0**：25 files / **300 passed**；本片新增 8 例（`test/recipe-canonical.test.ts`）：内容相同 → 同哈希、**补的 tag/厨具/来源/时间戳不影响哈希**、内容真变则哈希变（含顺序）、投影里确实没有本地字段、`sourceRef` 校验的四种情形 |
| 数据校验 | `npm run check:data` → **退出码 0**（371 通过 / 0 失败） |
| 生产构建 | `npm run build` → **退出码 0** |
| 顺手修的一处过期前提 | CB-009 的"未知字段不被丢掉"用例原本拿 `sourceRef` 当未知字段——它现在是**受校验的真字段**（缺 `baselineStatus` 会被拒）。已改为用真未知字段（`futureField`）并补一条"合法 `sourceRef` 保存后也保留" |
| 待做 | 回填脚本（匹配 + 验证 + 写 `sourceRef`）、三方比较四档、LLM 提案与 `--apply` |

### 已完成部分：回填脚本（2026-09-21）

| 项目 | 证据 |
| --- | --- |
| 实现路径 | `scripts/backfill-source-ref.ts`（默认 **dry-run**，`--apply` 才写；匹配 → `matched`；内容能证明基线的 → `verified` + `data/baselines/<id>.json` + `index.json`；写盘前过同一份 zod；原子替换）；`scripts/lib/howtocook-source.ts`（共享的上游读取规则：id→路径索引、`matchUpstream` 不猜、取 commit）+ `scripts/lib/recipe-id.ts` |
| 真实运行（临时数据目录，25 道随机抽样） | `--source ~/Workspace/HowToCook`（commit `c2063eb7`）**dry-run**：基线已验证 **21**、只匹配到来源 **3**、匹配不唯一 **1**、找不到 **0**、失败 **0**；确认**没有写任何文件**（0 个 sourceRef、无 `baselines/`） |
| 写盘验证（同一临时目录） | `--apply --limit 5`：写入 5 道 — 4 道 `verified`（各带 `data/baselines/<id>.json`，`index.json` 4 条）+ 1 道 `matched`（**不给基线快照**，因为它证明不了）；真实 `data/` 零改动（`git status data/` 空、0 个 sourceRef、无 `data/baselines/`） |
| 值得记的发现 | ① **21/25 能标 verified** 印证了字段所有权那条决定（tag/厨具不参与比较，否则全部会退化成 matched）；② `chen-pi-pai-gu-tang-2` 命中了上游**同一道菜的两份文件**（`soup/陈皮排骨汤.md` 与 `soup/陈皮排骨汤/陈皮排骨汤.md`）→ 脚本列为"匹配不唯一"**不猜**，正是设计要的行为 |

### 已完成部分：三方比较与同步/提案脚本（2026-09-21）

| 项目 | 证据 |
| --- | --- |
| 实现路径 | `scripts/lib/sync-merge.ts`（四档分类 + 逐字段机械合并 + 冲突清单 + "只出现在提案里"的可疑值）；`scripts/lib/llm-merge.ts`（LLM 客户端：只发三方内容、`gpt-5.6-luna`+`low`、档位被拒=配置阻断、输出过 zod、拒绝改 id、0 冲突不调用）；`scripts/sync-howtocook.ts`（报告 / `--apply-upstream` / `--propose` / `--apply <proposalId>`；写盘一律走 `RecipeRepository.saveRecipe` → 与网页保存同一条路径：校验 → 历史快照 → 原子替换） |
| 自动化测试 | `test/sync-merge.test.ts` **12 例**：四档分类、tag/厨具不参与、只有上游改→采用上游、两边同字段改→冲突且保留本地、数组两边都动→冲突、可疑值清单、配置读取、请求体只含三方内容（不含密钥）、档位被拒→阻断不降级、输出结构不合法/改 id → 拒绝、**0 冲突不调 LLM** |
| 真实运行（临时目录 + 真实克隆） | ① 都没变 / 只有本地变 / 只有上游变（用 `--ref <旧提交>`）三档判定正确；② `--apply-upstream` 落地：内容换成上游版本、`sourceRef.commit` 更新、历史 2 条快照；③ 未解决冲突时 `--apply` 被拒（退出码 1） |
| 修掉的两个真 bug | ① 两边改的是不同字段（0 冲突）时仍调用 LLM → 改为**机械合并即可、根本不调用**；② 提示词没写清输出必须带 `recipe` → 模型只回 `explanation`、解析失败 → 已在提示词里写明 JSON 形状 |

### 仍未做（因此不得称 `verified`）

- **真实 `gpt-5.6-luna` 的冲突合并 + 提案落地全流程**：修复上面两个 bug 后没再跑一次
- 上游真的更新时的实战（当前上游 HEAD 与导入时是同一个提交 `c2063eb7`）
- npm script 别名（现在用 `npx tsx scripts/sync-howtocook.ts`）

## 12. 复核记录

| 日期 | 变更 | 阅读和复核的文档 | 结论 |
| --- | --- | --- | --- |
| 2026-09-21 | 建立规格（用户要求来源、编辑、记录、LLM 整合；ADR-0006 同批新立） | START-HERE、AGENTS、DATA_MODEL、ARCHITECTURE、ADR-0002/0005、CB-003 | `draft`（待批准） |
| 2026-09-21 | 用户批准方向（两份规格 + 先做 CB-009）；**预实现复核（Astra）提出 4 条阻断项** → 本规格按意见修订：**基线快照落盘**（不再靠克隆现场重算）、区分"来源已匹配"与"基线已验证"、原始字节哈希与语义哈希分开、移除一键绕过冲突、提案加元数据与 `proposalId`、数组按内容对齐、默认 dry-run 单菜、`reasoning_effort` 被拒=配置阻断、最小化数据外发 | 本规格 §3/§4/§5/§6/§7、[ADR-0006](../decisions/ADR-0006-source-baseline-and-llm-resync.md)、[预实现复核](../verification/current-review/PRE-REVIEW-CB-009-010.md) | 仍为 `draft`（**待复核项修完后才改 accepted**） |
| 2026-09-21 | CB-009 完成后开工：**先做不依赖 LLM 的基础件**——`sourceRef` 类型与校验、**语义投影/哈希**（字段所有权落成 `recipe-canonical.ts`：tag/厨具/来源/时间戳不参与，否则 369 道菜全会被判"本地改过"）；上游克隆改为**完整克隆** `~/Workspace/HowToCook` | 本规格 §4/§11、ADR-0006 §2b、[DEPLOYMENT](../DEPLOYMENT.md) | `accepted`（基础件已实现，回填/三方比较/LLM 待做） |
| 2026-09-21 | 回填脚本 + 三方比较 + 同步/提案脚本；真实数据回填 367 道（335 verified / 32 matched）；临时目录验证四档与 `--apply-upstream`；修掉 0 冲突仍调 LLM、提示词缺输出契约两个 bug；**真实 luna 冲突路径未跑通** | 本规格 §11、[verification/CB-010/CHECK.md](../verification/CB-010/CHECK.md) | `implemented`（**LLM 路径待验证**） |
