# 数据模型

状态：**已实现**（字段与校验规则均已落地；`equipment` / `equipmentAlternatives` 见 CB-002）
日期：2026-09-19（2026-09-20 复核后更新状态）

## 1. 文件即数据

- 一道菜 = 一个文件：`data/recipes/<id>.json`
- 文件名 `<id>` 必须与文件内 `id` 字段一致（小写字母、数字、连字符）
- 数组顺序 = 显示顺序（步骤不需要写 `index`，用数组下标即步骤号）
- 图片**不写进 JSON 的路径字段**（见 §4），用约定目录匹配，避免改文件名后 JSON 失效

## 2. 字段定义

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 唯一标识，等于文件名（不含 `.json`） |
| `name` | string | ✅ | 菜名，如"西红柿炒鸡蛋" |
| `aliases` | string[] | | 别名/俗称，仅用于搜索命中（"番茄炒蛋"） |
| `category` | string | ✅ | 单值分类：家常菜 / 汤羹 / 主食 / 凉菜 / 早餐 / 甜品 |
| `tags` | string[] | | 多值标签：快手 / 下饭 / 新手友好 / 一锅出 / 减脂 / 宴客 |
| `summary` | string | | 一句话介绍，列表卡片与详情页顶部显示 |
| `difficulty` | 1\|2\|3 | ✅ | 1 简单 / 2 适中 / 3 有点挑战 |
| `servings` | number | ✅ | 基准份量（人数）。**规范：默认记 2 人份**，这 2 人份是"一男一女的实际食用量"这个**家庭基准**（不是 1 人份 × 2）。**只用于展示，不做任何自动换算**（2026-09-20 撤掉换算，理由见 [CB-001](features/CB-001-cooking-mode.md) §3.2） |
| `prepMinutes` | number | | 备料时间（分钟） |
| `cookMinutes` | number | | 烹饪时间（分钟） |
| `equipment` | string[] | | **必需**的厨具（全部要有）；值必须来自 `equipment.json` 的 `tools` |
| `equipmentAlternatives` | string[][] | | **可选**：每个子数组是"任选其一"的一组厨具；值同样必须来自词表 |

厨具字段的读法与判定规则（三态、替代优先级）见 [CB-002 规格](features/CB-002-kitchen-tools.md)；"我有什么厨具"存在浏览器本地。

**厨具是受控词表，不是自由文本**：合法取值定义在 `data/equipment.json`：

```json
{
  "tools": ["炒锅", "平底锅", "砂锅", "汤锅", "蒸锅", "高压锅", "空气炸锅", "烤箱", "微波炉", "电饭锅", "电饼铛", "烤盘", "蒸屉"],
  "defaultOwned": ["炒锅", "砂锅", "空气炸锅", "烤箱", "电饭锅"]
}
```

| 字段 | 说明 |
| --- | --- |
| `tools` | 权威词表。菜谱只能引用这里的值 |
| `defaultOwned` | 没设置过"我的厨具"时默认勾选的项（必须是 `tools` 的子集） |

**加一件厨具** = 在 `tools` 里加一个名字 + 重启服务（不需要改代码、不需要重建镜像）。
**菜谱写错名字** = 该菜谱校验失败并被跳过，错误信息会列出全部可选值。

```json
{
  "equipmentAlternatives": [["炒锅", "砂锅", "电饭锅"]]
}
```

读法：主锅具用炒锅、砂锅、电饭锅里的**任意一件**都行；我有哪个就用哪个，优先菜谱写在前面的那个。

**替代组的内容纪律（独立复核 P1-1 后新增，硬要求）**：

- 替代组里的器具必须能在**同一套步骤**下真正完成全部操作 —— 例如炒锅 ↔ 平底锅 ↔ 汤锅（同为明火平底锅具，焯水/煎/焖/收汁都做得到）。
- **做法不同的器具必须另写一份菜谱**：可乐鸡翅的步骤是"冷水下锅焯 → 热锅倒油煎 → 焖 → 收汁"，
  写成"可用空气炸锅代替"就是假承诺 —— 用户会照着做然后做坏菜。
- 这条**无法自动校验**，靠人工判断；`npm run check:data` 只能保证名字在词表内。
| `ingredients` | Ingredient[] | ✅ | 主料 + 调料，见下 |
| `steps` | Step[] | ✅ | 有序步骤，见下 |
| `tips` | string[] | | 小贴士 / 易错点 |
| `source` | string | | 来源（"妈妈的做法"、链接等） |
| `createdAt` / `updatedAt` | string | | `YYYY-MM-DD`；`updatedAt` 由**应用保存时**写入（手改文件不会更新它） |

### Ingredient

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | ✅ | 食材名，搜索"鸡蛋"靠它命中 |
| `amount` | number \| string | | 数值优先（便于换算）；"适量""少许"用字符串 |
| `unit` | string | | 个 / g / ml / 勺 / 根 / 片 |
| `group` | string | | `主料`（默认）/ `调料` / `腌料` / `汤底` |
| `note` | string | | 处理说明："切滚刀块""提前泡发" |

### Step

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `text` | string | ✅ | 一句话说清操作，**写得短**（这是本项目的核心体验） |
| `title` | string | | 可选小标题："调汁""收汁" |
| `minutes` | number | | **这一步里需要计时的时长**（分钟），也是详情页一键计时的默认值。**文案里的分钟数必须与它相同**（有自动检查）。写清"从什么时候开始算"：如焯水写成"烧开后焯 2 分钟"，`minutes: 2` 指的是烧开之后的那 2 分钟 |
| `heat` | string | | 火候："大火""中火""小火""中小火" |
| `tip` | string | | 该步骤的小提醒，详情页弱化展示 |

### Step.minutes 的语义

`minutes` = **这一步大概要多久（包含等待）**，不再区分"动手时间/等待时间"：

- 腌制 10 分钟 → `"minutes": 10`
- 热油 2 分钟 → `"minutes": 2`
- 翻炒 3 分钟 → `"minutes": 3`

它同时是详情页上**一键计时的默认时长**；步骤没有 `minutes` 时不显示计时入口。

## 3. 样例

真实样本已放在仓库里，可直接照着写：

- `data/recipes/xi-hong-shi-chao-ji-dan.json`（3 步，快手菜，含调料与技巧）
- `data/recipes/ke-le-ji-chi.json`（4 步，含腌制与收汁）

## 4. 图片约定（已实现，CB-007）
```text
data/images/<recipe-id>/
├── cover.jpg        # 封面图（列表卡片 + 详情页头图）
├── step-1.jpg       # 第 1 步配图（可选，允许跳号）
├── step-2.jpg
└── ...
```

- **文件名是受控的**：只认 `cover.jpg` 与 `step-<N>.jpg`（严格小写 `.jpg`）。`cover.png` / `cover.jpeg` / `IMG_1234.jpg` / HEIC 都不认，启动时告警而不是猜；步骤号从 1 开始，**允许跳号**（只有 step-1、step-3 是合法的），超过步骤数的 `step-N` 被忽略并告警。
- 服务端**启动时**扫描目录，把存在的图片匹配到对应菜谱；**JSON 里不写路径**（改名/换图不需要动菜谱文件）。所以：加了图片要**重启服务**才生效。
- 接口上的**派生字段**（不来自 JSON）：列表 `coverImage`；详情 `coverImage` + `stepImages`（与 `steps` **等长**，下标 i 是第 i+1 步，无图那项为 `null`）。
- 图片 URL 形如 `/images/<recipe-id>/cover.jpg`；服务端只提供**扫描认下的那些文件**（白名单），关闭目录列表，缺失返回真 404；响应头 `no-cache` + ETag（换图后刷新即见，见 [ADR-0004](decisions/ADR-0004-image-static-hosting.md)）。
- 缺 `cover.jpg` 时用占位图（纯色块 + 菜名首字），图片加载失败也回落到它，**永远不出现破图**。
- 建议尺寸：封面长边 1200–1600px，步骤图长边 800–1200px，JPEG 质量 80。**首版不生成缩略图**（列表直接用原图 + 懒加载），口径与代价见 [CB-007 §1](features/CB-007-images.md)。
- 图片目录与菜谱目录同级，备份 `data/` 即备份全部内容。

## 5. 校验规则

后端启动时对每个文件执行（zod），规则如下：

1. `id` 与文件名一致，否则拒绝并报错日志。
2. `name`、`category`、`servings`、`difficulty`、`ingredients`、`steps` 必填。
3. `steps` 至少 1 条，`steps[].text` 非空。
4. `difficulty` 只能是 1/2/3。
5. 单个文件校验失败：**跳过该文件 + 打印可定位的错误**，不影响其他菜谱与服务启动。
6. 启动日志汇总：载入成功 N 道 / 失败 M 道（失败项列出文件名与原因）。

配套脚本：`npm run check:data`（`scripts/check-data.ts`，经 tsx 运行，复用后端同一份 zod 规则）——不启动服务即可校验全部数据文件。

## 5b. 网页编辑与修改记录（CB-009）

- **写接口**：`PUT /api/recipes/:id`（整份替换）；写入前必须过 **zod（含词表）+ 内容检查**，不合法不写盘；并发用 **`revision`**（当前**文件字节**的 SHA-256）做版本守卫，不一致 → 409，**不静默覆盖**。
- **`revision` 是派生字段**（不进 JSON 文件）：详情接口下发，保存时原样回传。
- **修改记录**：每次保存前把**被替换掉的那一版**存到

```text
data/history/recipes/<recipe-id>/<historyId>-<source>.json
```

  记录含 `beforeRecipe`（旧版全文）、`beforeRevision`、`afterRevision`、`savedAt`、`source`（`manual`/`llm-merge`/`import`/`restore`）、`note?`、`outcome`（`pending`/`replaced`/`failed`）。
  `historyId` 是**历史记录自己的 ID**（时间戳 + 随机），与内容 `revision` 不是一回事。列表按 `savedAt` 倒序。
- **不自动删除历史**（删除属数据操作，需授权）；历史随 `data/` 一起备份。
- **schema 之外的键会被保留**：保存以**磁盘上的原始 JSON** 为底、用校验后的字段覆盖，所以像 `sourceRef`（CB-010）这种当时还不认识的字段不会被顺手删掉。
- 策略与失败语义（提交点、历史写失败、替换失败）见 [ADR-0005](decisions/ADR-0005-editable-recipes-and-history.md)；**手工改文件请先停服**（没有文件锁，见该 ADR §1）。

## 6. 待定项

本文件只记字段的**定义与校验规则**；下面这些尚未拍板的选择记在其他地方，不在这里重复：

| 待定项 | 权威位置 |
| --- | --- |
| 分类（`category`）允许值清单 | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) Q3 |
| tag 词表与取值 | [`data/tags.json`](../data/tags.json) + [CB-006](features/CB-006-tags.md) |
| `unit` 是否做成枚举 | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) Q2 |
| 别名是否支持拼音搜索 | [ROADMAP.md](ROADMAP.md) M5 |
| 份量缩放（暂不做，要做得先立规格） | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) |
| 步骤时长与计时的交互 | [CB-001 规格](features/CB-001-cooking-mode.md) §3.4 |
| 厨具字段的判定与"我的厨具" | [CB-002 规格](features/CB-002-kitchen-tools.md) |

> 字段一旦被规格确认并实现，**必须回填到本文件**（这里是字段的权威位置）；未实现的只能留在规格里，不能先写进来造成"文档比代码多"。

## 7. 菜谱内容自检清单

字段格式由 `npm run check:data` 自动校验；**内容对不对只能人工看**。每次新增或修改菜谱后逐条过一遍：

| # | 检查项 | 为什么 |
| --- | --- | --- |
| 1 | **每条 `tip` 都服务于本步骤** | 用户 2026-09-20 抓到的正是这条："焯水"步挂着"否则煎的时候会溅油"——那是**煎**那一步的提醒，放错了位置会让人在焯水时就担心溅油（而且焯水根本不溅油） |
| 2 | 文案里的分钟数字 = `minutes` | 自动检查（`content-lint.ts`）：不一致会让计时按钮显示的和文案说的不是一回事 |
| 3 | 需要计时的步写清**从何时起算** | "冷水下锅焯 2 分钟"有歧义（从冷水算还是烧开算）；改成"烧开后焯 2 分钟"就明确了 |
| 4 | `heat` 写本步**主要阶段**的火候；中途换火在文案里写清 | 如"大火烧开转中小火焖 12 分钟"，`heat` 填"中小火"（真正在煮的那段） |
| 5 | 文案里的用量数字与食材表**加法自洽** | 例："倒 15ml 油"+"补 5ml 油" = 食材表 `食用油 20ml`；不一致就是告诉用户错的量 |
| 6 | 文案提到的食材必须在食材表里有 | 否则要临时找，或发现没有 |
| 7 | 每步只做一件事；步骤顺序 = 真实操作顺序 | 这是"顺手"的核心，最终由试做反馈判定（见 [CB-001](features/CB-001-cooking-mode.md)） |
| 8 | 不需要计时的步骤不硬填 `minutes` | 没有计时入口比给个假时长更好 |

> 自动化的边界：`content-lint.ts` 能查 #2（以及食材重复），其余 #1、#3–#6 是语义判断，**只能人工过**。
> 服务启动时会把内容问题打成 `warn` 日志。`npm run check:data` 只在字段校验失败或出现**错误级**内容问题时以非零退出；**警告级**内容问题会列出供人工复核，不阻止通过。

同组重名食材可能是分阶段使用；单步出现多个时间而未填 `minutes`，表示该步没有一键计时入口。处理警告前先对照来源和实际做法，确认重复或计时起点确实有问题，再改菜谱内容。

## 8. 内容来源与许可

| 来源 | `source` 字段 | 许可 |
| --- | --- | --- |
| 自建（用户口述/整理） | `家常做法` | 自有 |
| [HowToCook](https://github.com/Anduin2017/HowToCook)（程序员做饭指南，62k★） | `HowToCook（Unlicense 公有领域）· <仓库地址>` | **Unlicense（公有领域）**，可自由使用 |
| ~~[CookLikeHOC](https://github.com/Gar-b-age/CookLikeHOC)（像老乡鸡那样做饭）~~ | **不使用** | **无 LICENSE 文件** → 默认保留所有权利，内容不可照搬（仅参考其分类组织方式） |

**规矩**：只导入许可明确允许的内容；`source` 字段必须写清出处。法律上 Unlicense 不要求署名，但注明来源是最低成本的正确做法。

### 导入内容的份量口径（重要）

HowToCook 的份量与模板约定并不统一，导入器按以下规则逐文件读取（`howtocook-parse.ts` 的 `parseServings`）：

| 原文写法 | 处理 |
| --- | --- |
| `一份正好够 2 个人吃` | `servings: 2` |
| `一份正好够 1 个人食用` / `一份正好够一个人吃` | `servings: 1` |
| `一份够 1~2 个人吃`（范围） | **取下限** `servings: 1`（量够下限人数吃） |
| **没写份量**（约 75% 的文件） | 按官方模板约定记 `servings: 2`，**并在 `source` 里注明"原文未声明份量，按官方模板约定记为 2 人份"** |

**导入时用量数字一律原样照抄**（导入器不做任何换算）；`servings` 是"这份量够几个人吃"的标注。
详情页也只显示菜谱原文，不做自动换算。缩放方案 [CB-004](features/CB-004-serving-scale.md) 已被后续决定取代；当前规则见 [CB-001 §3.2](features/CB-001-cooking-mode.md)。

### 用户状态（点赞、收藏、我的厨具）

与菜谱内容**分开放**，由应用运行期写入（写操作边界见 [ADR-0003](decisions/ADR-0003-write-operations-user-state.md)）：

```json
// data/user-state.json
{
  "version": 1,
  "recipes": { "hong-shao-rou": { "likes": 3, "favorite": true, "updatedAt": "..." } },
  "kitchen": { "tools": ["炒锅", "烤箱"], "updatedAt": "..." }
}
```

- 点赞是**计数增减**（下限 0），收藏是开关；写入为**原子替换**（临时文件 → rename）+ 串行队列。
- 文件损坏 → 另存 `.broken` 后用空状态启动；写入失败 → 接口 503、前端回滚。
- 排序：**收藏优先 → 点赞降序 → 名称**，且只在**没有搜索词**时生效（搜索仍按相关度）。
- **`kitchen` = 「我的厨具」**（[CB-008](features/CB-008-kitchen-tools-server.md)）：`tools` 只存词表里的值（去重、顺序按词表）；**字段缺失 = 从未设置过**（用 `equipment.json` 的 `defaultOwned`），**`tools: []` = 明确全不选**（两者语义不同，不能混）。
  - 接口：`GET /api/user-state` 一起下发；`POST /api/kitchen` 整份替换（词表外的名字 → 400，词表未载入 → 503，写盘失败 → 503）。
  - 升级前存在浏览器本地的厨具，会在新版本首次打开时**自动上传一次**（按当前词表过滤，成功后清掉本地键）。

### 菜品图片

- 约定路径仍是 `data/images/<recipe-id>/cover.jpg`。
- **图片不进 git**：约 60MB 二进制；数据备份靠打包 `data/`（见 DEPLOYMENT），不靠版本控制。
- 导入器只认**能确定**的成品图：markdown 里引用的第一张图，或「菜名.后缀」/目录里唯一的一张图；一张目录里有多张（`1.jpeg`、`2.jpeg` 这类步骤图）时**不猜**（首次导入 371 道菜里 179 道有封面）。
- 后续人工补图与 AI 示意图的来源审核和标识策略见 [ADR-0007](decisions/ADR-0007-reviewed-cover-sources.md)；本批逐张来源、提示词和素材哈希见 [CB-012 CHECK](verification/CB-012/CHECK.md)。目录和派生字段沿用 §4。
- 其他开放许可照片的采用与署名方式见 [ADR-0008](decisions/ADR-0008-open-photo-attribution.md)；作者、文件页与许可由 [图片署名页](../public/image-credits.html) 维护；逐张审图和素材身份见 [CB-013 CHECK](verification/CB-013/CHECK.md)。这不会改写菜谱内容的 `source` 或 `sourceRef`。

## 9. 创意工坊草稿与新建（CB-014）

2026-10-01 已接受、实施中；用户交互与验收见 [CB-014](features/CB-014-recipe-workshop.md)，写入与恢复策略见 [ADR-0009](decisions/ADR-0009-recipe-workshop.md)。正式 `Recipe` 字段不变，旧菜谱无需迁移。工坊记录不进 Git，随 `data/` 备份。

| 字段 | 含义 |
| --- | --- |
| `version: 1`、`draftId`、`createdAt`、`updatedAt` | 草稿格式版本与系统元数据；ID 为 `w-` 加 24 位十六进制随机数 |
| `revision` | draft.json 文件字节的 SHA-256，API 派生值，不写进 JSON；所有用户写入回传 `baseRevision` |
| `inputVersion` | 用户修改材料/候选时递增，机器任务进度不递增；防止旧分析覆盖新输入 |
| `sources` | 材料 ID（`s-` 加 24 位随机数）、类型 `link/text/image/json`、名称、顺序、selected、处理状态、文本/公开 URL/作者、哈希和大小；图片记录真实 MIME、尺寸与归一化字节数 |
| `instructions` | 用户对本次材料的补充或更正，最多 4000 字符 |
| `candidate`、`hasUserEdits` | 不含 id/sourceRef/时间戳的部分 Recipe；未知必填字段可暂缺。用户改动后的再次整理保存在 suggestion，不直接覆盖 |
| `analysis`、`alternatives`、`suggestion` | analysis 为最近一次已校验的整理结果，独立于用户编辑用于可靠复用；alternatives 为多菜候选，suggestion 为再次整理提案。一次只提交一道菜，每个候选有 key、recipe、evidence、unresolved；旧草稿缺 analysis 时重新整理，不错误复用被用户清空的候选 |
| `evidence`、`unresolved` | 字段路径、状态 `source/user/suggested/unknown`、材料 ID 与可选原文片段；未决项为 field/message；不以引用存在证明数字正确 |
| `reviewed` | 用户明确完成审阅；材料/候选变动会失效，正式保存还须完整 schema/词表/内容检查 |
| `images` | 可选 coverSourceId、与步骤位置对应的 stepSourceIds；只允许本草稿已接收的图片材料，须人工确认自有照片 |
| `generation` | taskId、state、inputVersion、fingerprint、开始/结束时间、model/promptVersion、受控错误与 token 用量；状态 queued/extracting/analyzing/complete/failed/interrupted |
| `creation` | 创建幂等键、服务端新菜 ID、冻结的正式 recipe 与哈希、图片清单、prepared/committed 阶段；回执异常时据此恢复 |
| `savedRecipeId` | 已创建菜谱的关联 ID，不允许在重试中产生第二道或改写第一道 |

目录：`data/workshop/drafts/<draftId>/draft.json`；图片材料原件为 `sources/<sourceId>.<实际格式>`，DS/正式配图用 `sources/<sourceId>.normalized.jpg`。只有用户确认采用的图片进入已有 `data/images/<recipeId>/cover.jpg`、`step-N.jpg`。工坊素材路由只按受控 ID 查记录，不托管任意目录。

新增 API 形状以共享类型和 schema 为实现约束：capabilities、drafts 列表、create/read/PUT、POST sources/analyze/commit 与只读素材 GET，具体交互见 [CB-014 §4](features/CB-014-recipe-workshop.md#4-数据与接口变化)。capabilities 的可选 `vocabulary` 提供完整 tags/equipment 词表，区别于首页 `meta.tags` 已使用的筛选项。`commit` 输入为 `{baseRevision, creationKey}`，返回 `{recipe, draft, warnings}`；并发守卫或新 ID 冲突 → 409，格式/内容错误 → 400，素材超限 → 413。

## 10. 每日菜单与请求预算（CB-015）

2026-10-03 已接受；交互见 [CB-015](features/CB-015-daily-home-menu.md)，调度与故障策略见 [ADR-0010](decisions/ADR-0010-daily-menu.md)。这是独立派生缓存，不改 Recipe、图片或用户状态。

文件为 `data/recommendations/daily-menu.json`，格式 `{version: 1, records: {"YYYY-MM-DD": record}}`。日期按 Asia/Shanghai；日期键必须等于记录的 `date`，记录无自动清理。不存在时为空；结构损坏时保留原文件并停止模型调用，以普通搭配降级。

| 字段 | 含义 |
| --- | --- |
| `date`、`attemptedAt` | 北京日期与认领时的 ISO 时间；任何同日记录都消耗该日尝试预算 |
| `status` | `generating / ready / failed`；先原子落盘 generating，再发请求 |
| `model`、`promptVersion` | 固定 `deepseek-flash` 与提示词版本；不含密钥或完整提示词 |
| `generatedAt`、`picks`、`reason` | ready 必填；picks 恰好三项 `{role, recipeId}`，角色 `main / vegetable / soup` 各一个且 ID 不重复；reason 最多120字符 |
| `errorCode` | failed 的受控错误码，不保存提供方响应、URL或异常全文 |
| `usage` | 可选 promptTokens/completionTokens/totalTokens，用于真实用量核验 |

`GET /api/daily-menu` 只读，返回 `{date, menuDate?, people: 2, source, status, items, reason?, generatedAt?}`。`date` 是请求时北京日期；`menuDate` 为真正缓存菜单日期。`source` 为 `llm / fallback`；`status` 为 `ready / updating / stale / fallback`。每项为 `{role, recipe: RecipeSummary}`，实时关联已有菜谱及用户厨具/收藏展示；旧ID失效则寻找最近有效菜单或普通搭配。无完整组合时 items 为空，不制造菜谱。

服务端只向模型发送候选摘要：id、name、category、servings、difficulty、食材名、厨具/替代组、tags和可用时间；不发送来源链接、完整步骤、图片、草稿或用户历史。人数固定2，原用量不变。
