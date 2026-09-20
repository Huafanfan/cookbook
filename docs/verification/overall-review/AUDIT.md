# 独立复核报告（只读）

> **来源与局限**（主代理补记，不属于子代理结论）：
> - 由 fresh-context **只读** reviewer 子代理产出（child run `b63c9c51`，父工作流 `6a165260`，cwd `/Users/zhangyifan/Workspace/cookbook`；工具仅 read/grep/find/ls，**未执行任何命令、未修改任何文件**；事后核对工作区无改动）。
> - 该子进程被 runner 标记为 `failed`：agent 声明了本环境不存在的 `watchdog_diff` 工具 —— 这是**基础设施账目问题，不是审查失败**；报告本身完整产出（A–E 全部章节）。
> - 本报告是**评审输入，不是验收证据**：文中"文档实测"字样均指**文档自述**，未经本报告验证。
> - 同一轮另有 Astra 独立评审，结论与此一致（要点：不要把绿色基线当成里程碑批准；先冻结功能、修 P1、再谈部署）。两份结论在 4 条 P1 上完全一致。

**复核对象**：`/Users/zhangyifan/Workspace/cookbook`（M0–M3 + CB-001 + CB-002 的实现、数据、测试、部署脚本与文档）
**复核方法**：只读读文件 + 定向 grep/find；一切结论给 `文件:行` + 代码原文
**复核局限（先说清，避免误读）**：本次**没有执行任何命令**（typecheck / test / check:data / build / docker 一律未跑），也没有浏览器与真机。凡"实测通过"字样都是**文档自述**，不是本次复核的结论。代码层面可判定的，我标为"代码可判"。

---

## 0. 对 12 条已知疑似缺陷的逐条裁定

| # | 裁定 | 关键证据 |
| --- | --- | --- |
| 1 | **确认** | `data/recipes/ke-le-ji-chi.json:20-25` 声明替代组 `["炒锅","电饭锅","空气炸锅"]`；步骤全是炒锅做法：`:86` "冷水下锅焯 2 分钟"、`:93` "热锅倒油，鸡翅中小火煎至两面金黄"、`:106` "开盖转大火收汁"。空气炸锅/电饭锅无法完成焯水+煎+收汁。前端会如实输出"可以做，用电饭锅代替炒锅"（`EquipmentRow.tsx:81`） |
| 2 | **确认** | `data/recipes/xi-hong-shi-chao-ji-dan.json:70` "加 1g 盐"、`:75` "倒 15ml 油"、`:82` "补 5ml 油，加…剩余 2g 盐"；而食材表 `:49` 盐 `amount 3`（分两次放）、`:63` 食用油 `amount 20`。4 人份时食材显示 6g/40ml，步骤仍写 1g/15ml/5ml/2g，两者直接矛盾 |
| 3 | **确认（两处，影响叠加）** | ① `StepList.tsx:64` `setTimeout(() => setAlertingStep(null), 10_000)` → 10 秒后回到 idle，按钮重新变成"⏱ 3 分钟"，与 CB-001 §3.4"点击按钮可停止/清除"（隐含需用户确认）冲突；后台时 `setInterval` 被节流/挂起，可能出现"响过就消失"。② `alert.ts:22` 在到点那一刻 `new AudioContextCtor()`（不在用户手势内），`:48` 无条件 `return true`，未检查 `context.state`，与文件头注释"被拦截时静默返回 false"及 CB-001 §5"退回视觉提示"的承诺不符 |
| 4 | **确认（逻辑反向）** | `wake-lock.ts:77` `if (document.visibilityState === "visible" && !sentinel?.released)` —— 只有"仍然持锁"时才重新申请，被浏览器自动释放（`released === true`）时永远不申请；且 `:66` 把浏览器的自动释放当成 `setStatus("denied")`（误报"被拒"）。**可达性修正**：计划部署是 `http://192.168.1.2:18081`，非安全上下文下 `navigator.wakeLock` 不存在（`wake-lock.ts:34-37` → "unsupported"），因此该 bug 在真实部署里**不会触发**，只在 localhost/未来 HTTPS 下暴露 |
| 5 | **确认** | `KitchenToolsPanel.tsx:26-28` `const commit = (updater) => { apply(updater); };` 丢弃返回值；`apply` 明确 `return writeMyTools(next)`（`use-kitchen.ts:54`），但面板既无失败状态也无提示 UI。CB-002 §3.2 要求"面板内提示'这次改动没能保存'" |
| 6 | **确认（两部分都成立）** | ① `src/shared/equipment.ts:15` `if (allowedTools.length === 0) return owned;` → 词表未载入时把本地旧清单原样返回，`EquipmentRow.tsx:43` 只判断 `myTools.length === 0`，于是**照常给出"厨具齐了/暂时做不了"的确定结论**，页面任何位置都不显示 `equipmentProblem`（grep 全仓：只有 `KitchenToolsPanel` 收到该 prop）。② `scripts/check-data.ts:35` `process.exit(failures.length > 0 ? 1 : 0)`，词表本身无效时只在 `:15-16` `console.error` 后继续，`equipment.tools === []` → 菜谱厨具校验被跳过（`schema.ts:70` `if (!allowedTools \|\| allowedTools.length === 0) return baseRecipeSchema`）→ **exit 0** |
| 7 | **确认** | `src/server/lib/equipment.ts:15` `tools: z.array(z.string().min(1)).min(1)` 先判长度，`:84` 才 `tool.trim()` → `"  "`（长度 2）通过校验，trim 后变成 `""` 进入词表；`dedupeByName`（`:40-48`）也不过滤空串。若词表只有空白项，`allowedTools.length === 1 > 0` 会让 `createRecipeSchema` 走 superRefine，`allowed = {""}` → **所有声明了厨具的菜谱校验失败被跳过** |
| 8 | **确认** | `src/server/services/recipe-repository.ts:53` `const raw = await readFile(join(recipesDir, file), "utf8");` 位于 per-file `try`（`:56`）**之外**，`try` 只包 `JSON.parse`。单文件 EACCES/EOF 或名为 `*.json` 的目录会抛出，冒泡出 `loadRecipesFromDir` → `RecipeRepository.load` → `createApp`（`index.ts:22`）启动失败，违反 `DATA_MODEL.md` §5.5"跳过该文件、不影响其他菜谱与启动" |
| 9 | **确认** | `StepList.tsx:70` `return index === -1 ? steps.length - 1 : index;`（全部完成时指向最后一步），`:129` 提示文案却是 `{allDone ? "回到第一步" : "回到当前步"}`，`:82-87` `jumpToCurrent` 跳到 `step-${currentIndex}` = 最后一步。承诺与行为相反 |
| 10 | **确认（边界可触发）** | `StepList.tsx:21` 只 `typeof value === "number"` 过滤（NaN 也通过），`:73` `done.length === steps.length`、`:75` `done.length / steps.length * 100`、`:111` `已完成 {done.length}/{steps.length}` 均无范围/去重/整数校验。菜谱删掉几步后同一 tab 刷新（sessionStorage 保留），会出现"已完成 5/3"、进度条 >100%、`allDone=false` 却找不到未完成步 |
| 11 | **确认** | `global.css:692` `.time-button{min-height:40px}`（CB-001 §3.5 明确"时长按钮…≥ 44px"）；`:188` `.chip-small{min-height:32px}`（份量档位 2/4/6、常亮开关、全选/全不选）；`:945` `.link-button-sm{min-height:32px}`；`:940` `.kitchen-check input{width:18px;height:18px}`，而包的 `<li>`（`:924`）虽 40px 但真正可点的 `<label>`（`:932-936`）内容只有 ~20px 高。REQUIREMENTS §4.5"主要按钮点击区域 ≥ 44px"与 CB-002 §6"面板内点击区域 ≥ 44px"均不满足 |
| 12 | **部分反驳 + 新增** | ① **反驳**：DEPLOYMENT 里两条 rsync 都带了 `--exclude '.env.server'`（`docs/DEPLOYMENT.md:76-77` 与 `:143-144`），且 rsync 的 `--delete` 不删除被排除的接收端文件 → `--delete` 不会误删 `.env.server`。② **新增真问题**：`.gitignore:8` 的 `.env.*` + `:9` 只豁免 `!.env.example`，因此 **`.env.server.example` 被忽略**，而 `docs/DEPLOYMENT.md:3`、`:88` 依赖它存在（`.dockerignore` 反而有 `!.env.server.example`）。③ compose.yaml 里没有 `user:`，实际非 root 来自 `Dockerfile:36` 的 `USER node`（uid 1000），DEPLOYMENT §7"非 root 运行（`user: node`）"的措辞指向了一个不存在的键（行为正确、描述不准） |

---

## A. 发现清单（P0 / P1 / P2）

### P0
**无。** 未发现会让服务无法启动、数据被破坏或可被未授权访问的当前缺陷（容器配置、路径穿越、XSS 三项均见 A-4 的"未发现问题"记录）。

### P1（发布前应修）

**P1-1 可乐鸡翅承诺了做法不支持的替代器具 → 用户以为能做**
- 位置：`data/recipes/ke-le-ji-chi.json:20-25`（`equipmentAlternatives: [["炒锅","电饭锅","空气炸锅"]]`）× `:86` `"冷水下锅焯 2 分钟…"`、`:93` `"热锅倒油，鸡翅中小火煎至两面金黄。"`、`:106` `"开盖转大火收汁…"`
- 证据：判定逻辑按规格实现（`src/client/lib/kitchen.ts:88-100`），界面会把"缺 炒锅"渲染成"可以做，用电饭锅代替炒锅"（`EquipmentRow.tsx:78-83`）
- 影响：**本项目最看重的那类错误**——备料到一半发现没锅，或按空气炸锅做出失败品
- 最小修法：把该菜谱替代组改成真正可替代的锅具（`["炒锅","平底锅","汤锅"]` 之类），或为电饭锅/空气炸锅另写一份做法；同时给 CB-002 加一条内容纪律："替代组必须在该器具上真能完成全部步骤"

**P1-2 份量换算与步骤文案矛盾（4 人份时数字打架）**
- 位置：`data/recipes/xi-hong-shi-chao-ji-dan.json:70/75/82`（写死 1g、15ml、5ml、2g）vs `:49`（盐 3g"分两次放"）、`:63`（油 20ml）
- 证据：`IngredientList.tsx:50` `const factor = servingFactor(servings, baseServings);` 只换食材表（`scale.ts:85-91`），步骤文本原样输出
- 影响：用户按 4 人份备料，却在步骤里读到 2 人份的用盐/用油量 → "以为用量对"的反面
- 最小修法：步骤里的量改成比例表述（"倒三分之一的油"）；或在 `factor !== 1` 时在做法区顶部加一行"步骤里的用量按 2 人份写，翻倍请自行换算"

**P1-3 词表不可用时给出"确定"的厨具结论，没有"未知"态**
- 位置：`src/shared/equipment.ts:15` `if (allowedTools.length === 0) return owned;`；`src/client/lib/use-kitchen.ts:39`；`src/client/components/EquipmentRow.tsx:43`；`src/client/pages/RecipePage.tsx:199-205`（`equipmentProblem` 只传进面板）
- 证据：`data/equipment.json` 缺失 → `/api/meta` 返回 `equipment: []` + `equipmentProblem`（`recipe-repository.ts:152-153`）；前端 `available=[]`，本地若存过厨具则原样使用并照常判定；未存过则显示"还没有添加我的厨具"（把"清单没载入"说成"你没设置"）。`useMeta` 请求失败也永远保持 `null`（`use-meta.ts:15-24` 无重试）→ 网络问题同样被呈现成"清单未载入"
- 影响：用户得到一个基于**旧本地清单**的"厨具齐了/暂时做不了"，而两种结论都可能错
- 最小修法：把 `available.length === 0` 作为第三态传入 `EquipmentRow`/`RecipeCard`，显示"厨具清单未载入，无法判断"，不做三态判定

**P1-4 `npm run check:data` 在词表本身无效时仍退出 0**
- 位置：`scripts/check-data.ts:15-16`（只 `console.error`）与 `:35` `process.exit(failures.length > 0 ? 1 : 0)`
- 证据：词表无效 → `loadEquipmentList` 返回 `tools: []`（`server/lib/equipment.ts:55-82`）→ `loadRecipesFromDir(..., [])` → `createRecipeSchema({allowedTools: []})` 直接返回 `baseRecipeSchema`（`server/lib/schema.ts:70`），菜谱的厨具字段**完全不校验**
- 影响：CB-002 的"受控词表"保证与 §6 验收项"`npm run check:data` 全绿"可能同时成立而词表已坏；写错厨具名的菜谱会静默进库
- 最小修法：`if (equipment.problem) process.exitCode = 1;`（或直接 `exit(1)`）

**P1-5 "我的厨具"保存失败无任何提示（CB-002 §3.2 明确要求）**
- 位置：`KitchenToolsPanel.tsx:26-28` `const commit = (updater) => { apply(updater); };`，返回值被丢弃；`use-kitchen.ts:54` `return writeMyTools(next);` 有能力返回 false
- 证据：面板内无"保存失败"状态、无对应 DOM；全文件无错误提示分支
- 影响：隐私模式/配额满时改动静默失效；刷新后回到 `defaultOwned`（含用户没有的烤箱）→ 依赖烤箱的菜被判定"厨具齐了" → **以为能做**
- 最小修法：面板内 `const [saveFailed, setSaveFailed] = useState(false)`，`const ok = apply(updater); setSaveFailed(!ok);` 并渲染"这次改动没能保存"

**P1-6 关键交互控件实际高度低于规格（40px / 32px / 18px）**
- 位置：`global.css:692`（`.time-button` 40px，CB-001 §3.5 要求 ≥44px）、`:188`（`.chip-small` 32px，用于份量档位 2/4/6 与常亮开关）、`:945`（`.link-button-sm` 32px）、`:924`+`:940`（面板 `<li>` 40px 但可点 `<label>` 仅约 20px、复选框 18px；CB-002 §6 要求 ≥44px）
- 影响：厨房场景（手湿、距离 0.5–1.5m）误触/点不中；这是项目自己给出的判据（REQUIREMENTS §4.5 验收项 5）
- 最小修法：给这几类控件加 `min-height: var(--tap)`，面板把 `padding` 移到 `<label>` 上使整行可点

**P1-7 到点提醒 10 秒后自动消失，与规格承诺不一致**
- 位置：`StepList.tsx:62-66`（`setTimeout(..., 10_000)`）、`StepCard.tsx:57-66`（alerting 状态才是"时间到 · 点我停止"）
- 证据：CB-001 §3.4"计时结束 → 按钮变为「时间到」并闪烁；…点击按钮可停止/清除"；实现却在无人确认的情况下自动回到 `⏱ 3 分钟`；后台节流/挂起时（`setInterval` 被 clamp 或暂停）提醒可能在用户看到屏幕前就被清除
- 影响：用户离开灶台回来看到"计时按钮还在"，无法判断该步是否已到点 → 重算或继续等，直接做坏菜
- 最小修法：`alerting` 状态保持到用户点击（规格 §8 风险 3 已给出该备选），或在吸顶条上保留一条"已到点：第 N 步"

### P2（报告，可批量处理）

| # | 位置 | 问题 / 证据 | 最小修法 |
| --- | --- | --- | --- |
| P2-1 | `StepList.tsx:70,129` | 全部完成时提示"回到第一步"，实际滚到最后一步 | `allDone ? jumpTo(0) : jumpTo(currentIndex)`，或把文案改成"回到最后一步" |
| P2-2 | `wake-lock.ts:66,77` | 条件反向（`!sentinel?.released`）+ 浏览器自动释放被标成 `denied`；计划部署 http 下不可达，仅 localhost/HTTPS 暴露 | 改为 `(sentinel === null \|\| sentinel.released)` 并在 release 回调里 `sentinel = null`，另设 `"released"` 状态而不是 `denied` |
| P2-3 | `alert.ts:22,48` | `return true` 只证明构造函数存在，未检查 `context.state === "running"`；iOS 上到点才创建 AudioContext，极可能静音却仍报"发出声音"，与文件头注释/§5 降级承诺不符 | `const ok = context.state === "running";`（并在计时开始的手势里预热/`resume()` 上下文） |
| P2-4 | `recipe-repository.ts:53` | `readFile` 在 per-file `try` 之外 → 单个不可读文件/同名目录会中断整次载入，违反"坏文件不影响其他菜谱"；`test/recipe-repository.test.ts` 只覆盖坏 JSON/缺字段/id 不符/目录不存在 4 种，**没有** EACCES/目录场景 | 把 `readFile` 包进 per-file `try`，失败记入 `failures` 后 `continue` |
| P2-5 | `StepList.tsx:21,73,75,111` | 已完成索引未做整数/范围/去重校验 → "已完成 5/3"、进度 >100% | 读取后统一 `sanitize`：`Number.isInteger(i) && i>=0 && i<steps.length` |
| P2-6 | `server/lib/equipment.ts:15,84` | 纯空白厨具名通过 `.min(1)` 再 trim 成 `""` 进入词表（CB-002 §7 声称有"含空字符串"测试，`test/equipment.test.ts` 里**不存在**）；若词表只有空白项会连带给所有带厨具的菜谱判校验失败 | 先 `map(t => t.trim())` 再 `z.string().min(1)`，并补该用例 |
| P2-7 | 文档漂移 6 处 | ① `README.md:33` "npm test # 18 个用例"、`ROADMAP.md:29` "18 passed" vs 实际 7 文件 85 个 `it(`（与 CB-002 §11 的 85 一致）；② `ROADMAP.md:22` 与 `:133` 让 M4 立项为 `CB-002`，但 CB-002 已被厨具占用（`docs/features/README.md:18` 自己写的是 `CB-003`）；③ `ROADMAP.md:159` M5 仍列"高 份量换算 1/2/4 人"，与 `REQUIREMENTS.md:58` F9 一致但已被 F13/`scale.ts:20-23`（2/4/6，无 1 人份）取代；④ `CB-001 §3.3` 说吸顶用 IntersectionObserver，实现是 `global.css:555` `position: sticky`；⑤ `ARCHITECTURE.md:101` D4"数据目录单独挂载**可写**" vs `compose.yaml:24-28` `read_only: true`；⑥ `ADR-0002:21` / `AGENTS.md` "只有 recipe-repository 碰文件系统" vs 3 处违规（`server/lib/equipment.ts:1`、`server/lib/config.ts:1`、`server/index.ts:3`） | 逐条改正文档（编号、用例数、状态、机制描述），或把架构规则改成"只有 repository 与 equipment/config/index 三处允许" |
| P2-8 | `global.css:734`（`alert-blink` infinite alternate）+ `:524`（`amount-pop`） | 全文件**没有** `prefers-reduced-motion` 媒体查询（grep `prefers-reduced-motion` 无匹配），闪烁动画无法被用户系统设置关掉 | 加 `@media (prefers-reduced-motion: reduce) { animation: none; }`（改为静态高亮） |
| P2-9 | `src/client/lib/format.ts:24` | `amountText(ingredient)` 与 `scale.ts:63` 是同义实现，且全仓无引用（grep 只出现在自身定义处）→ 第二份"用量显示权威"，违反"一条事实一个权威位置" | 删掉 `format.ts` 的 `amountText` |
| P2-10 | `.gitignore:8-9`；`docs/verification/` 只有 README | `.env.server.example` 被 `.env.*` 忽略（DEPLOYMENT 依赖它）；上表 P1/P2 里所有"实测"结论在 `docs/verification/` 中**没有任何产物**（目录只有 `README.md`） | 加 `!.env.server.example`；或明确"源码靠 rsync 交付，不入 git"并接受；规格 §11 的实测请补 CHECK.md/截图 |
| P2-11 | `RecipePage.tsx:54`（`readFlag(..., true)`）、`:101-105` | 常亮默认开，但计划部署的 http 非安全上下文永远 `unsupported` → 每天的详情页都显示"常亮不可用"；且首次"关→开"若被拒，`setHint(wakeLockExplanation(wakeStatus))` 用的是**切换前**的 status，当次不给原因（第二次点才解释） | 默认值改为按能力决定；把解释逻辑放到 status 变化后再给一次 |
| P2-12 | `data/recipes/ke-le-ji-chi.json:86` vs `:89`、`:99` vs `:102` | 步骤文本"焯 2 分钟"配 `minutes: 3`、"焖 12 分钟"配 `13`；按钮显示的倒计时默认值和文案数字不一致（CB-001 §11 声称"核对每步 minutes 语义"） | 文案与 `minutes` 取齐，或在文案里写清"含烧开/撇沫" |

### A-4 安全与边界：未发现问题（保留证据）
- **XSS**：全仓 grep `dangerouslySetInnerHTML|innerHTML|createElement(|eval(` **0 命中**；搜索高亮用 React 节点拼接（`highlight.tsx:19-33`），用户可见文本全部走 JSX 转义。
- **路径穿越**：`/api/recipes/:id` 走内存 `Map.get`（`recipe-repository.ts:171-173`），前端还额外 `encodeURIComponent`（`api.ts:49`）；静态资源交给 `@fastify/static`（`index.ts:32-38`），未自写文件路径拼接。
- **写操作**：`src/**` 内 grep `writeFile|mkdir|unlink|rm(` **0 命中**，与 compose 的 `read_only: true` 数据挂载自洽。
- **错误信息泄露**：404 只回 `{error, id}`（`routes/recipes.ts:44-46`），Fastify 默认 500 不含堆栈；列表接口回显坏文件**文件名**（`routes/recipes.ts:35`），属局域网自用的可接受信息。
- **容器边界**：`cap_drop: ALL`、`no-new-privileges`、`read_only` + `tmpfs /tmp`、`pids_limit/mem_limit`、仅绑定 `192.168.1.2`（`compose.yaml:29-46`）——与 DEPLOYMENT §7 一致。

### A-5 测试盲区（证据）
- 自动化测试环境是纯 node：`vite.config.ts:24-26` `environment: "node"`、`include: ["test/**/*.test.ts"]`；`test/` 内 grep `components|\.tsx|react|jsdom` **0 命中** → **没有任何组件/DOM 测试**。
- 覆盖到的模块（`test/*.test.ts` 的 import 全集）：`scale.ts`、`timer.ts`、`kitchen.ts`、`shared/equipment.ts`、`server/lib/equipment.ts`、`server/lib/schema.ts`、`server/services/search.ts`、`server/services/recipe-repository.ts`。
- **零覆盖**：`alert.ts`（响铃/震动/生命周期）、`storage.ts`（写入失败分支）、`wake-lock.ts`、`use-kitchen.ts`、`use-meta.ts`、`StepList/StepCard/EquipmentRow/KitchenToolsPanel/RecipePage/HomePage`、`api.ts`、`router.tsx`。
- 文档声称但**不存在**的测试点：CB-002 §7"`equipment.ts`…**含空字符串**"、"`search.ts`：列表 summary 带上两个字段；缺省为空数组"（`test/search.test.ts:106-115` 只断言 `totalMinutes/ingredientNames/coverImage`）。
- 未被任何测试或样例数据覆盖的行为：词表载入失败对**界面**的影响、保存失败、通知生命周期、越界完成索引、`readFile` 抛错、`check-data.ts` 退出码。

---

## B. 需求 → 实现 → 证据矩阵

图例：实现＝已实现 / 部分＝部分实现 / 未＝未实现；证据＝`单测` / `代码可判` / `文档实测`（仅规格自述）/ `未验证`

### B-1 REQUIREMENTS F1–F14

| 需求 | 实现 | 证据 | 备注 |
| --- | --- | --- | --- |
| F1 列表 | 实现 | 代码可判(`HomePage.tsx`/`RecipeCard.tsx`) + 文档实测 | 无组件测试 |
| F2 搜索（名/别名/食材/标签） | 实现 | 单测(`search.test.ts` 14 例) | 额外支持 `category` 命中（`search.ts:47`），需求未写 |
| F3 筛选（分类/标签叠加） | 实现 | 单测(`search.test.ts:78-86`) | — |
| F4 详情（食材/编号步骤/小贴士） | 实现 | 代码可判(`RecipePage.tsx`) + 文档实测 | — |
| F5 详情易用性（字号/打勾） | 实现 | 代码可判(`RecipePage.tsx:117-141`) + 文档实测 | — |
| F6 一菜一 JSON | 实现 | 单测(`recipe-repository.test.ts` 4 例) | P2-4 的 readFile 抛错场景未覆盖 |
| F7/F8 图片 | 未 | 代码可判 | `RecipeSummary.coverImage` 恒 `null`（`search.ts:29`），卡片用首字占位（`RecipeCard.tsx:29`），与文档"待做"一致 |
| F9 份量换算（**文档写 1/2/4 人**） | 实现为 2/4/6 | 单测(`scale.test.ts:12-27`) | **文档冲突**：`REQUIREMENTS.md:58` F9 vs `:72` F13（P2-7③） |
| F10 网页录入 | 未 | 代码可判 | 属 M5/T2 |
| F11 收藏/最近浏览 | 未 | 代码可判 | 属 M5 |
| F12 购物清单 | 未 | 代码可判 | 属 M5 |
| F13 CB-001 四项 | 部分 | 单测(scale/timer) + 文档实测 | 屏幕常亮在计划部署环境不可用；到点提醒见 P1-7/P2-3；等效验收项见 B-2 |
| F14 CB-002 四项 | 部分 | 单测(kitchen/equipment) + 文档实测 | 虚假替代数据(P1-1)、词表失效语义(P1-3/P1-4)、保存失败(P1-5)、44px(P1-6) |

### B-2 CB-001 §6 验收清单（13 项）

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 常亮开关切换 + 刷新保持 | 实现 | 代码可判（`RecipePage.tsx:54,101-105` + `storage.ts:22`）；**未验证**真机 |
| 有 equipment 显示厨具行、没有则不留空行 | 实现 | 代码可判（`EquipmentRow.tsx:36-37`）；注意两个样例都只用 `equipmentAlternatives`，`equipment` 路径无样例数据 |
| 档位只有整数倍、无 1 人份 | 实现 | 单测（`scale.test.ts:12-24`） |
| 换算示例 3g→6g、适量不变 | 实现 | 单测（`scale.test.ts:75-93`） |
| 时长按钮 → 倒计时 | 实现 | 代码可判；无组件测试 |
| 到点响铃 + 震动 + 闪烁 | 部分 | 代码可判；**真机未做**，且 P1-7/P2-3 使"响铃/提示"不可靠 |
| 锁屏 1 分钟回来剩余正确 | 实现 | 单测（`timer.test.ts:21-27` 跨息屏） |
| 点卡片灰化划线、布局不跳动 | 实现 | 代码可判（`StepCard.tsx:40` + `global.css:747-756`）；**浏览器实测仅文档自述** |
| 吸顶条出现 + 点击回当前步 | 部分 | 代码可判；全部完成时提示错（P2-1） |
| 屏幕不自动熄灭 | **在计划部署环境不可达** | 代码可判：http 非安全上下文 → `navigator.wakeLock` 不存在 → "常亮不可用"（`wake-lock.ts:34-37`）；降级与提示已实现，但该项在 `http://192.168.1.2:18081` 下永远失败，应改写为"给出明确提示且不影响使用" |
| 进度/份量返回再进保留 | 实现 | 代码可判（`storage.ts:19-31` 键自带 kind）；文档实测 |
| 桌面端 Tab/Enter 可操作 | **未验证** | 无任何键盘实测记录；所有交互控件都是 `<button>`/`<input>`（代码可判可聚焦），但吸顶条、面板无显式 `:focus-visible` 样式（`global.css` 只对 `.search-input:focus` 定义，`global.css:130`） |
| 三条命令全绿 | **本次未执行** | 另注：`check:data` 有 P1-4 的洞 |

### B-3 CB-002 §6 验收清单（14 项）

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 面板列完整词表、无自由输入 | 实现 | 代码可判（`KitchenToolsPanel.tsx:52-80` 只渲染 `available.map`，无 input） |
| 首次按 defaultOwned 判定 | 实现 | 代码可判（`use-kitchen.ts:39` `stored ?? defaultOwned`）；补丁：无专门单测 |
| 清单外厨具 → check:data 报错并列出可选 | 部分 | 单测（`equipment.test.ts:111-136`）覆盖校验；但词表坏时 **exit 0**（P1-4） |
| 详情页可乐鸡翅给出厨具结论 | **内容错误** | 行与结论都渲染，但结论是假的（P1-1） |
| 缺件但有替代 → "可用 X 代替 Y" | 实现 | 单测（`kitchen.test.ts:43-50`）+ `EquipmentRow.tsx:80-82` |
| 缺件无替代 → "暂时做不了" | 实现 | 单测（`kitchen.test.ts:52-59`）+ `EquipmentRow.tsx:83` |
| 点【我的厨具】就地展开、勾选立即生效 | 实现 | 代码可判；无组件测试；保存失败静默（P1-5） |
| 勾选"蒸锅"后需要蒸锅的菜不再缺件 | **无法验证** | 样例数据中没有任何菜谱需要蒸锅/烤箱（`data/recipes/*.json` 只有 `[炒锅,砂锅]` 与 `[炒锅,电饭锅,空气炸锅]`） |
| 取消勾选后立刻变缺件 | 部分 | 同上，只有炒锅组可验；文档 §11 用"移除炒锅"演示 |
| 刷新后"我的厨具"保持 | 部分 | 代码可判 + 文档实测；失败路径无提示（P1-5） |
| 列表页缺件标记、齐全/未声明无标记 | 实现 | 单测（`kitchen.test.ts:61-69`）+ `RecipeCard.tsx:26-27` |
| 没写厨具时前后台都不出现厨具内容 | 实现 | 代码可判（`EquipmentRow.tsx:36`、`shortEquipmentLabel` 返回 null）；无样例数据可验 |
| 手机竖屏：不换行错乱、≥44px、无横向滚动 | **未满足（44px）** | P1-6；"无横向滚动"无本次实测 |
| 三条命令全绿 | **本次未执行** | 同 B-2 |

---

## C. 部署阻塞项 vs 可后置项

### C-1 真正阻塞"第一次部署"的
1. **部署路径从未执行**（`docs/DEPLOYMENT.md:2-3` 自述），我也没有执行权：`docker compose up -d --build`、镜像构建（`npm ci` + `vite build` + `tsc`）、容器以 uid 1000 读 `/srv/data/cookbook`、HEALTHCHECK 是否变 healthy —— 全部**未经任何验证**。这是 T3，需要明确授权后才能做，且必须产出 `docs/verification/deploy-*/CHECK.md`。
2. **`.env.server.example` 不受 git 跟踪**（`.gitignore:8-9`）：DEPLOYMENT §3 的 `cp .env.server.example .env.server` 依赖它；走 rsync 交付时没问题，但一旦有人在服务器上 `git clone`，这一步会失败。（若它曾被 `git add -f`，则不是问题——我无法查 git 索引，见 E。）
3. **首次数据灌入必须包含 `equipment.json`**：漏掉不会报错（服务照常起，只提示"清单未载入"），叠加 P1-3 会让详情页给出**确定的错误结论**。DEPLOYMENT §1 已包含 scp，但 §6 把它标成"改过才需要"，容易让人以为首次可跳。
4. **验收不能只看 `/api/health`**：0 道菜时 `{"status":"ok","recipes":0}`（`routes/recipes.ts:22-25`）→ 容器 healthy 但页面空白。DEPLOYMENT §5 已含 `curl /api/recipes`，保留即可。

### C-2 可后置（不阻塞首次上线）
- `compose.yaml:24-28` 数据挂载 `read_only: true`：与 `ARCHITECTURE.md:101` D4"可写"矛盾（P2-7⑤），但当前功能不需要写，是 M5 才要动的事（compose 注释已说明）。
- `ARCHITECTURE.md:102` D5"镜像按 linux/amd64 构建，需要 buildx"：实际构建发生在 x86_64 服务器上（DEPLOYMENT §2 步骤 4 在 ssh 会话内执行），不需要 buildx；文档澄清即可。
- DEPLOYMENT §5 备份/恢复、§6 排障：命令自洽（备份路径依赖服务器已有 `/srv/backup`，见 E）。
- 备份不包含 `/srv/app/cookbook/source/.env.server`，但可由 example 重建，无风险。

---

## D. 下一步里程碑建议（按优先级，≤5）

1. **修数据层的"假承诺"（P1-1 + P1-2 + P2-12）**：改 `ke-le-ji-chi.json` 的替代组与 `xi-hong-shi-chao-ji-dan.json` 步骤用量表述；在 CB-002 里补一条内容纪律"替代组必须在该器具上真能做完所有步骤"，在 CB-001 里补"步骤文本与换算份量的关系"。这是本项目唯一会让人做坏菜的一类缺陷。
2. **堵住词表的两个洞（P1-3 + P1-4 + P2-6）**：词表不可用时进入"无法判断"态而不是给结论；`check:data` 在 `equipment.problem` 时非零退出；词表条目先 trim 再校验。顺带补 `equipment.test.ts` 缺失的"含空字符串"用例（CB-002 §7 已声称存在）。
3. **一批前端可靠性与手感修复（P1-5 + P1-7 + P1-6 + P2-1/3/5/8）**：面板保存失败提示、到点提醒保持到确认、触摸目标 ≥44px、全完成跳转、alert 返回值语义、完成索引清洗、reduced-motion。合成一个 T1 变更并回填 CB-001/CB-002 的验收清单与证据。
4. **补验收证据**：真机试做一次可乐鸡翅并填 `docs/features/CB-001-cooking-feedback.md`，把截图/命令输出放进目前**空白**的 `docs/verification/`，才能把两份规格从 `implemented` 推到 `verified`（CB-001 §6/CB-002 §6 目前是**全未勾选**）。
5. **再做部署（T3，需授权）**：先本地 `npm run build && npm start` 跑通，再按 DEPLOYMENT 步骤 1–6 执行并留 CHECK.md；之后开 M4 图片规格时请用 `CB-003`（修正 `ROADMAP.md:22,:133` 的编号错误）。

---

## E. 我不确定 / 无法验证的点（不猜）

1. **所有命令类结论**：`npm run typecheck`、`npm test`（README 说 18、CB-002 说 85 —— 我按源码数出 7 文件 85 个 `it(`，**这是计数不是运行结果**）、`npm run check:data`、`npm run build`、`docker build/compose` 一律未执行。
2. **真机行为**：iOS Safari 的 Web Audio 是否真的静音（我只验证了代码"没在用户手势内创建/`resume`"）、`navigator.vibrate`、Wake Lock、字号/触控/无横向滚动、抽油烟机噪声下响铃可闻度 —— 全部未验。
3. **服务器事实**：DEPLOYMENT §0 的实测值（端口占用、`/srv` 空间、`/srv/docker`、SSH 免密、`/srv/backup` 是否存在）我无法复核。
4. **git 状态**：`.gitignore` 会忽略 `.env.server.example`，但它是否被 `git add -f` 强制入库、`data/**` 是否已被跟踪，需要 `git ls-files` 才能定论（我无 git 访问）。同理，我无法判断当前工作区是否有未提交改动。
5. **构建可复现性**：`package.json` 里的 `typescript ^7.0.2`、`vite ^8.3.0`、`vitest ^4.1.11`、`@types/node ^26` 等版本是否真实存在于 registry、`npm ci` 是否能在容器内完成，未验证（无网络/无执行）。
6. **烹饪判断**：电饭锅/空气炸锅能否完成可乐鸡翅的焯水-煎-收汁，是我的烹饪常识判断（`ke-le-ji-chi.json:86,93,106`）；若你认为可行，则 P1-1 应降级为"内容口径需用户确认"，但"步骤文本与器具能力必须一致"这条纪律仍然成立。
7. **对比度**：`.badge` 的 `--color-muted #7b6f68` on `--color-accent-soft #fdece4` 我按 WCAG 公式手算约 **4.24:1**（<4.5，12px 小字），深色模式与正文 4.56:1/6.9:1 通过；需要工具实测才能定论，故未列为发现。
8. **未审查**：`node_modules/`、`dist/`、`package-lock.json` 内容、`.env.server`（本机不存在）、其他仓库（`pt-media-assistant`）。

---

## Review
- **Correct**：分层与边界清晰（`repository` 单点数据入口、`kitchen.ts` 纯函数判定、`scale.ts`/`timer.ts` 纯函数）；纯函数测试覆盖到位（85 例，含跨息屏、取整、替代优先级、去重、词表校验错误路径）；无 XSS/路径穿越/写操作面；容器安全基线（非 root、只读根、cap_drop ALL、仅局域网绑定）与文档一致；两份规格状态诚实停在 `implemented`（未虚报 `verified`）。
- **Fixed**：无（只读复核，未改任何文件）。
- **Finding**：P1 × 7、P2 × 12（见 A），最重的三条是"可乐鸡翅虚假替代"(P1-1)、"词表失效仍给确定结论 + check:data 假绿"(P1-3/P1-4)、"份量换算与步骤数字打架"(P1-2)——都命中项目自述的第一原则"别让人以为能做/以为用量对"。
- **Merge verdict**：**OK with notes**——代码骨架与文档体系可继续演进，但上述 P1 应在首次部署与"真机验收 → `verified`"之前处理；部署本身仍属未执行过的 T3，需明确授权。