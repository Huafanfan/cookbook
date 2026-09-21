# CB-007 图片展示 · 验收记录

日期：2026-09-20（2026-09-21 按复核意见修订：补真实 HTTP 证据、删掉夸大表述）

规格：[`../../features/CB-007-images.md`](../../features/CB-007-images.md) ｜ ADR：[`../../decisions/ADR-0004-image-static-hosting.md`](../../decisions/ADR-0004-image-static-hosting.md)

环境：

| 项 | 值 |
| --- | --- |
| 机器 | Mac mini（macOS 27.0） |
| 服务 | **生产模式**：`npm run build && npm start`（`http://127.0.0.1:3000`），`COOKBOOK_DATA_DIR=data/` |
| 数据 | 真实数据：371 道菜、**179 张封面**、0 张步骤图（`data/images/` 约 56 MiB） |
| 浏览器 | Playwright 自带 Headless Chrome 153（桌面内核），视口 **390×844**（手机）与 **1280×800**（桌面），`zh-CN`、DPR 1 |
| 隔离实例（2026-09-21 补充证据） | 临时数据目录（`mktemp -d`）+ 临时端口；**不碰真实 `data/`** |
| 步骤图素材 | 真实 `data/` 里没有步骤图 → 用**临时数据目录**（`/tmp/cb007-fixture`，已删除） |

> **本记录只对「本机 + 桌面内核」负责。真机（iPhone Safari / Android Chrome）与厨房场景验收仍未做**，见 §5。

## 1. 逐条验收（对应规格 §6）

| # | 验收项 | 怎么验的 | 结果 |
| --- | --- | --- | --- |
| 1 | 列表：有图显示照片、无图显示首字色块、无破图、不横向滚动、点击区不变 | 手机视口打开首页，读 DOM 与几何 | ✅ 371 张卡片 / 179 个 `<img>` / 视口内 18 张已加载 / **0 张失败** / 371 个首字占位 / `scrollWidth == innerWidth` / 卡片按钮最小高 **161px** |
| 2 | 列表性能：懒加载生效、图片区域尺寸固定 | 滚动前后统计；比较图片区域盒子尺寸 | ✅ 已加载 18 → 22 → 37（随滚动增长）；失败始终 0；**图片区域盒子尺寸固定**（步骤图失败前后都是 246px）。⚠️ **未测 CLS** —— 这里只证明"盒子尺寸不变"，不是布局偏移指标 |
| 3 | 详情（有图）：限高、不遮挡食材/步骤 | 手机视口打开 `/recipe/lao-shi-guo-bao-rou` | ✅ 头图高 **201px**（≤ `min(38vh,320px)`=320px）；菜名 `top=281`、首个食材 `top=673 < 844` → 首屏同时可见菜名与食材开头 |
| 4 | 详情（无图）：不出现空白大块 | 打开无封面的菜 | ✅ 头图节点不存在 |
| 5 | **加图即生效（封面）**：放 `cover.jpg` → 重启 → 列表与详情都显示 | **隔离实例**：无封面的菜 → 重启后 `coverImage=null`、直接求图 404 → 放 `cover.jpg` → 重启 → 详情与列表都带出 `/images/wu-tu-pian/cover.jpg`、求图 200 | ✅ 不需要改 JSON、不需要重建镜像 |
| 6 | 步骤图：显示在完成按钮之外、点图不改完成状态、失败不影响计时/完成 | 临时 fixture（`step-1.jpg`、`step-3.jpg`） | ✅ 两张都渲染（允许跳号）；`img.closest('.step-main') === null`；**真实点击图片**后 `aria-pressed` 不变（对照：点按钮会从 true→false）；图失败时提示出现、计时入口仍在、`aria-pressed` 不变 |
| 7 | 缓存：200 + ETag，条件请求 304，HEAD 无体 | `curl` 对真实图片（1 035 603 B） | ✅ `200 image/jpeg` + `cache-control: no-cache` + `etag`；`If-None-Match` → **304**；`HEAD` → 200 无体；`cmp` 与磁盘原文件**字节一致**。浏览器实测出现 **15 次 304** |
| 8 | 路由边界 | `curl`（含 `--path-as-is`）+ 集成测试 | ✅ 见 §2 |
| 9 | SPA 共存 | 生产模式 `curl` | ✅ `/recipe/<id>` 与 `/` → 200 HTML + `no-cache`；`/assets/*` → `immutable`；图片路由未被抢走 |
| 10 | 坏数据不影响启动 | 单测（临时目录）+ 真实运行日志 | ✅ 目录名对不上 / 文件名不认识 / 步骤号越界都只 `warn`，服务照常启动 |
| 11 | 门禁 | 命令（**记真实退出码，不用管道**） | ✅ `npm run typecheck` = 0；`npm test` = 0（CB-007 落地时 223 passed，2026-09-21 修复后 256 passed）；`npm run check:data` = 0（371 通过 / 0 失败）；`npm run build` = 0 |
| 12 | 桌面端不回归 | 1280×800 打开首页 | ✅ 每行 3 列、18 张已加载、0 失败、无横向滚动、封面盒子 56×56 |

## 2. 安全边界实测

### 2.1 白名单与缺失（生产模式，真实 `data/`）

| 请求 | 状态 | 返回内容 |
| --- | --- | --- |
| `/images/lao-shi-guo-bao-rou/cover.jpg` | 200 | `image/jpeg`（1 035 603 B，与磁盘一致） |
| `/images/lao-shi-guo-bao-rou/nope.jpg` | 404 | `{"error":"image_not_found"}` + `no-store` |
| `/images/lao-shi-guo-bao-rou/step-99.jpg` | 404 | 同上（越界步骤号不在白名单） |
| `/images/lao-shi-guo-bao-rou/notes.md` | 404 | 同上 |
| `/images/.gitkeep` | 404 | 同上 |
| `/images`、`/images/`、`/images/<id>/` | 404 | 同上（**不给目录列表**） |
| `/images/nosuch-recipe/cover.jpg` | 404 | 同上（没有对应菜谱的目录） |
| `/images/lao-shi-guo-bao-rou/cover.JPG`（大小写变体） | 403 | 本机 macOS（大小写不敏感文件系统）实测；**Linux 未实测**，状态码取决于文件系统行为，但两种都不是 200 |

### 2.2 目录穿越：用**不规范化路径的客户端**再测一次（2026-09-21 补充）

之前的实测用了 `curl` 默认行为，字面 `..` 会被客户端先规范化，因此只能证明"规范化之后没有泄漏"，
**不能**证明服务器拒绝原始路径。隔离实例上用 `curl --path-as-is`（原样发送）重测：

| 原始请求（`--path-as-is`） | 状态 | 返回内容 |
| --- | --- | --- |
| `/images/../equipment.json` | **403** | `Forbidden`（60 B），无文件内容 |
| `/images/ke-le-ji-chi/../../recipes/ke-le-ji-chi.json` | **403** | 同上 |
| `/images/%2e%2e/equipment.json` | **403** | 同上 |

结论：**服务器自身（而不是客户端规范化）拒绝这些路径**。

### 2.3 符号链接：白名单是**路径级**约束，不是 realpath 边界（2026-09-21 补充）

隔离实例里把 `data/images/ke-le-ji-chi/step-1.jpg` 做成指向目录外文件（`/tmp/cb008-outside.jpg`）的符号链接，
然后走 HTTP 取图：

```text
GET /images/ke-le-ji-chi/step-1.jpg  →  200 image/jpeg，内容 = 目录外那个文件的字节
```

所以：**`allowedPath` 白名单比"名字正则"更严（API 不给的地址路由也不给），但它不是 realpath 校验** ——
`data/images/` 里指向外部的符号链接会被提供出去。这是 [ADR-0004 §后果](../../decisions/ADR-0004-image-static-hosting.md) 已接受的风险
（能创建该链接的人已经拥有该目录写权限，等同于可以直接投放文件），**不是"绝不暴露目录外内容"**。

## 3. 自动化测试（CB-007 相关）

`npm test` 全绿。CB-007 新增 **33** 个用例（190 → 223）：

| 文件 | 用例数 | 覆盖 |
| --- | --- | --- |
| `test/image-media.test.ts` | **7** | 文件名 → 槽位；白名单外名字不认；同槽位多候选确定性；`stepImages` 与步骤等长对齐；越界步骤号不生成 URL；警告文本可定位 |
| `test/images-route.test.ts` | **12** | 列表/详情的图片字段；真实 JPEG 字节；`no-cache`+ETag+304；HEAD；缺失 404 非 HTML + `no-store`；目录列表不给；白名单外文件 404；目录穿越不泄漏；没有 `images/` 目录时不崩；SPA 兜底与 `/assets/*` 缓存不回归 |
| `test/cover-image.test.tsx` | **9** | 卡片有图/无图/失败回落、`loading=lazy`、换 `src` 重置失败；头图无图不渲染、失败提示；步骤图在完成按钮之外、点图不触发 `onToggleDone`、失败时计时/完成不受影响 |
| `test/recipe-repository.test.ts`（新增部分） | **5** | 扫描匹配、目录不存在（`missing`）、目录名无对应菜谱 / 文件名不认识 / 步骤越界都只告警、顶层隐藏文件忽略、符号链接 |

回归：`step-list.test.tsx`、`kitchen-ui.test.tsx`、`serving-scale.test.tsx` 等既有组件测试全绿。

## 4. 截图

| 文件 | 内容 |
| --- | --- |
| `list-mobile.png` | 390×844 首页：有图卡片显示照片，无图显示首字色块 |
| `list-scrolled-mobile.png` | 滚动后：新进入视口的图片按需加载，无破图 |
| `detail-mobile.png` | 详情页：限高头图 + 菜名/食材仍在首屏 |
| `step-image-mobile.png` | 临时 fixture：第 1 步配图（328×246，4:3） |
| `step-images-two-mobile.png` | 同上，`step-1.jpg` 与 `step-3.jpg` 都渲染（允许跳号） |
| `step-image-failed.png` | 拦截步骤图 404：区域内提示、盒子高度不变、计时入口仍在 |
| `cover-fallback-mobile.png` | 拦截封面 404：卡片退回首字色块（整页 0 张破图） |
| `desktop-list.png` | 1280×800：每行 3 列，封面尺寸不变 |

## 5. 未验证 / 待做

| 项 | 现状 |
| --- | --- |
| **真机**（iPhone Safari / Android Chrome） | **未做**。本机桌面内核 + 手机视口**不能替代**真机的懒加载阈值、内存与滚动流畅度 |
| **厨房场景**（做菜时图片是否碍事） | **未做**。试做时留意"头图是否把步骤挤太远""步骤图会不会让翻找变慢"，记入 [`CB-001 试做反馈`](../../features/CB-001-cooking-feedback.md) |
| 滚动看完 179 张的整体流量 | 未测（口径已知：约 56 MiB，非缩略图）。真机若卡 → 另立规格做缩略图 |
| 失效的符号链接 | 启动扫描不检测（只看目录项类型），由前端降级成占位图；未专门实测 |
| 服务器部署 | 未做（T3，需授权）。`DEPLOYMENT.md` 已补图片同步与排障条目 |
