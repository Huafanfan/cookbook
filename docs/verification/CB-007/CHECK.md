# CB-007 图片展示 · 验收记录

日期：2026-09-20 ｜ 规格：[`../../features/CB-007-images.md`](../../features/CB-007-images.md) ｜ ADR：[`ADR-0004`](../../decisions/ADR-0004-image-static-hosted.md)

环境：

| 项 | 值 |
| --- | --- |
| 机器 | Mac mini（macOS 27.0，`zhangyifan`） |
| 服务 | **生产模式**：`npm run build && npm start`（`http://127.0.0.1:3000`），`COOKBOOK_DATA_DIR=data/` |
| 数据 | 真实数据：371 道菜、**179 张封面**、0 张步骤图（`data/images/` 56 MiB） |
| 浏览器 | Playwright CLI 自带 Headless Chrome 153（桌面内核），视口 **390×844**（手机）与 **1280×800**（桌面），`zh-CN`、DPR 1 |
| 步骤图素材 | 真实 `data/` 里没有步骤图 → 用**临时数据目录** `/tmp/cb007-fixture/`（不往真实 `data/` 写测试素材） |

> 这份记录只对「本机 + 桌面内核」负责。**真机（iPhone Safari / Android Chrome）与厨房场景验收仍未做**，见文末。

## 1. 逐条验收（对应规格 §6）

| # | 验收项 | 怎么验的 | 结果 |
| --- | --- | --- | --- |
| 1 | 列表：有图显示照片、无图显示首字色块、无破图、不横向滚动、点击区不变 | 手机视口打开首页，读 DOM 与几何 | ✅ 371 张卡片 / 179 个 `<img>` / 视口内 18 张已加载 / **0 张失败** / 371 个首字占位 / `scrollWidth == innerWidth`（无横向滚动）/ 卡片按钮最小高 **161px**（≥44px） |
| 2 | 列表性能：懒加载生效、图片区域不跳动 | 滚动前后统计已加载张数 | ✅ 18（首屏）→ 22（滚到 6000px）→ 37（滚到 12000px），失败始终 0；图片区域尺寸由 CSS 固定（卡片 56×56、步骤 4:3、头图 16:9），失败时盒子高度不变（步骤图实测 246px 不变） |
| 3 | 详情（有图）：限高、不遮挡食材/步骤、点击区不变 | 手机视口打开 `/recipe/lao-shi-guo-bao-rou` | ✅ 头图高 **201px**（≤ `min(38vh,320px)`=320px）；菜名 `top=281`、首个食材 `top=673 < 844` → **首屏同时看得到菜名与食材开头**；无横向滚动 |
| 4 | 详情（无图）：不出现空白大块 | 打开 `/recipe/ao-er-liang-feng-wei-kao-ji-tui`（无封面） | ✅ 头图节点不存在（`heroExists=false`），页面无封面 `<img>` |
| 5 | 步骤图：显示在完成按钮之外、点图不改完成状态、失败不影响计时/完成 | 临时 fixture（`ke-le-ji-chi` + `step-1.jpg`、`step-3.jpg`） | ✅ 2 张步骤图都渲染（滚动到即加载）；`img.closest('.step-main') === null`；**真实点击图片**后 `aria-pressed` 不变（对照：点 `.step-main` 会从 true→false）；图失败时显示「第 1 步的配图加载失败」，计时入口（`⏱ 10 分钟`）仍在，`aria-pressed` 不变 |
| 6 | 加图即生效：放文件 + 重启，不用改 JSON | 往 fixture 扔 `step-3.jpg` → 重启 → 看 API 与日志 | ✅ 日志「1/1 道菜有封面，**2 张步骤图**」；`stepImages = [step-1, null, step-3, null, null]`（第 2 步缺图是 null，说明**允许跳号**）；菜谱 JSON 一个字节没改 |
| 7 | 缓存：200 + ETag，条件请求 304，HEAD 无体 | `curl` 对真实图片（1 035 603 B 的那张） | ✅ `200 image/jpeg` + `cache-control: no-cache` + `etag: W/"fcd53-1a0bdaef9b7"`；带 `If-None-Match` → **304**；`HEAD` → 200 且无响应体；`cmp` 落盘文件与磁盘原文件**字节一致**。浏览器实测也出现 **15 次 304**（重验证生效） |
| 8 | 路由边界：缺失 → 404 且不是 HTML；穿越/隐藏文件/非白名单/越界步骤号不可访问 | `curl` + `app.inject`（单测） | ✅ 缺失 → `404 application/json` + `cache-control: no-store`（**不是** HTML）；磁盘上真实存在但未认下的 `cover.png`、`notes.md`、`.DS_Store`、`step-9.jpg`、无对应菜谱的目录 → 全部 404；`cover.JPG`（大小写）→ 403（macOS 大小写不敏感）；编码穿越 `%2e%2e` → **403**、字面 `..` → 被客户端规范化后落到 SPA 页面（**均不返回文件内容**，见第 2 节） |
| 9 | SPA 共存：`/recipe/*` 200 HTML、`/assets/*` immutable、图片路由不被抢走 | 生产模式 `curl` | ✅ `/recipe/<id>` 与 `/` → `200 text/html` + `no-cache`；`/assets/index-*.js` → `cache-control: public, max-age=31536000, immutable`；`/images/<id>/cover.jpg` → `200 image/jpeg` |
| 10 | 坏数据不影响启动：目录名对不上/文件名不认识/步骤号越界 | 单测（临时目录）+ 真实运行日志 | ✅ 三种情况都只产生 `warn`，服务照常启动（`npm test` 覆盖），真实运行日志无 `图片检查` 告警（现有 179 张全部符合约定） |
| 11 | 门禁 | 命令 | ✅ `npm run typecheck` exit 0；`npm test` **223 passed**；`npm run check:data` 371 通过 / 0 失败（10 道仅警告，与本次无关）；`npm run build` exit 0 |
| 12 | 桌面端不回归 | 1280×800 打开首页 | ✅ 每行 **3 列**、18 张已加载、0 失败、无横向滚动、封面盒子仍是 56×56 |

## 2. 安全边界实测（ADR-0004 §2 承诺的「用测试固定事实」）

服务器端 `curl`（生产模式，真实 `data/`）结果：

| 请求 | 状态 | 返回内容 |
| --- | --- | --- |
| `/images/lao-shi-guo-bao-rou/cover.jpg` | 200 | `image/jpeg`（1 035 603 B，与磁盘一致） |
| `/images/lao-shi-guo-bao-rou/nope.jpg` | 404 | `{"error":"image_not_found"}` + `no-store` |
| `/images/lao-shi-guo-bao-rou/step-99.jpg` | 404 | 同上（越界步骤号不在白名单） |
| `/images/lao-shi-guo-bao-rou/notes.md` | 404 | 同上 |
| `/images/.gitkeep` | 404 | 同上 |
| `/images`、`/images/`、`/images/<id>/` | 404 | 同上（**不给目录列表**） |
| `/images/nosuch-recipe/cover.jpg` | 404 | 同上（没有对应菜谱的目录） |
| `/images/%2e%2e/equipment.json` | 403 | `Forbidden`（`@fastify/static` 拒绝非规范路径） |
| `/images/../equipment.json` | 200 HTML | 客户端先把 `..` 规范化成 `/equipment.json` → 落到 SPA 兜底；**body 里没有 equipment.json 的内容** |
| `/images/../recipes/lao-shi-guo-bao-rou.json` | 200 HTML | 同上，**没有菜谱 JSON 内容** |

结论：**没有任何一条请求返回 `data/` 里的文件内容**。`allowedPath` 用的是启动扫描产出的**白名单集合**（扫描认下的文件才在集合里），所以"API 不给的地址，路由也不提供"这条性质是被构造出来的，不依赖"目录里只会有图片"的假设。

符号链接：扫描把符号链接当图片收下（`isSymbolicLink()`），因此指向图片的链接**会被提供**。能创建该链接的人已经拥有 `data/images/` 的写权限（等同于可以直接投放文件），故接受；行为由 `test/recipe-repository.test.ts`（「图片是符号链接时也认」）与集成测试固定。

## 3. 自动化测试（`npm test`）

新增 33 个用例（190 → **223**），分布：

| 文件 | 覆盖 |
| --- | --- |
| `test/image-media.test.ts`（10） | 文件名 → 槽位；白名单外名字不认（`cover.png`/`IMG_*.jpg`/`step-0.jpg`/大小写）；同槽位多候选确定性；`stepImages` 与步骤等长对齐；越界步骤号不生成 URL；警告文本可定位 |
| `test/recipe-repository.test.ts`（+5） | 扫描匹配、目录不存在（`missing`）、目录名无对应菜谱 / 文件名不认识 / 步骤越界都只告警、顶层隐藏文件忽略、符号链接 |
| `test/images-route.test.ts`（12，集成：`createApp` + `app.inject` + 临时目录） | 列表/详情的图片字段；**真实 JPEG 字节**；`no-cache`+ETag+304；HEAD；缺失 404 非 HTML + `no-store`；目录列表不给；白名单外文件 404；目录穿越不泄漏（含标记文件 `MARKER-EQUIPMENT`）；没有 `images/` 目录时不崩；SPA 兜底与 `/assets/*` 缓存不回归 |
| `test/cover-image.test.tsx`（6，jsdom） | 卡片有图/无图/失败回落、`loading=lazy`、换 `src` 重置失败；头图无图不渲染、失败提示；步骤图在完成按钮之外（点图不触发 `onToggleDone`）、失败时提示且计时/完成不受影响 |

回归：`step-list.test.tsx`、`kitchen-ui.test.tsx`、`serving-scale.test.tsx` 等既有组件测试全绿；`search.test.ts` 的 `toSummary` 断言按新参数扩展后仍通过。

## 4. 截图

| 文件 | 内容 |
| --- | --- |
| `list-mobile.png` | 390×844 首页：前几张卡片显示照片，其余显示首字色块 |
| `list-scrolled-mobile.png` | 滚动后：新进入视口的图片按需加载，仍无破图 |
| `detail-mobile.png` | 详情页：限高头图 + 菜名/食材仍在首屏 |
| `step-image-mobile.png` | 临时 fixture：第 1 步配图（328×246，4:3） |
| `step-images-two-mobile.png` | 同上，`step-1.jpg` 与 `step-3.jpg` 都渲染（**允许跳号**） |
| `step-image-failed.png` | 拦截步骤图返回 404 后的表现：区域内提示、盒子高度不变、计时入口仍在 |
| `cover-fallback-mobile.png` | 拦截封面返回 404 后的表现：卡片退回首字色块（整页 0 张破图） |
| `desktop-list.png` | 1280×800：每行 3 列，封面尺寸不变 |

## 5. 未验证 / 待做

| 项 | 现状 |
| --- | --- |
| **真机**（iPhone Safari / Android Chrome） | 未做。桌面 Chromium 与手机视口通过，但真机的懒加载阈值、内存、滚动流畅度需真机确认 |
| **滚动看完 179 张的整体流量** | 未测（口径已知：约 56 MiB）。真机若卡 → 另立规格做缩略图（属 T1） |
| **厨房场景**（做菜时图片是否碍事） | 未做。试做时留意"头图是否把步骤挤太远""步骤图会不会让翻找变慢"，记入 [`CB-001 试做反馈`](../../features/CB-001-cooking-feedback.md) |
| 失效的符号链接 | 启动扫描不检测（只看目录项类型），由前端降级成占位图；未专门实测 |
| 服务器部署 | 未做（T3，需授权）。`DEPLOYMENT.md` 已补图片同步与排障条目 |
