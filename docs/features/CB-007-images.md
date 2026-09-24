# 功能规格：图片展示（封面、头图、步骤配图）

## 元数据

| 字段 | 内容 |
| --- | --- |
| 编号 | `CB-007` |
| 状态 | `implemented`（本机手机视口 + 桌面 + 生产模式实测通过；**真机待做**，证据见 §11 与 [verification/CB-007/CHECK.md](../verification/CB-007/CHECK.md)） |
| 变更等级 | `T2`（首次把数据目录的内容通过 HTTP 暴露出去 → 见 [ADR-0004](../decisions/ADR-0004-image-static-hosting.md)） |
| 创建日期 | 2026-09-20 |
| 最后文档复核 | 2026-09-20 |
| 设计依据 | [REQUIREMENTS](../REQUIREMENTS.md) F7/F8；[ROADMAP](../ROADMAP.md) M4；[DATA_MODEL §4](../DATA_MODEL.md) 图片约定；用户 2026-09-20："做下一个功能，图片" |
| 关联 ADR | [ADR-0004：从数据目录托管菜谱图片](../decisions/ADR-0004-image-static-hosting.md)（暴露面白名单、缓存语义、不做缩略图） |
| 预计实现路径 | `src/shared/types.ts`；`src/server/lib/image-media.ts`（新）；`src/server/services/recipe-repository.ts`；`src/server/services/search.ts`；`src/server/routes/images.ts`（新）；`src/server/routes/recipes.ts`；`src/server/index.ts`；`src/client/components/RecipeCover.tsx`（新）、`RecipeCard.tsx`、`StepCard.tsx`、`StepList.tsx`、`pages/RecipePage.tsx`、`lib/api.ts`、`styles/global.css`；测试见 §7 |
| 验收负责人 | 你（本机手机视口 + 真机；步骤图需素材） |

## 1. 目标与非目标

### 目标（用户能观察到的结果）

1. **列表页**：有封面图的菜显示照片（缩略显示、懒加载）；没图的菜显示首字色块，**任何情况下不出现破图**。
2. **详情页**：有封面图时在顶部显示一张大图（限高，**不把菜名/食材挤出首屏**）；没图时不出现空白大块。
3. **步骤配图**：`step-N.jpg` 存在时显示在该步骤卡片里，且**不干扰打勾与计时**。
4. **加图片不需要改代码**：往 `data/images/<recipe-id>/` 放 `cover.jpg`，重启服务即可在列表与详情看到（不改 JSON、不重建镜像）。
5. 图片加载失败时**优雅降级**：卡片回落到首字色块，步骤图给出简短提示，页面其他部分不受影响。

### 非目标（明确不做，以及为什么）

1. **不做压缩缩略图**：列表用的是同一张 `cover.jpg`，靠 `loading="lazy"` + CSS 缩放显示，**不是**真正的缩略图文件。
   - 理由：现有依赖做不到，需要新依赖（sharp 等原生模块）或一套派生文件流水线（多一份要同步/失效的产物）。
   - **口径要说清楚**：单张中位数约 230 KiB、最大约 1 MiB；滚动看完现有 179 张累计约 **56 MiB**。首版按"局域网内可接受"批准；真机若卡，另立规格（属 T1）。
2. **不做网页上传 / 压缩 / 裁剪 / 旋转**（M5，写操作属 T2，需新 ADR + 规格）。
3. **不支持 `data/images/` 里的非约定文件名**：只认 `cover.jpg` 与 `step-<N>.jpg`（`cover.png`、`cover.jpeg`、`IMG_1234.jpg` 都不认，启动时告警）。
4. **不支持 HEIC**（iPhone 默认格式，Chrome/Android 显示不了）：需要先转成 jpg。文案写进 `DATA_MODEL`/排障表。
5. 不做占位图片素材（继续用现有的首字色块，不引入图片资源）。
6. **不做部署**（T3，需授权）；不改容器配置、不改监听地址、不加新端口。

## 2. 用户场景与状态流

场景：厨房里，手机竖屏，一只手，可能手上有油。浏览时想"一眼认出这道菜"，做菜时想"看一眼这步该是什么样"。

```text
列表页（371 道菜）
  ├─ 有 cover.jpg → 卡片封面方块显示照片（懒加载，滚到才下载）
  └─ 没有        → 首字色块（现状不变）
       ↓ 点开
详情页
  ├─ 顶部大图（限高 38vh；没有则不渲染）
  ├─ 菜名 / 摘要 / 元信息 / 食材 / 步骤（位置不变）
  └─ 某个步骤有 step-N.jpg → 该步骤卡片里显示步骤图（可点开看大图？→ 不做，见非目标）
       ↓ 打勾、计时、吸顶回位等既有行为完全不变
```

新增图片的流程（用户侧）：

```text
Mac:  cp 照片.jpg ~/Workspace/cookbook/data/images/<recipe-id>/cover.jpg
      （本地 dev：tsx watch 会重启，刷新即可）
服务器: rsync/scp data/images/ → /srv/data/cookbook/images/  → docker restart cookbook
      （图片不在镜像里，不需要重新构建）
```

## 3. 交互细节与状态

### 3.1 列表卡片封面（`RecipeCard`）

| 状态 | 表现 | 说明 |
| --- | --- | --- |
| 有图 | 56×56 圆角色块内显示照片（`object-fit: cover`） | 尺寸与位置**沿用现状**，卡片布局与点击区域不变 |
| 无图 | 首字色块（现状） | 与现在完全一致 |
| 加载中 | 首字色块（图在色块上层，加载完自然盖住） | 不需要 loading 文案 |
| 加载失败 | 图隐藏，露出首字色块 | `onError` 切换；**不显示破图图标**，不加噪音提示 |
| 极端宽高比 | 裁切填满方块，不撑破布局 | 既有素材从 512×384 到 900×1600 都有 |
| 滚动 | 视口外的图片不下载 | `loading="lazy" decoding="async"` + 固定宽高（不产生跳动） |

### 3.2 详情页头图（`RecipePage`）

| 状态 | 表现 | 说明 |
| --- | --- | --- |
| 有图 | 顶栏下方一张整宽大图，`aspect-ratio: 16/9`，`max-height: min(38vh, 320px)`，`object-fit: cover` | 限高是硬要求：首屏仍要能看到菜名与食材开头 |
| 无图 | **不渲染这个区域** | 不用色块占位（大色块比没有更糟） |
| 加载中 | 固定比例的空区域（不跳动） | 背景用中性色，不用渐变 |
| 加载失败 | 区域收起，提示一行"封面图加载失败" | 与卡片不同：详情页有空间说清原因 |
| 加载策略 | `eager`（首屏内容，不懒加载） | 但**不阻塞**食材/步骤渲染（`<img>` 天然不阻塞 DOM） |

### 3.3 步骤配图（`StepCard` / `StepList`）

| 状态 | 表现 | 说明 |
| --- | --- | --- |
| 有图 | 显示在**完成按钮之外**（按钮下方、`step-actions` 上方） | 图片不能包在"标记完成"的按钮里：点图不该把步骤标成完成 |
| 无图 | 不预留空间（该步骤不出现任何空区域） | 只有有图的步骤才有这块 |
| 尺寸 | 整宽、`aspect-ratio: 4/3` 的固定区域、`object-fit: contain` | **不裁切**：步骤图的价值在操作细节，`cover` 会切掉关键部分 |
| 加载中 | 固定区域 + 中性背景（不跳动） | |
| 加载失败 | 区域内显示"第 N 步的配图加载失败"，**不改变**完成状态与计时 | 失败也不折叠，避免页面跳动 |
| 换步骤/换菜 | 组件按 `src` 重置失败状态，允许重新加载 | 失败状态不能"粘"住后续的图 |

### 3.4 手机端要求

- 竖屏不横向滚动；点击区域不变（步骤按钮 ≥ 44px）。
- 图片区域**宽高固定**（比例写死），滚动时不产生布局跳动。
- 图片不参与任何做菜交互：不遮挡打勾/计时按钮，不改变 `aria-pressed`。

## 4. 数据与接口变化

| 变化 | 内容 |
| --- | --- |
| 菜谱文件字段 | **无变化**。图片路径不写进 JSON（[ADR-0002](../decisions/ADR-0002-json-files-as-source-of-truth.md) 既有决定）；`data/recipes/*.json` 一个字节都不用改（**不需要迁移**） |
| 列表 API | `RecipeSummary.coverImage`（字段已存在、当前恒为 `null`）开始返回真实 URL：`"/images/<id>/cover.jpg"`；无图仍为 `null` |
| 详情 API | 响应增加两个**派生**字段（不来自 JSON）：`coverImage: string \| null`、`stepImages: (string \| null)[]`（与 `steps` **等长**，下标 i = 第 i+1 步；无图那项为 `null`）。类型上新增 `RecipeDetail` |
| 图片路由 | 新增 `GET/HEAD /images/<recipe-id>/<file>`。**只提供启动扫描认下的文件**（白名单集合：`cover.jpg` 与步骤号不越界的 `step-<N>.jpg`）；其余（隐藏文件、`cover.png`、越界步骤号、没有对应菜谱的目录、目录本身）→ **404**（不得回落到 SPA 的 `index.html`） |
| 响应头 | 图片：`Cache-Control: no-cache` + `ETag`/`Last-Modified`（条件请求 304）；404：`Cache-Control: no-store` |
| 图片目录 | 约定**不变**：`data/images/<recipe-id>/cover.jpg`、`step-<N>.jpg`（[DATA_MODEL §4](../DATA_MODEL.md)） |

接口响应示例（详情，`cover.jpg` + 只有第 2 步有图）：

```json
{
  "id": "ke-le-ji-chi",
  "name": "可乐鸡翅",
  "steps": [{ "text": "…" }, { "text": "…" }, { "text": "…" }],
  "coverImage": "/images/ke-le-ji-chi/cover.jpg",
  "stepImages": [null, "/images/ke-le-ji-chi/step-2.jpg", null]
}
```

**向后兼容检查**：菜谱 JSON 完全不动；旧文件照常工作；前端在 `coverImage: null` / `stepImages` 缺失时按"无图"处理（老接口快照也不破）。

## 5. 失败、降级与边界

| 情形 | 期望行为 | 用户可见反馈 |
| --- | --- | --- |
| `data/images/` 目录不存在 | 全部菜按无图处理，服务正常启动 | 无（日志 info 一行） |
| 图片目录名没有对应菜谱 | 忽略该目录 | 启动日志 warn（便于发现目录名拼错） |
| 目录里有未识别的文件名 | 忽略；不影响其他图 | 启动日志 warn（列出文件名与允许的名字） |
| `step-N` 的 N > 步骤数 | 不生成链接（图也不显示） | 启动日志 warn（"第 N 步不存在，共 M 步"） |
| 封面图文件损坏 / 读不出来 | 该菜无图（列表回落首字色块），其他菜不受影响 | 卡片：无提示（空间小）；详情：一行提示 |
| 图片是失效的符号链接 | 视为无图（客户端 `onError` 兜底） | 同上一行；已记入 §8 已知限制 |
| 客户端加载图片超时/失败 | 卡片回落首字色块；头图收起；步骤图区域内提示 | 明确但不刺眼；不出现破图图标 |
| 请求 `/images/` 下不存在的路径 | 404（JSON 或纯文本），**不是** 200 HTML | 排障时 `curl` 一眼能看出是 404 |
| 请求 `/images/../equipment.json` 之类 | 不返回该文件内容：编码形式（`%2e%2e`）被插件拒为 403；字面 `..` 会被 HTTP 客户端先规范化，从而落到 SPA 页面 | —— |
| 请求隐藏文件 / 未认下的文件（`cover.png`、大小写变体） | 404（macOS 大小写不敏感时是 403）；两者都不是 200 | —— |
| 用户快速重复操作 | 本功能无写操作 | 无影响 |
| 图片体积大（最大 ~1 MiB） | 懒加载；单张加载期间显示占位色块 | 不出现空白跳动 |

## 6. 验收标准

> 现有 `data/` 里已有 **179 张真实封面**，所以第 1–12 项用真实素材 + 生产模式（`npm run build && npm start`）实测，逐条记录与截图见
> [verification/CB-007/CHECK.md](../verification/CB-007/CHECK.md)。步骤图在真实数据里**没有素材**，用**临时数据目录**（`/tmp/cb007-fixture`）+ 浏览器（Playwright）与自动化测试固化。
> **真机（iPhone Safari / Android Chrome）仍未做**，因此本规格只到 `implemented`。

- [x] **列表（本机手机视口 390×844）**：有图显示照片、无图显示首字色块、**0 张破图**；不横向滚动；卡片点击区不变（最小高 161px）。**真机见下面单独两项**（本机浏览器不能替代真机）。
- [x] **列表性能**：懒加载实测生效（已加载数 18 → 22 → 37）；图片区域**盒子尺寸固定**（实测失败前后步骤图盒子高度不变 246px）。⚠️ **未测 CLS**（盒子不变 ≠ 没发生布局偏移，指标本身没测）。
- [x] **详情（有图）**：头图高 201px（≤ `min(38vh, 320px)`），**首屏同时可见菜名与首个食材**；不遮挡打勾与计时。
- [x] **详情（无图）**：头图不渲染，无空白大块。
- [x] **加图即生效（封面）**：隔离实例上放 `cover.jpg` → 重启 → 列表与详情都带出该 URL（不改 JSON、不重建镜像）；步骤图同样验过（放 `step-3.jpg` → 重启 → 详情带出 URL）。
- [x] **步骤图**（临时素材）：两张都渲染（允许跳号）；在完成按钮**之外**；**真实点击图片不改完成状态**（对照：点按钮会改）；加载失败时提示出现，计时与完成状态不变。
- [x] **缓存**：`GET` → 200 + `image/jpeg` + `ETag`；`If-None-Match` → **304**（浏览器实测出现 304）；`HEAD` → 200 无体；落盘字节与磁盘原文件 `cmp` 一致。
- [x] **路由边界**：缺失 → **404 且不是 HTML**（+ `no-store`）；`--path-as-is` 原始请求的 `..`/`%2e%2e` → **403**（服务器自身拒绝，不是客户端规范化）；`.DS_Store`、`cover.png`、`step-99.jpg`、无对应菜谱的目录 → 均不可访问。⚠️ 符号链接会被跟随（白名单是路径级，不是 realpath 边界，见 [CHECK.md §2.3](../verification/CB-007/CHECK.md)）
- [x] **SPA 共存**：生产模式下 `/recipe/<id>` 仍 200 HTML（`no-cache`）、`/assets/*` 仍 `immutable`；图片路由未被抢走。
- [x] **坏数据不影响**：坏目录名 / 未识别文件名 / 越界步骤号 → 服务照常启动、日志 warn（单测与临时目录实测）。
- [x] `npm run typecheck`（退出码 0）、`npm test`（退出码 0；CB-007 落地时 223 passed，2026-09-21 修复后 256 passed）、`npm run check:data`（退出码 0）、`npm run build`（退出码 0）。
- [x] 桌面端不回归（1280×800：每行 3 列、0 破图、无横向滚动）。
- [ ] **真机**（iPhone Safari / Android Chrome）：懒加载阈值、滚动流畅度、无破图 —— 本机浏览器与手机视口**不能替代**（未做）。
- [ ] **厨房场景**：头图是否把步骤挤太远、步骤图是否让翻找变慢 —— 需试做时记录（未做，记入 [CB-001 试做反馈](CB-001-cooking-feedback.md)）。

## 7. 测试要点

| 层级 | 用例 |
| --- | --- |
| 单元（纯函数，`lib/image-media.ts`） | 文件名 → 槽位解析（`cover.jpg`、`step-2.jpg`、`step-0.jpg`/`step-x.jpg` 非法）；白名单外名字（`IMG_1.jpg`、`cover.png`、`.DS_Store`）被忽略；`step-N` 越界不生成；`stepImages` 与 `steps` **等长对齐**（中间缺图是 `null`） |
| 单元（repository 扫描，**临时数据目录**） | 有 `cover.jpg` 的菜带 URL；无图目录 → `null`；`data/images/` 不存在 → 全部 `null` 且**不失败**；目录名无对应菜谱 → warn；未识别文件名 → warn；越界步骤号 → warn 且不生成链接 |
| 路由（`app.inject` + **临时数据目录 + 临时真实图片字节**） | 200 + `content-type: image/jpeg` + `ETag`；条件请求 → 304；`HEAD` → 200 无体；缺失 → 404（断言**不是** `text/html`）；`/images/../equipment.json` → 非 200；`.DS_Store`/`cover.png`/`step-99.jpg` → 404；**符号链接**（`cover.jpg` → 目录外文件）→ 记录实际行为（[ADR-0004](../decisions/ADR-0004-image-static-hosting.md) 要求用测试固定事实）；根目录不存在时不抛错 |
| API | 列表 `coverImage` 有/无图两态；详情 `coverImage` + `stepImages` 对齐；图片字段不进入菜谱文件的 zod 校验（JSON 里写 `coverImage` 被忽略，不报错） |
| 组件（jsdom） | 有 `coverImage` → 渲染 `<img>` 且带 `loading="lazy"`；`error` 事件 → 回落首字色块；详情无图 → 不渲染头图；步骤图 `error` → 出现提示且**未调用** `onToggleDone`；`src` 变化后失败状态重置 |
| 回归风险 | 卡片布局与 44px 点击区（现有组件测试）；列表搜索/筛选/排序；详情计时与完成状态（`step-list.test.tsx` 既有用例必须全绿）；前端静态资源缓存头（`/assets/*` immutable、`index.html` no-cache） |

**验收纪律**：所有测试素材放**临时目录**（`mkdtemp`），**不往真实 `data/` 写测试图片**。

## 8. 风险、回滚与依赖

- **风险 1（性能口径）**：首版是"原图 + 懒加载"，不是压缩缩略图；滚动看完现有图片累计约 56 MiB。若真机卡顿，正确做法是另立规格做缩略图（新依赖或派生文件），**不是**在本规格里偷偷加依赖。
- **风险 2（暴露面，T2）**：新增无鉴权的 `/images/*` 读路径。边界由 [ADR-0004](../decisions/ADR-0004-image-static-hosting.md) 固定：白名单文件名、无目录列表、缺失 404、不监听新端口、不改容器配置。
- **风险 3（路由冲突）**：第二次注册 `@fastify/static` 忘记 `decorateReply: false` → 启动即报错；图片缺失若回落 SPA → 浏览器把 HTML 当图片缓存。两者都由 §7 的路由测试锁住。
- **风险 4（做菜场景）**：详情页大图把食材/步骤挤下去，或步骤图让页面变长、翻找变慢 → 限高 38vh + 步骤图只出现在有图的步骤；真机/试做反馈若说"图碍事"，改小或让用户可关（改动需回填本规格）。
- **风险 5（已知限制）**：失效的符号链接不会被启动扫描发现（只看目录项类型，不做 `stat`），由客户端兜底降级成无图。
- **回滚**：删掉图片路由与扫描即可回到现状（`data/` 不动，JSON 不动，既有 179 张图留着不用也不影响）；前端回落行为本来就是"没有 `coverImage` 就不显示"。
- **依赖**：无新依赖（复用已有的 `@fastify/static`）；需要真实图片素材在 `data/images/`（已有 179 张）；步骤图验收需要一张临时素材。

## 9. 实施拆解与顺序

1. **类型 + 纯函数**：`RecipeMedia` / `RecipeDetail`（`shared/types.ts`）、`lib/image-media.ts`（文件名 → 槽位、越界判定、对齐 `stepImages`）+ 单测。无 IO，可独立验证。
2. **服务端扫描 + API**：`recipe-repository.ts` 启动扫描（临时目录测试）、`toSummary` 带出 `coverImage`、详情带出 `coverImage`/`stepImages`。
3. **图片路由 + 404 修正**：`routes/images.ts`（白名单、缓存头、`decorateReply: false`）、`index.ts` 对 `/images/*` 显式 404 + 路由测试（含安全用例与 304）。
4. **前端**：`RecipeCover` 组件（卡片/头图共用，失败降级）、`RecipeCard`、`RecipePage`、`StepCard`/`StepList` 步骤图 + CSS（固定比例、限高）。
5. **文档回填**：`DATA_MODEL §4`（去掉"第二阶段"，补派生字段与不支持的格式）、`ARCHITECTURE`（路由表与文件系统访问清单）、`README`（接口表）、`ROADMAP`/`START-HERE`（M4 状态）、`DEPLOYMENT`（图片同步到服务器 + 排障行）。
6. **本机验收**：`npm run build && npm start` 用真实素材看列表/详情/路由/缓存头；真机与试做反馈单独记录（试做卡点记入 [CB-001 反馈表](CB-001-cooking-feedback.md)）。

## 10. 文档影响与实施前复核

- [x] 已阅读 [START-HERE](../START-HERE.md) 与 [AGENTS](../../AGENTS.md)（变更等级、门槛）。
- [x] 已阅读：[ARCHITECTURE](../ARCHITECTURE.md)、[DATA_MODEL](../DATA_MODEL.md)、[REQUIREMENTS](../REQUIREMENTS.md) F7/F8、[ROADMAP](../ROADMAP.md) M4、[ADR-0002](../decisions/ADR-0002-json-files-as-source-of-truth.md)、[ADR-0003](../decisions/ADR-0003-write-operations-user-state.md)、[CB-003](CB-003-howtocook-import.md)（图片落盘口径）、[CB-005](CB-005-likes-favorites.md)（缓存与写操作先例）。
- [x] 与现有文档无冲突；两处**过时编号**已在本规格登记时修正（ROADMAP 写"开工前先立 `CB-004`"、START-HERE 写"规格编号 `CB-003`"，实际都已被占用）。
- [x] 每条事实的权威位置：目录约定在 [DATA_MODEL §4](../DATA_MODEL.md)；暴露面/缓存/托管方式在 [ADR-0004](../decisions/ADR-0004-image-static-hosting.md)；交互与验收在本规格；里程碑状态在 [ROADMAP](../ROADMAP.md)。
- [x] 本规格已达到 `accepted`（2026-09-20 用户批准首版口径）。
- [x] 实现完成后要同步更新的文档已全部更新：`DATA_MODEL.md`、`ARCHITECTURE.md`、`README.md`、`ROADMAP.md`、`START-HERE.md`、`DEPLOYMENT.md`、`features/README.md`、`decisions/README.md`（+ `ADR-0004` 回填边界实测）。

## 11. 实现与验证证据（实现后填写）

| 项目 | 证据 |
| --- | --- |
| 实现路径 | `src/shared/types.ts`（`RecipeMedia`/`RecipeDetail`）；`src/server/lib/image-media.ts`（新：文件名→槽位、对齐 `stepImages`）；`src/server/services/recipe-repository.ts`（`scanRecipeImages` + `media/detail/admittedImages`）；`src/server/services/search.ts`（`toSummary` 带 `coverImage`）；`src/server/routes/images.ts`（新：白名单 + `no-cache` + `decorateReply:false`）；`src/server/routes/recipes.ts`（详情返回 `RecipeDetail`）；`src/server/index.ts`（注册图片路由、`/images/*` 真 404、启动扫描日志）；`src/client/components/RecipeCover.tsx`（新）、`RecipeCard.tsx`、`StepCard.tsx`、`StepList.tsx`、`pages/RecipePage.tsx`、`lib/api.ts`、`styles/global.css` |
| 静态检查 | `npm run typecheck` → exit 0（三套 tsconfig） |
| 自动化测试 | `npm test` → **223 passed**（190 → 223；新增 `image-media` 10、`images-route` 12、`cover-image` 6、repository 扫描 5）；含真实 JPEG 字节、304、404 非 HTML、穿越不泄漏、SPA 共存、封面/步骤图失败降级 |
| 数据校验 | `npm run check:data` → 371 通过 / 0 失败（10 道仅有内容警告，与本次无关） |
| 生产构建 | `npm run build` → exit 0；`npm start` 实测：日志 `图片扫描完成：179/371 道菜有封面，0 张步骤图` |
| 真实运行（本机） | 手机视口 390×844 与桌面 1280×800，浏览器 Headless Chrome 153：179 个 `<img>` / 0 破图 / 懒加载 18→22→37；详情头图 201px、菜名与食材首屏可见；图片 200 + `no-cache` + ETag → 条件请求 304（浏览器实测 15 次）；白名单外与穿越请求均不返回数据目录内容。逐条记录与截图：[verification/CB-007/CHECK.md](../verification/CB-007/CHECK.md) |
| **真机** | **未做**（iPhone Safari / Android Chrome 的懒加载与滚动流畅度待确认）；做菜场景的图片干扰需试做反馈 |
| 已知限制或未验证假设 | 首版无缩略图（全量滚动约 56 MiB，待真机判定）；真实数据无步骤图，步骤图用临时 fixture 验证；失效符号链接不在启动扫描时检测（前端兜底成占位）；当前服务器部署见 [DEPLOYMENT](../DEPLOYMENT.md)，真机性能仍待确认 |

## 12. 复核记录

| 日期 | 变更 | 阅读和复核的文档 | 结论 |
| --- | --- | --- | --- |
| 2026-09-20 | 建立规格（图片展示：封面/头图/步骤图，服务端扫描 + `/images/*` 白名单托管；明确不做缩略图与上传） | START-HERE、AGENTS、ARCHITECTURE、DATA_MODEL、REQUIREMENTS、ROADMAP、ADR-0002/0003、CB-003/005、ADR-0004（同批新立） | `draft`（待批准） |
| 2026-09-20 | 用户批准首版取舍（原图 + 懒加载；不做压缩缩略图/上传/部署） | 本规格 §1、ADR-0004 | `accepted`（开始实现） |
| 2026-09-20 | 实现完成（类型/扫描/路由/前端）+ 本机验收（手机视口、桌面、生产模式、临时 fixture 步骤图）；文档回填 | ARCHITECTURE、DATA_MODEL、README、DEPLOYMENT、ROADMAP、START-HERE、ADR-0004、[CHECK.md](../verification/CB-007/CHECK.md) | `implemented`（**真机待做**，不得称 `verified`） |
