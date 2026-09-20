# cookbook · 局域网菜谱

一个自用的菜谱网站：**浏览或搜索 → 选中一道菜 → 看简单明了的做法步骤**。
部署在本地服务器（iStoreOS `192.168.1.2`）的 Docker 里，局域网内任何设备打开浏览器即可访问。

> 当前状态：**M0–M3 与 CB-001（做菜顺手）、CB-002（厨具匹配）已完成**，本机浏览器实测通过，**待真机验收**，**尚未部署**。
> 详情页现在有：**厨具匹配（缺什么一目了然，可用替代工具会说出来）**、步骤一键计时与到点提醒、吸顶回位、屏幕常亮。
> 份量按菜谱原文显示（`servings: 2` 是家庭基准，**不做自动换算**）。
> 下一步：真机试做并回填[试做反馈](docs/features/CB-001-cooking-feedback.md) ｜ Astra 复核 ｜ 部署 ｜ 图片（M4）。
> 入口：[`docs/START-HERE.md`](docs/START-HERE.md)（当前状态与阅读路径）。

## 目标（一句话）

在手机/电脑上，3 秒内找到"今天做什么菜"，并看到一眼能看完、照着能做的步骤。

## 快速开始（本机）

```bash
npm install
npm run dev          # 前端 5173，后端 3000，手机可访问 http://<Mac IP>:5173
```

生产模式本地跑一遍：

```bash
npm run build
npm start            # http://127.0.0.1:3000
```

质量检查（改完代码跑这三条）：

```bash
npm run typecheck    # 前端 / 后端 / 测试 三套 tsconfig 全过
npm test             # 110 个用例（90 纯函数 + 20 组件；组件层用 jsdom + Testing Library）
npm run check:data   # 校验 data/recipes/*.json
```

## 怎么加一道菜

在 `data/recipes/` 新建一个 JSON 文件（文件名必须等于 `id`），照抄现有样例的字段即可：

```bash
cp data/recipes/xi-hong-shi-chao-ji-dan.json data/recipes/wo-de-xin-cai.json
npm run check:data   # 校验通过后重启服务即可看到
```

字段说明见 [docs/DATA_MODEL.md](docs/DATA_MODEL.md)。要点：

- 步骤的 `minutes` 写**这一步大概要多久（含等待）**，例如腌制 10 分钟就写 `10`——它就是详情页一键计时的默认时长。
- 厨具只能写 `data/equipment.json` 词表里的名字（`equipment` = 必需，`equipmentAlternatives` = “任选其一”的替代组）；写错会被 `npm run check:data` 拦住并列出可选值。只声明**决定能不能做**的工具（锅、烤箱这类），锅铲、碗这类通用工具不用写。
- `servings` 默认写 **2**（两人份是一男一女的实际量这个**家庭基准**）；**详情页按原文原样显示，不做换算**。
- 步骤文案里出现的时间数字要与该步 `minutes` 一致；替代组只能写**同一套步骤下真能用**的器具。
- 写错了不会影响其他菜：坏文件会被跳过并打日志。

### 加一件厨具

编辑 `data/equipment.json` 的 `tools` 数组（想默认勾选就同时加进 `defaultOwned`），重启服务即可——不需要改代码或重建镜像。

## 开发流程（先文档，后代码）

本项目采**文档驱动、规格先行**，规则写在 [`AGENTS.md`](AGENTS.md)：

```text
写规格 docs/features/CB-XXX.md (draft)
   → 用户审阅批准 (accepted)        ← 这里不过关就不写代码
   → 实现（回填实现路径与验证证据）
   → 真机 / 试做验收 (verified)
   → 把结论回流到需求、数据模型、架构文档
```

| 改动类型 | 需要什么 | 举例 |
| --- | --- | --- |
| T0 无行为变化 | 不需要新规格 | 错别字、样式微调、局部重构 |
| T1 功能/行为/字段变化 | 功能规格（`accepted`） | 加计时器、加一个菜谱字段 |
| T2 架构/数据/部署/暴露面 | 规格 + ADR | 换 SQLite、加图片上传、上 HTTPS |
| T3 不可逆或现实副作用 | T2 产物 + 明确授权 | 部署上线、删数据、改服务器监听 |

下个功能开工前先写规格：[`docs/templates/feature-spec.md`](docs/templates/feature-spec.md) → `docs/features/CB-00X-<slug>.md`，
达到 `accepted` 后才动代码。已完成的第一份规格：[CB-001 做菜顺手](docs/features/CB-001-cooking-mode.md)。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | **协作规则**：变更等级、规格生命周期、代码与数据约定 |
| [docs/START-HERE.md](docs/START-HERE.md) | **当前状态与阅读路径** + 每条事实的权威位置 |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 需求对齐：做什么、不做什么、验收标准 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术选型与理由、代码职责、备选方案取舍 |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | 一道菜的数据长什么样（含真实样例） |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 里程碑拆分与进度（含每一步的真实验证结果） |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 逐步部署：本地 → 服务器 → 局域网 → 备份 |
| [docs/features/](docs/features/README.md) | 功能规格目录（CB-001 …）与[试做反馈表](docs/features/CB-001-cooking-feedback.md) |
| [docs/decisions/](docs/decisions/README.md) | ADR：跨模块、难逆转的决定 |
| [docs/templates/feature-spec.md](docs/templates/feature-spec.md) | 新功能从这份模板开始 |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | 跨功能的未决问题与默认建议 |

## 目录结构

```text
cookbook/
├── README.md
├── AGENTS.md              # 协作规则：变更等级、规格生命周期、代码与数据约定
├── Dockerfile             # 生产镜像（前端构建 + 后端运行，单容器）
├── compose.yaml           # 服务器部署定义
├── .env.server.example    # 服务器配置示例（复制为 .env.server）
├── docs/                  # 见 docs/START-HERE.md
│   ├── START-HERE.md      #   当前状态 + 阅读路径 + 权威位置表
│   ├── features/          #   每个功能一份规格（CB-001 …）+ 试做反馈表
│   ├── decisions/         #   ADR
│   ├── templates/         #   功能规格模板
│   └── verification/      #   验收证据（截图、命令输出）
├── data/                  # 数据（部署时挂载到服务器，不进镜像）
│   ├── recipes/           #   一道菜一个 JSON 文件 = 唯一数据源
│   ├── equipment.json     #   厨具权威词表（菜谱只能引用这里的名字）
│   └── images/            #   M4：菜品图片，data/images/<id>/01.jpg
├── src/
│   ├── client/            # 前端（React）
│   │   ├── pages/         #   HomePage 列表+搜索、RecipePage 详情
│   │   ├── components/    #   RecipeCard / SearchBar / FilterBar / IngredientList / StepList
│   │   ├── lib/           #   api、router、format、highlight、storage
│   │   └── styles/        #   global.css（手机优先，含深色模式）
│   ├── server/            # 后端（Fastify）
│   │   ├── main.ts        #   入口
│   │   ├── index.ts       #   组装应用：路由 + 静态资源 + SPA 兜底
│   │   ├── routes/        #   /api/recipes、/api/meta、/api/health
│   │   ├── services/      #   recipe-repository（唯一读文件处）、search
│   │   └── lib/           #   config、schema（zod 校验）
│   └── shared/            # 前后端共享的类型定义
├── scripts/               # check-data.ts 等
└── test/                  # vitest 用例
```

## 约定

- 文档与注释用中文，代码标识符用英文。
- 数据（菜谱、图片）与代码分离：`data/` 可整体备份、可手改、可搬到别的机器。
- 优先简单：JSON 文件够用就不上数据库；两个页面就不引路由库。
- 只有 `src/server/services/recipe-repository.ts` 读文件系统，其他模块不碰 `node:fs`。
- 一条事实只写在一个文档里，别处用链接（清单见 [docs/START-HERE.md](docs/START-HERE.md)）。

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/recipes?q=&category=&tag=` | 列表，支持关键词（菜名/别名/食材/标签）与筛选 |
| GET | `/api/recipes/:id` | 详情（完整食材与步骤） |
| GET | `/api/meta` | 分类、标签、总数（筛选器数据源） |
| GET | `/api/health` | 健康检查（容器用） |
