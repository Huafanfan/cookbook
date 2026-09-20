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
| 本项目数据目录 | `/srv/data/cookbook/{recipes,images}` |
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
rsync -av ~/Workspace/cookbook/data/equipment.json root@192.168.1.2:/srv/data/cookbook/   # 厨具词表改过才需要
ssh root@192.168.1.2 "cd /srv/app/cookbook/source && docker compose --env-file .env.server -f compose.yaml restart"
```

---

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
| 图片 404 | 确认目录名与菜谱 `id` 完全一致（大小写敏感） |
| 容器起不来（磁盘） | `df -h /srv`；Overlay 只有 1.9G，Docker 数据必须留在 `/srv/docker` |

---

## 7. 部署安全基线（沿用现有约定）

- 非 root 运行（`user: node`）
- 只读根文件系统 `read_only: true` + `tmpfs: /tmp`
- `cap_drop: ALL`、`no-new-privileges: true`
- `pids_limit`、`mem_limit`、日志轮转
- 仅在**局域网地址**上暴露端口：`ports: ["192.168.1.2:18081:8080"]`，不监听 `0.0.0.0`
- 无外网依赖，无第三方 API 调用，无遥测
