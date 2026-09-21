# 功能规格：来源、基线设置与 LLM 辅助重新同步

## 元数据

| 字段 | 内容 |
| --- | --- |
| 编号 | `CB-010` |
| 状态 | `draft`（待用户批准后改 `accepted`；批准前不写实现） |
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
| 无克隆 / 路径不对 | 立刻报错退出，提示"需要 HowToCook 克隆路径" |
| commit 在克隆里不可达 | 该菜标记 `baseline-missing`，跳过并计入报告（**不猜**、不写任何文件） |
| `importedHash` 对不上基线 | 标记 `baseline-drift`（可能是解析器升级导致口径变了），跳过 + 报告里说明 |
| 只有上游变 | 报告里写"可直接更新"；`--apply <id>` 落地（不需要 LLM） |
| 两边都变 | 生成提案（json + md）；`--apply <id>` 前必须已存在提案文件，否则拒绝 |
| LLM 无 key / 网络失败 | 该菜标记 `llm-unavailable`，**只报告差异**（报告里含两侧全文），不生成提案 |
| LLM 输出不合法（不过 zod） | 标记 `llm-invalid`，保留原始响应到 `data/sync-proposals/<id>.raw.txt` 供排查，不写提案 |
| 提案里存在未决冲突 | `--apply` **默认拒绝**，除非显式 `--accept-conflicts`（把冲突段按提案写入并在历史里标注） |
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
    "importedHash": "sha256:9f2c…",
    "lastSyncedAt": "2026-09-21"
  }
}
```

- 校验（`lib/schema.ts`）：`sourceRef` 可选；给了就必须四个字段齐全（`repo`/`path`/`commit`/`importedHash` 非空字符串，`lastSyncedAt` 可选）。
- 旧文件不需要迁移；手工菜（`家常做法`）没有 `sourceRef`。

### 新增目录

```text
data/sync-proposals/<id>.json       # 提案：合并后的整份菜谱 + 逐条说明 + 冲突清单
data/sync-proposals/<id>.md         # 人类可读：上游改了什么 / 我改了什么 / 合并结果
data/sync-proposals/report-<日期>.md
data/sync-proposals/<id>.raw.txt    # 仅当 LLM 输出不合法时保留
```

### LLM 调用（只在脚本里）

| 项 | 值 |
| --- | --- |
| 端点 | `$IVAN_ONLINE_API_URL`（`https://api.ivan-online.xyz/v1/chat/completions`） |
| 鉴权 | `$IVAN_ONLINE_API_KEY`（**只从环境变量读，不落盘、不进日志**） |
| 模型 | `gpt-5.6-luna`（可 `--model` 覆盖） |
| 思考档位 | `reasoning_effort: "low"`（代理拒绝该参数时退回普通调用，并在输出里记录实际用法） |
| 传输 | 直接 `fetch`（OpenAI 兼容），**不新增 npm 依赖** |
| 失败 | 不重试超过 2 次；失败即降级为"只报告" |

## 5. 失败、降级与边界

| 情形 | 行为 |
| --- | --- |
| 上游文件在克隆里被删除/改名 | 标记 `upstream-missing`，报告里给出候选（同菜名/相似路径），**人决定** |
| 本地文件被手工改坏（校验不过） | 该菜跳过 + 报告；不参与合并 |
| 本地有 `sourceRef` 但菜谱文件不存在 | 忽略（可能是删除的菜） |
| 同一菜名匹配到多个上游文件 | 回填时列为**待决定**，不写 |
| 解析器口径升级导致 `importedHash` 不匹配 | 标记 `baseline-drift`；提供 `--rebaseline <id>`（把当前上游解析结果当作新基线，需显式） |
| 提案与当前文件不一致（审阅后才又改了文件） | `--apply` 时再次比对本地哈希；不一致 → 拒绝并提示重新生成提案 |
| 无外网 | 三档确定性动作照常；需要 LLM 的那档降级为报告 |
| 上游 force-push 导致老 commit 不可达 | `baseline-missing`；报告里建议更新克隆并 `--rebaseline` |

## 6. 验收标准

- [ ] `npm run backfill:source-ref --source <克隆>` 在**临时数据目录**上跑通；能唯一匹配的写入 `sourceRef`，未匹配/多匹配的列出清单（**不写**）。
- [ ] 构造三种工况（只上游变 / 只本地变 / 两边都变）在临时目录上各跑一次：
  - 只上游变 → 报告"可直接更新"；`--apply` 落地并写历史（来源 `import`）；
  - 只本地变 → 跳过，本地内容**一个字节不变**；
  - 两边都变 → 生成提案（json + md），**未审阅前文件不变**。
- [ ] 提案里的冲突（同一字段两边都改）在 md 里**逐条列出**，`--apply` 默认拒绝，除非 `--accept-conflicts`。
- [ ] 离线（清空 `IVAN_ONLINE_*`）跑一次：三档确定性动作正常，需要合并的那档降级为报告，退出码非 0 但**不写任何文件**。
- [ ] `--apply` 落地后：菜谱文件是提案内容、`sourceRef` 更新、`data/history/.../<时间>-llm-merge.json` 存在、`npm run check:data` 仍全绿。
- [ ] LLM 故意返回不合法 JSON（用 `--model` 指一个不存在的模型或注入假响应）→ 标记 `llm-invalid`，不写提案、不写菜谱。
- [ ] 真实跑一次（我的克隆 + 真实 `luna`）：至少一道菜完成"提案 → 审阅 → 落地"全流程，并把报告存档到 `docs/verification/CB-010/`。
- [ ] 应用运行时**不出现任何外网请求**（跑一次应用 + 浏览，`lsof`/日志确认；架构上 LLM 只在 scripts 里）。
- [ ] `npm run typecheck`、`npm test`、`npm run check:data`、`npm run build` 全绿（记真实退出码）。

## 7. 测试要点

| 层级 | 用例 |
| --- | --- |
| 单元（merge 纯函数） | 三方决策表四档；字段级差异识别（新增/删除/修改）；冲突判定（同路径两边都改）与冲突清单结构；提案 → 整份菜谱的组装；"不得新增事实"的可校验部分（LLM 结果里出现两边都没有的步骤 → 拒绝） |
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
- **依赖**：CB-009（历史快照与写路径）、CB-003（解析器）、一个本地 HowToCook 克隆、`IVAN_ONLINE_*` 环境变量。

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
- [ ] 本规格已达到 `accepted`（**待用户批准**）。
- [ ] 实现后同步：`DATA_MODEL.md`、`DEPLOYMENT.md`、`README.md`、`ROADMAP.md`、`START-HERE.md`、`features/README.md`、`CB-003`。

## 11. 实现与验证证据（实现后填写）

| 项目 | 证据 |
| --- | --- |
| 实现路径 | <待填> |
| 静态检查 / 测试 / 数据校验 / 构建 | <待填（记真实退出码）> |
| 真实运行（真实克隆 + 真实 luna） | <待填：报告 + 提案 + 落地后的 diff> |
| 已知限制或未验证假设 | <待填> |

## 12. 复核记录

| 日期 | 变更 | 阅读和复核的文档 | 结论 |
| --- | --- | --- | --- |
| 2026-09-21 | 建立规格（用户要求来源、编辑、记录、LLM 整合；ADR-0006 同批新立） | START-HERE、AGENTS、DATA_MODEL、ARCHITECTURE、ADR-0002/0005、CB-003 | `draft`（待批准） |
