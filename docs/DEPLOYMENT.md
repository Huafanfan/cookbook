# 部署与运行

状态：脚本与配置已就绪（`Dockerfile` + `compose.yaml` + `.env.server.example` 均在仓库根目录），
但尚未在服务器上执行过部署。服务器事实已实测（2026-09-19 检查）。
目标：`http://192.168.1.2:18081` 局域网可访问，容器重建不丢数据

---

## 0. 已核实的服务器现状

| 项 | 实测值 |
| --- | --- |
| 主机 | iStoreOS，`192.168.1.2`，`x86_64`，SSH 免密可用 |
| Docker | 27.3.1 |
| Docker Compose | v2.39.1 |
| 数据盘 | `/srv`（935.5G，已用 3.0G），Docker 数据在 `/srv/docker` |
| 已有约定 | 应用源码 `/srv/app/<项目>/`，数据 `/srv/data/<项目>/` |
| 已运行容器 | `pt-media-assistant`（4178，host 网络）、`pt-media-assistant-prowlarr`、`lan-smoke-test`（18080） |
| 已占用端口 | 22、53、80、443、3038、4178、5037、8125、9696、18080、18333、19290、19999、55555、Tailscale 的 8080–8088 |
| **本项目端口** | **18081**（已确认空闲） |
| 本项目数据目录 | `/srv/data/cookbook/`（`recipes/`、`images/`、`equipment.json`、`tags.json`、**`user-state.json`**） |
| 本项目厨具词表 | `/srv/data/cookbook/equipment.json`（13 件，默认勾选 5 件） |
| 本项目源码目录 | `/srv/app/cookbook/source/` |

> 部署前请复检端口：`ssh root@192.168.1.2 "netstat -ltn | grep 18081"`（无输出即空闲）。

---

## 1. 本地开发（Mac）

```bash
cd ~/Workspace/cookbook
npm install
npm run dev          # 前端 Vite + 后端 tsx watch 并发启动
```

- 前端开发地址：`http://localhost:5173`（Vite 代理 `/api` 到后端）
- 后端：`http://localhost:3000`
- 手机真机联调：手机连同一 Wi-Fi，访问 `http://<Mac 局域网 IP>:5173`（Vite 已配 `--host 0.0.0.0`）

自检：

```bash
npm run typecheck          # 类型检查（三套 tsconfig）
npm test                   # 单元测试
npm run check:data         # 校验 data/recipes/*.json
npm run build && npm start # 生产构建本地跑一遍（http://127.0.0.1:3000）
```

---

## 2. 首次部署（逐步）

### 步骤 1 · 服务器建目录

```bash
ssh root@192.168.1.2
mkdir -p /srv/app/cookbook/source
mkdir -p /srv/data/cookbook/recipes /srv/data/cookbook/images
chmod 755 /srv/data/cookbook
```

同时放入厨具词表（菜谱的厨具字段按它校验；缺了这个文件厨具功能会显示"清单未载入"）：

```bash
# Mac → 服务器
scp ~/Workspace/cookbook/data/equipment.json root@192.168.1.2:/srv/data/cookbook/
```

### 步骤 2 · 同步源码到构建上下文

在 Mac 上（**只同步源码，不带 `node_modules`、`data/`、`.env`**）：

```bash
cd ~/Workspace/cookbook
rsync -av --delete --exclude node_modules --exclude dist --exclude .git \
  --exclude data --exclude '*.log' --exclude '.env.server' \
  ./ root@192.168.1.2:/srv/app/cookbook/source/
```

> 为什么排除 `data/`：菜谱数据只走 `/srv/data/cookbook`（bind mount），不参与镜像构建，避免出现"两份数据"。

### 步骤 3 · 准备环境变量文件

```bash
ssh root@192.168.1.2
cd /srv/app/cookbook/source
cp .env.server.example .env.server
vi .env.server        # 至少确认 COOKBOOK_PORT=18081
chmod 600 .env.server
```

### 步骤 4 · 校验并启动

```bash
cd /srv/app/cookbook/source
docker compose --env-file .env.server -f compose.yaml config --quiet   # 语法校验
docker compose --env-file .env.server -f compose.yaml up -d --build    # 首次构建（约 1–3 分钟）
docker compose --env-file .env.server -f compose.yaml ps
```

### 步骤 5 · 健康检查

```bash
curl -fsS http://192.168.1.2:18081/api/health && echo
curl -s  http://192.168.1.2:18081/api/recipes | head -c 300
docker logs --tail 50 cookbook
```

预期：`/api/health` 返回 `{"status":"ok","recipes":N}`。

### 步骤 6 · 首次灌入菜谱数据

```bash
# Mac → 服务器
rsync -av ~/Workspace/cookbook/data/recipes/ root@192.168.1.2:/srv/data/cookbook/recipes/
rsync -av ~/Workspace/cookbook/data/images/ root@192.168.1.2:/srv/data/cookbook/images/     # 菜品图片（约 56 MiB，不在镜像里）
rsync -av ~/Workspace/cookbook/data/equipment.json root@192.168.1.2:/srv/data/cookbook/   # 厨具词表改过才需要
ssh root@192.168.1.2 "cd /srv/app/cookbook/source && docker compose --env-file .env.server -f compose.yaml restart"
```

> **图片扫描在启动时**：改完图片必须重启（`docker restart cookbook`）才会生效；没重启时旧图照常显示。
> 启动日志会给出扫描结果：`图片扫描完成：179/371 道菜有封面，0 张步骤图`；文件名不合约定时会有 `图片检查 …` 告警。

---

## 2b. 缓存策略（为什么不需要清缓存）

浏览器"看到旧界面"是这类局域网应用最常见的抱怨。根因是**没设显式缓存头时浏览器会按启发式自己猜**。
现在三类资源的策略是明确的（实现在 `src/server/index.ts`）：

| 资源 | 响应头 | 为什么 |
| --- | --- | --- |
| `index.html`（含 SPA 兜底 `/recipe/xxx`） | `cache-control: no-cache` + ETag | 它指向带内容哈希的资源文件；**它被缓存住就会一直用旧前端**。`no-cache` 不是不缓存，而是每次回服务器确认——有 ETag 时通常只是一个 304，开销极小 |
| `/assets/*`（Vite 产物，文件名含内容哈希） | `public, max-age=31536000, immutable` | 内容变了文件名就变，可以放心永久缓存 |
| `/api/*` | `no-store` | 菜谱、标签、点赞收藏都会变，必须每次拿新的 |
| `/images/*` | `no-cache` + ETag（每次重验证，内容未变就是 304） | 图片文件名是固定的（`cover.jpg`），内容却会换 —— 用 `immutable` 会让"换了照片却还显示旧的"变成必须清缓存 |

**效果**：部署新版本后，用户**正常刷新（或重新打开页面）就能拿到新版**，不需要清缓存、不需要无痕窗口。

实测（本机）：

```bash
curl -s -D - -o /dev/null http://192.168.1.2:18081/ | grep -i cache-control          # no-cache
curl -sI http://192.168.1.2:18081/api/recipes | grep -i cache-control               # no-store
curl -sI http://192.168.1.2:18081/assets/index-xxxx.js | grep -i cache-control      # immutable
```

> 注意：查 SPA 兜底路径要用 **GET**（`curl -s -D -`），`curl -I` 发的是 HEAD。
> 兜底现在同时接受 GET 与 HEAD（原先只接受 GET，会出现"HEAD 404 而 GET 200"的不一致）。

## 3. 局域网访问验证

| # | 检查 | 预期 |
| --- | --- | --- |
| 1 | Mac 浏览器打开 `http://192.168.1.2:18081/` | 看到菜品列表 |
| 2 | 手机连 Wi-Fi，浏览器打开同一地址 | 同上，页面为移动端布局 |
| 3 | 搜索"西红柿" | 即时命中 |
| 4 | 进入详情页，刷新页面 | 正常显示（SPA 路由兜底生效） |
| 5 | 服务器重启：`ssh root@192.168.1.2 reboot` 后等待 2 分钟 | 页面自动恢复（`restart: unless-stopped`） |

> 建议在手机上把地址「添加到主屏幕」，用起来接近 App。

---

## 4. 日常更新（改了代码）

```bash
cd ~/Workspace/cookbook
npm run typecheck && npm test && npm run check:data

rsync -av --delete --exclude node_modules --exclude dist --exclude .git \
  --exclude data --exclude '*.log' --exclude '.env.server' \
  ./ root@192.168.1.2:/srv/app/cookbook/source/

ssh root@192.168.1.2 "cd /srv/app/cookbook/source && \
  docker compose --env-file .env.server -f compose.yaml up -d --build && \
  docker compose --env-file .env.server -f compose.yaml ps"
```

只改了菜谱数据（没改代码）时更简单：

```bash
rsync -av ~/Workspace/cookbook/data/recipes/ root@192.168.1.2:/srv/data/cookbook/recipes/
ssh root@192.168.1.2 "docker restart cookbook"     # 或等 M5 做热重载，就不需要重启
```

---

## 5. 备份与恢复

### 备份（数据只有 `data/`，备份它就等于备份了一切）

```bash
ssh root@192.168.1.2 "tar czf /srv/backup/cookbook-$(date +%F).tar.gz -C /srv/data cookbook"
# 建议再加一条：把归档拉回 Mac
scp root@192.168.1.2:/srv/backup/cookbook-*.tar.gz ~/Backups/
```

### 恢复

```bash
ssh root@192.168.1.2 "tar xzf /srv/backup/cookbook-2026-09-19.tar.gz -C /srv/data && docker restart cookbook"
```

建议把备份命令加入现有定时任务（服务器上已有 `/srv/backup` 目录与既有备份流程）。

> `data/` 里现在包含**可变**的 `user-state.json`（点赞/收藏）——它也在同一个备份里，无需单独处理。
> 容器挂载已改为**可写**（见 compose.yaml 注释与 [ADR-0003](decisions/ADR-0003-write-operations-user-state.md)）；容器根文件系统仍是只读。

---

## 6. 排障速查

| 现象 | 排查 |
| --- | --- |
| 打不开页面 | `docker ps` 看容器是否 Up；`docker logs cookbook` 看报错；`netstat -ltn \| grep 18081` 看端口 |
| 页面能开但没菜 | `ls /srv/data/cookbook/recipes`；`docker logs cookbook \| grep -i "载入"` |
| 某道菜不显示 | 该 JSON 校验失败被跳过，日志里有文件名与原因；本地跑 `npm run check:data` |
| 厨具显示“清单未载入” | `/srv/data/cookbook/equipment.json` 缺失或格式错；`docker logs cookbook` 会给出原因 |
| 菜谱提示“厨具不在清单里” | 菜谱里的厨具名不在词表内；错误信息会列出全部可选值（词表在 `data/equipment.json`） |
| 端口冲突 | 改 `.env.server` 的 `COOKBOOK_PORT`，重新 `up -d` |
| 图片不显示 / 图片 404 | 确认 `data/images/<菜谱id>/cover.jpg`：目录名要与 `id` **完全一致**（大小写敏感）、文件名必须是 `cover.jpg` 或 `step-<N>.jpg`（小写 `.jpg`，`cover.png`/HEIC 不认）；加/换图后要**重启**；看启动日志 `图片扫描完成：X/Y 道菜有封面` 与 `图片检查 …` 告警 |
| 图片换了但还看到旧的 | 浏览器缓存是按 `no-cache` 重验证的，正常刷新即可；若确认没变，检查是否真的重启了（扫描在启动时）、文件是否放到了另一个目录 |
| 容器起不来（磁盘） | `df -h /srv`；Overlay 只有 1.9G，Docker 数据必须留在 `/srv/docker` |

---

## 7. 部署安全基线（沿用现有约定）

- 非 root 运行（`user: node`）
- 只读根文件系统 `read_only: true` + `tmpfs: /tmp`
- `cap_drop: ALL`、`no-new-privileges: true`
- `pids_limit`、`mem_limit`、日志轮转
- 仅在**局域网地址**上暴露端口：`ports: ["192.168.1.2:18081:8080"]`，不监听 `0.0.0.0`
- 无外网依赖，无第三方 API 调用，无遥测
