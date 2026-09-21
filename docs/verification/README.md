# 验收证据

存放**真实运行**留下的证据，用来把功能规格从 `implemented` 推到 `verified`。文档写得好不等于验证过——这里放的是"确实跑过/确实用过"的记录。

## 放什么

- 真机截图（手机竖屏、做菜模式、计时中、到点提示……）
- 命令输出（`npm run typecheck` / `npm test` / `npm run check:data` / `curl` 结果）
- 真机验收记录：设备型号、系统与浏览器版本、日期、做了什么、结果如何
- 试做反馈：直接记在 [`../features/CB-001-cooking-feedback.md`](../features/CB-001-cooking-feedback.md)，这里只放结论

## 目录约定

```text
docs/verification/
├── CB-001/
│   ├── iphone-cooking-mode.png
│   ├── android-timer.png
│   └── CHECK.md          # 验收清单与结论
└── deploy-2026-09-2x/
    └── CHECK.md          # 部署验收（含局域网访问实测）
```

## 命名与要求

- 一个功能一个目录：`<编号>/`（如 `CB-001/`）。
- 每个目录里放一份 `CHECK.md`：逐条对应规格里的验收项，写"怎么验的 + 结果"，未通过的写明现象。
- 截图保留原始分辨率，不做美化处理；文件名用英文小写连字符。
- 不要把密钥、内网凭据、私人内容放进证据文件（本项目目前没有密钥，但仍遵守这条）。

## 自动化测试的两层与环境注意

| 层 | 环境 | 覆盖 |
| --- | --- | --- |
| 纯逻辑 | `node`（默认） | `scale/format`、`timer`、`kitchen`、`equipment`、`content-lint`、`schema`、`search`、`repository` |
| 组件/交互 | `jsdom`（文件顶部 `// @vitest-environment jsdom`） | `StepList`（到点提醒保持、索引清洗）、`KitchenToolsPanel`（保存失败、空词表）、`EquipmentRow`（三态 + 未载入）、`RecipeCard`（标记与不标记） |

> **环境坑（2026-09-20 实测）**：Node 22+ 自带实验性 `localStorage` 全局，在没有 `--localstorage-file` 时求值为 `undefined`，
> 并且**盖住了 jsdom 的实现**（`window.localStorage` 同样 undefined；`sessionStorage` 不受影响）。
> 因此组件测试里用 `test/helpers.tsx` 的 `ensureLocalStorage()` 装一个内存实现。
> 顺带验证了一件事：`storage.ts` 在这种环境下**优雅降级**（`writeStored` 返回 `false` 而不是抛错），
> 与"隐私模式下不静默失败"的设计一致。

## 已知的工具误报（不要追）

| 现象 | 根因 | 怎么核实 |
| --- | --- | --- |
| ~~LSP 报 `test/**` 里"模块没有导出成员 xxx"~~ **已修（2026-09-20）** | 根 `tsconfig.json` 的 `include` 只有 `src/client`/`src/shared`，LSP 给 `test/**` 挑了它 → 看不到 `src/server` 的导出。已把根配置的 `include` 放宽为 `["src", "test", "vite.config.ts"]` 并补上 `node` 类型 | 修复后复检：`npm run typecheck`/`test`/`check:data`/`build` 四个门禁仍 exit 0 |
| LSP 对刚编辑过的文件给出过期结论 | 索引滞后 | 以 `tsc` 与实际测试运行为准 |
| 报 `scripts/*.ts` 里 `process` 找不到、参数隐式 any | 根 `tsconfig.json` 的 `include` 只有 `src`/`test`/`vite.config.ts`，单扫这些文件时缺 node 类型；**`scripts/` 其实由 `tsconfig.test.json` 覆盖**（`npm run typecheck` 第三项） | 跑 `npm run typecheck`（三项全过即脚本类型正常）；别为此改 tsconfig 的 include |

**规矩**：门禁以**命令退出码**为准（`npm run typecheck`/`npm test`/`npm run check:data`/`npm run build`），不以编辑器内联诊断为准。

## 与规格的关系

规格第 11 节「实现与验证证据」只写**结论与链接**，具体材料和命令输出放这里，避免规格文件变成流水账。
