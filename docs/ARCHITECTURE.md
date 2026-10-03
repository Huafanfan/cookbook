# 技术方案

状态：**已实现**（M0–M3 + CB-001/CB-002 均按本文件的技术选型落地）
日期：2026-09-19（2026-10-01 增补 CB-014 创意工坊）

## 1. 结论先行

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 前端 | **React 19 + Vite + TypeScript** | 与你现有项目（`pt-media-assistant`）完全一致，零学习成本 |
| 后端 | **Fastify + TypeScript**（Node） | 同上；轻、快、插件齐全 |
| 数据 | **JSON 文件**（`data/recipes/*.json`），服务启动时载入内存 | 无数据库、无迁移、可手改、可 Git 版本化、可整体备份 |
| 搜索 | 内存索引 + 简单匹配（后续可换 Fuse.js 支持模糊/拼音） | 千条数据量下 O(n) 足够，不引入依赖 |
| 样式 | 原生 CSS（含 CSS 变量 + media query） | 页面少，不引入 UI 框架；避免构建与升级负担 |
| 部署 | **Docker（linux/amd64）+ docker compose**，绑定 `192.168.1.2:18081` | 与 iStoreOS 服务器现有部署方式一致 |
| 图片 | 静态文件放 `data/images/`，由后端 `@fastify/static` 提供（**已实现**，CB-007：文件名白名单 + `no-cache`，见 [ADR-0004](decisions/ADR-0004-image-static-hosting.md)） | 图片不进镜像、不进 Git，可单独备份 |

一个 Node 服务提供前端静态页、后端 API 与图片托管。创意工坊的公开来源提取和用户指定的 DS 整理按需出站；每日菜单按 [ADR-0010](decisions/ADR-0010-daily-menu.md) 每个北京日期最多一次DS请求。本地浏览、做菜与手动录入独立于这些请求，工坊边界见 [ADR-0009](decisions/ADR-0009-recipe-workshop.md)。

## 2. 数据源：JSON 文件而非数据库

一道菜一个 JSON 文件（`data/recipes/<id>.json`）是唯一数据源；服务启动时载入内存建索引；只有 `recipe-repository.ts` 碰文件系统。
决策理由、备选方案与后果见 [ADR-0002：菜谱数据以 JSON 文件为唯一数据源](decisions/ADR-0002-json-files-as-source-of-truth.md)。

**留后路**：将来真要换 SQLite，只改 repository 这一个文件，路由与前端不动。

## 3. 系统结构

```text
┌───────────────────────── 手机 / 电脑浏览器（局域网） ─────────────────────────┐
│  首页：菜品网格 + 搜索框 + 分类/标签筛选                                       │
│  详情页：食材清单 → 编号步骤（可打勾）→ 小贴士                                  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTP (JSON API)
┌───────────────────────────────────▼──────────────────────────────────────────┐
│  cookbook 容器 (Node, Fastify)  @ 192.168.1.2:<端口>                          │
│                                                                              │
│   GET /api/recipes          列表（支持 q / category / tag 查询参数）           │
│   GET /api/recipes/:id      详情（含 `revision`）                            │
│   PUT /api/recipes/:id      保存（整份替换，版本守卫 409）见 CB-009            │
│   GET /api/recipes/:id/history[/:historyId]   修改记录                    │
│   GET /api/meta             分类、标签、统计（供筛选器渲染）                    │
│   GET /images/*             菜品图片（白名单：cover.jpg / step-N.jpg）        │
│   GET /*                    前端构建产物（SPA，index.html 兜底）                │
│                                                                              │
│   启动时：读取 /data/recipes/*.json → 校验 → 建内存索引                        │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ bind mount
                    /srv/data/cookbook/{recipes,images}   ← 唯一的持久化数据
```

关键设计点：

- **数据在容器外**：`data/` 通过 bind mount 挂进容器，容器本身可以随时删除重建，数据不受影响。
- **改数据不用重建镜像**：新增菜谱只需放文件 + `docker compose restart`（甚至支持热重载）。
- **单容器**：不需要 nginx，Fastify 直接托管前端静态资源，少一个部件少一处故障。

## 4. 目录与代码职责

```text
src/
├── client/                    # 前端（Vite 构建，产物 dist/client）
│   ├── pages/                 #   HomePage（列表+搜索+筛选）、RecipePage（详情）
│   ├── components/            #   RecipeCard / SearchBar / FilterBar / IngredientList / StepList
│   ├── lib/                   #   api.ts、router.tsx、format.ts、highlight.tsx、storage.ts
│   └── styles/global.css      #   全局样式（手机优先 + 固定明亮主题）
├── server/                    # 后端（tsc 构建，产物 dist/server）
│   ├── main.ts                #   进程入口（唯一的非纯函数入口）
│   ├── index.ts               #   组装应用：路由 + 静态托管 + SPA 兜底 + 优雅退出
│   ├── routes/recipes.ts      #   /api/recipes、/api/recipes/:id、/api/meta、/api/health
│   ├── routes/images.ts       #   /images/*（白名单 + no-cache，见 ADR-0004）
│   ├── services/
│   │   ├── recipe-repository.ts  # 唯一的数据访问入口（读菜谱、扫描图片、建索引）
│   │   └── search.ts             # 搜索、筛选与排序
│   └── lib/
│       ├── config.ts          #   端口与数据目录（环境变量）
│       ├── image-media.ts     #   图片文件名 → 槽位的纯函数（CB-007）
│       └── schema.ts          #   zod 运行时校验
└── shared/types.ts            # 前后端共享的类型定义
```

规则：

1. 前端**不直接读文件**，全部经 API。
2. 文件系统访问只有 4 处，且各有明确职责：`server/services/recipe-repository.ts`（读菜谱 + **扫描图片目录**）、
   `server/lib/equipment.ts`（读厨具词表）、`server/lib/config.ts`（探测构建产物目录）、`server/index.ts`（读 index.html 做 SPA 兜底）。
   外加第 5 处：`server/services/user-state-store.ts`（用户状态的读写，见 ADR-0003）。
   **不得新增第 6 处**；菜谱数据读取一律经 repository。
   正式图片由 `@fastify/static` 按白名单提供；工坊原始素材按草稿记录定位，通过 repository 读取字节，不开放目录静态托管。
2b. **写操作只有两处**：`user-state-store` 写 `data/user-state.json`（点赞/收藏/厨具；原子替换 + 串行队列）；
   `recipe-repository` 写**菜谱内容**、`data/history/recipes/`，以及 CB-014 草稿、来源资产和人工采用的新菜图片、CB-015独立菜单缓存。写入协议分别见关联 ADR。
   菜谱写入前必须过 zod + 内容检查，并用文件字节的 `revision` 做版本守卫（不一致 → 409）。
3. **类型**的唯一来源是 `src/shared/types.ts`，**运行时校验**的唯一来源是 `src/server/lib/schema.ts`（zod）。两边字段必须同步，改一处就要改另一处。

## 4b. 创意工坊模块（CB-014）

| 模块 | 职责 |
| --- | --- |
| `client/pages/WorkshopPage.tsx`、`components/WorkshopRecipeForm.tsx` | 草稿列表、混合材料、手机视图切换、自动保存、版本冲突、候选校对和明确提交 |
| `server/routes/workshop.ts` | 同源写守卫、专用来源上传上限、草稿/任务/素材/提交 API；契约见 [DATA_MODEL §9](DATA_MODEL.md#9-创意工坊草稿与新建cb-014) |
| `server/services/workshop-service.ts` | 有界任务队列、材料提取、确定性导入或 DS、内容指纹缓存与过期结果隔离 |
| `server/lib/source-extractor.ts` | 公开 URL 校验、逐跳 DNS 固定、受限抓取、JSON-LD/Markdown/正文提取；不执行页面脚本 |
| `server/lib/workshop-image.ts` | 内存解码、格式/像素预算、旋转和规范化；串行处理、禁用 sharp 缓存 |
| `server/lib/workshop-llm.ts` | 服务端 DS 请求、取消/重试预算、结果归一化、schema/词表/引用与数字核对，不读写文件 |
| `server/services/recipe-repository.ts` | 集中资产 I/O、草稿 revision、来源字节、排他新建、持久化意图与回执恢复 |

草稿不是正式 Recipe，最后经完整校验和用户确认创建一个新 JSON 文件。新建结果即时进入既有索引；所有已有菜谱与编辑协议保持兼容。选型、出站和故障协议的权威说明见 [ADR-0009](decisions/ADR-0009-recipe-workshop.md)，部署环境与备份见 DEPLOYMENT。

## 4c. 每日菜单模块（CB-015）

| 模块 | 职责 |
| --- | --- |
| `client/pages/HomePage.tsx`、`components/RecipeCard.tsx` | 厨具图标、完整三菜、只读获取与更新中短暂轮询 |
| `server/routes/daily-menu.ts` | 只读菜单API，不触发模型 |
| `server/services/daily-menu-service.ts` | 北京日期日程、候选与降级、并发预算；onListen启动、onClose取消 |
| `server/lib/daily-menu-llm.ts` | 有界单次DS请求、JSON/schema与候选ID白名单，不读写文件 |
| `server/services/recipe-repository.ts` | 独立缓存的串行认领与原子保存，坏缓存保留 |

字段见 [DATA_MODEL §10](DATA_MODEL.md#10-每日菜单与请求预算cb-015)，单副本前提及故障决策见 [ADR-0010](decisions/ADR-0010-daily-menu.md)。

## 5. 备选方案与取舍

| 方案 | 优点 | 为什么暂不选 |
| --- | --- | --- |
| **纯静态站**（Vite 构建 + 菜谱编译进 JSON，Caddy/nginx 托管） | 最简单，无后端进程 | 新增菜谱要重新构建；图片目录管理、后续编辑功能会别扭 |
| **Python + FastAPI/Flask** | 若你更熟 Python | 与现有 TS 项目栈不一致，前端仍需 JS；收益不明显 |
| **SQLite 起步** | 一步到位 | 当前数据量与写入频率用不上，增加 schema/迁移成本 |
| **Next.js / SSR** | 生态大 | 对自用局域网站是过度设计，部署体积与心智负担都更大 |
| **PWA（离线安装到桌面）** | 手机上像 App | 第二阶段可选加分项，非必需（`OPEN_QUESTIONS.md` Q7） |

## 6. 关键技术决策记录

| 决策 | 内容 | 影响 |
| --- | --- | --- |
| D1 | 数据源 = JSON 文件，非数据库（[ADR-0002](decisions/ADR-0002-json-files-as-source-of-truth.md)） | 换库时只需重写 repository 层 |
| D2 | 前端构建产物由后端托管 | 单容器、单端口；不需要反向代理 |
| D3 | 端口使用高位端口（`18081`，已确认服务器上空闲） | 避开路由器管理页 80/443 与已占用端口 |
| D4 | 容器根文件系统 `read_only: true`；持久化数据挂载可写 | 用户状态见 [ADR-0003](decisions/ADR-0003-write-operations-user-state.md)，编辑见 ADR-0005，工坊草稿/素材/新建见 ADR-0009；正式图片托管见 ADR-0004 |
| D5 | 镜像**在服务器上**构建（x86_64） | `docker compose up -d --build` 在服务器执行，不需要 buildx |
| D7 | 菜谱内容可写（CB-009）：写路径仍在 repository，**每道菜一条串行队列** + 原子替换 + 版本守卫（409） + 历史快照 | 界面编辑与脚本导入共用同一写入口；外部编辑器无锁（TOCTOU，见 [ADR-0005](decisions/ADR-0005-editable-recipes-and-history.md)） |
| D8 | 创意工坊：本地草稿、服务端 DS、受控排他新建 | 详见 [ADR-0009](decisions/ADR-0009-recipe-workshop.md)；不增加数据库或第二个数据写模块 |

## 7. 风险与应对

| 风险 | 应对 |
| --- | --- |
| 手写 JSON 出错导致服务启动失败 | zod 校验 + 启动时跳过并告警坏文件，不影响其他菜谱；`npm run check:data` 提供离线校验 |
| **网页编辑把内容改坏** | 写入前过同一份 zod + 内容检查（不合法不写盘），原子替换 + 历史快照（可回退） + git 可 diff；版本守卫防覆盖 |
| **导入脚本吃掉网页修改** | 导入器**默认拒绝覆盖已存在菜谱**（显式 `--overwrite-existing` 才覆盖，并在输出里提醒先停服）；CB-010 落地后走「先比较、后合并」 |
| 图片体积膨胀 | 首版按**原图 + 懒加载**（不生成缩略图）：单张中位数 230 KiB、最大 1 MiB，滚动看完现有 179 张累计约 56 MiB；真机着卡再另立规格做缩略图（口径见 [CB-007](features/CB-007-images.md)）；将来做网页上传时在上传环节压缩 |
| 服务器磁盘/分区未就绪 | 部署前确认数据目录可用空间（见 `DEPLOYMENT.md` 的前置检查） |
| 端口冲突 | 部署前 `netstat -ltn` 检查；端口写进 `.env.server` 便于改 |
| 后续想公网访问 | 明确不在本期范围；如需要，用 Tailscale 而非端口映射（另开 ADR 评估） |
| 局域网 http 下部分浏览器能力不可用 | 例如 Screen Wake Lock 可能因非安全上下文被拒——属 [CB-001](features/CB-001-cooking-mode.md) 待定项 |
