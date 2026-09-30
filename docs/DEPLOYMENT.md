# 部署与运行

状态：本项目已部署。2026-09-30 已补齐全部371道封面，当前运行与回滚证据见 §0f；此前封面、界面和内容部署记录保留在 §0e / §0d / §0c / §0b。
目标：`http://192.168.1.2:18081` 局域网可访问，容器重建不丢数据

---

## 0. 宿主机环境基线（2026-09-19）

以下是部署前记录的宿主机资源与端口基线；本项目当前运行状态见 §0b。

| 项 | 实测值 |
| --- | --- |
| 主机 | iStoreOS，`192.168.1.2`，`x86_64`，SSH 免密可用 |
| Docker | 27.3.1 |
| Docker Compose | v2.39.1 |
| 数据盘 | `/srv`（935.5G，已用 3.0G），Docker 数据在 `/srv/docker` |
| 已有约定 | 应用源码 `/srv/app/<项目>/`，数据 `/srv/data/<项目>/` |
| 已运行容器 | `pt-media-assistant`（4178，host 网络）、`pt-media-assistant-prowlarr`、`lan-smoke-test`（18080） |
| 已占用端口 | 22、53、80、443、3038、4178、5037、8125、9696、18080、18333、19290、19999、55555、Tailscale 的 8080–8088 |
| **本项目端口** | **18081**（当时空闲；目前由 cookbook 占用） |
| 本项目数据目录 | `/srv/data/cookbook/`（`recipes/`、`images/`、`equipment.json`、`tags.json`、**`user-state.json`**） |
| 本项目厨具词表 | `/srv/data/cookbook/equipment.json`（13 件，默认勾选 5 件） |
| 本项目源码目录 | `/srv/app/cookbook/source/` |

> 首次部署前才需要确认端口空闲；当前 18081 已由 cookbook 使用。日常更新按 §4 操作。

## 0b. 当前部署状态（2026-09-24）

2026-09-24 14:31（Asia/Shanghai）通过 SSH 对服务器执行只读检查：

| 项 | 现场结果 |
| --- | --- |
| 容器 | `cookbook`，`running / healthy`，重启次数 0；创建于 2026-09-21 22:22、启动于 22:24（+08:00） |
| 监听 | `192.168.1.2:18081` → 容器 `8080/tcp`；绑定在服务器 LAN 地址 |
| 健康接口 | `GET http://192.168.1.2:18081/api/health` 返回 `{"status":"ok","recipes":371}`（从服务器本机请求） |
| 数据挂载 | `/srv/data/cookbook` → 容器 `/data`，读写挂载；目录与 `user-state.json` 均为 `1000:1000`，目录权限 `755`、状态文件权限 `644` |
| 数据规模 | 371 道菜，数据目录约 60.3 MB；基线索引存在 |
| 来源基线 | 335 道 `verified`、32 道 `matched`、4 道没有 `sourceRef`；335 份菜谱快照。4 道未关联项中，2 道自建、2 道来自 HowToCook |
| 代码对照 | Dockerfile、Compose、package manifest、用户状态存储、source-ref 同步脚本及 schema/canonical 模块等 7 个选定文件，与本地工作区 SHA-256 一致；运行镜像含 `sourceRef` schema 与 canonical 模块 |
| 设备访问 | 本次从服务器本机检查了接口，尚未用手机或另一台 LAN 客户端复核页面与交互 |

以上确认当前容器与数据卷健康。`matched` 菜谱尚无已验证基线，不会进入自动覆盖流程；没有 `sourceRef` 的两道导入菜仍需核清来源映射。

## 0c. 内容修订部署（2026-09-27）

用户授权将已提交的 10 道菜内容修订推送并部署。GitHub `main` 已快进到 `afb812f944362c7cf34b39dc3855dfa9376289a2`；这 3 个新提交只有文档与菜谱数据变更，运行代码和镜像不变。因此本次只更新 `/srv/data/cookbook/recipes/` 中的 10 个文件，并重启现有 `cookbook` 容器。

| 项 | 实际检查结果 |
| --- | --- |
| 部署前数据对照 | 10 份线上文件逐字节等于本地修改前版本；未发现需合并的线上编辑。新文件先传到备份目录，10/10 与本地提交哈希一致 |
| 备份 | 停止应用后完整备份 `/srv/data/cookbook` 至 `/srv/backup/cookbook-content-20260927-185419/data.tar.gz`（56.1 MiB，`gzip -t` 通过）；原文件哈希与新文件副本也保存在同目录 |
| 容器 | `running / healthy`、`unless-stopped`；沿用原 `linux/amd64` 镜像 `sha256:852bc2695c82fb00525856c4a140f1b1e8c01354fba17ef59195ec92c8a207aa`，未重建 |
| 暴露与数据 | 仅 `192.168.1.2:18081` → `8080/tcp`；`/srv/data/cookbook` 读写挂载到 `/data`；371 份菜谱属主均为 `1000` |
| 应用实测 | 服务器 `/api/health` 为 `{"status":"ok","recipes":371}`，启动日志为“成功 371 道，跳过 0 个文件”；Mac 局域网客户端的 `/` 返回 200，并把 10 道菜接口的食材、步骤、小贴士逐项与提交版比较，全部一致 |
| 其他状态 | `user-state.json` 与备份哈希一致；iStoreOS HTTP/HTTPS 管理页仍为 200，SSH 仍可访问 |

回滚仅恢复本次 10 份菜谱，不覆盖其他菜或后续用户状态：`ssh root@192.168.1.2 'sh /srv/backup/cookbook-content-20260927-185419/rollback.sh'`。脚本已通过 `sh -n`，权限 `0700`，如果这 10 道菜在部署后再次被修改，会先拒绝回滚，避免覆盖新编辑。完整数据备份仍保留在上述归档中。

这些检查验证了数据已上线和接口可读；**基础牛奶面包、牛奶燕麦的真机试做仍未执行**，反馈入口见[CB-001 试做记录](features/CB-001-cooking-feedback.md)。10 道菜的原文核对与本地检查见[内容复核记录](verification/CB-003/CONTENT-REVIEW-2026-09-27.md)。

## 0d. PC / 手机界面改版部署（2026-09-29）

用户确认 [CB-011](features/CB-011-visual-redesign.md) 并明确要求完成部署、推送。代码提交 `d22b8a5` 只改前端、测试和文档；`data/` 未改。部署沿用现有 Compose、`192.168.1.2:18081 → 8080` 与 `/srv/data/cookbook → /data`，只重建 `cookbook` 服务。

| 项 | 现场结果 |
| --- | --- |
| 部署前 | `cookbook` 健康，旧镜像 `sha256:852bc2695c82fb00525856c4a140f1b1e8c01354fba17ef59195ec92c8a207aa`；服务器运行源码与改版前 Git 基线一致，仅有几份旧 AppleDouble 元数据文件；`/srv`、源码、数据和 Docker root 均在本地 ext4，剩余约 880.9G、空闲 inode 62,225,915 |
| 备份 | `/srv/backup/cookbook-ui-20260929-173501/`：源码 `source.tar.gz`、完整数据 `data.tar.gz`、旧镜像 ID、归档校验和及受保护的 `rollback.sh`；两份 gzip 校验通过；备份目录仅 root 可访问 |
| 构建 | Git 提交 `d22b8a5` 的源码经 `git archive` 传到原构建目录；关键文件 SHA-256 与提交版一致，Compose 配置校验通过。新 Node 基础层拉取极慢，改用服务器已缓存的 `linux/amd64` Node 22.23.2 基础镜像完成构建；运行镜像为 `sha256:d284709059bc67d1ad4f552b144d91697d1c7cc05bf917911816dd4380aa80c0` |
| 容器与数据 | `running / healthy`、`unless-stopped`；仅 `192.168.1.2:18081` → `8080/tcp`；数据仍挂载 `/srv/data/cookbook`。部署前后 `user-state.json` SHA-256 均为 `5ccd9ccd62f9be1b0cb01acf4032efe0f38185523a3d4044731246053071684a` |
| 应用与独立客户端 | 启动日志显示成功载入 371 道、跳过 0 个文件，179 道有封面；服务器 `/api/health` 返回 `{"status":"ok","recipes":371}`；Mac 浏览器打开线上首页与详情，取到新资源 `index-BksQc-vg.css` / `index-CoeGtRpG.js`，手机尺寸和桌面尺寸的新布局可见，320px 无横向溢出，详情无份量换算档位 |
| 管理与其他服务 | 部署前后 iStoreOS HTTP/HTTPS 管理页均为 200，SSH 22 与 LAN 18081 监听不变；其他三个容器未重启 |

回滚只还原代码与旧镜像，**不覆盖任何菜谱或用户状态**：

```bash
ssh root@192.168.1.2 'sh /srv/backup/cookbook-ui-20260929-173501/rollback.sh'
```

脚本已通过 `sh -n` 和 `--check`；运行前会核对当前镜像与已部署 CSS 哈希，若之后有更新则拒绝回滚，防止覆盖新代码。**真实手机和厨房试做仍待用户验证**，因此 CB-011 状态保持 `implemented`，不是 `verified`。

---

## 0e. 封面补全与署名页部署（2026-09-30）

用户明确要求“部署加推送”。本次沿用现有 Compose、LAN 监听与数据挂载，将 CB-012 的4张封面、CB-013 两批45张真实照片、来源署名页及长用量换行修正部署到现有 cookbook。运行源码来自提交 `78f6006`（实现提交 `1f1d3f3`），`git archive` 排除 `data/` 与本地环境文件；图片由独立归档追加，不在 Git 中。

| 项 | 现场结果 |
| --- | --- |
| 部署前 | `x86_64`、Docker 27.3.1；源码、数据与 Docker root 均在 `/srv` 本地 ext4，剩余约880.5G、空闲 inode 62,208,805。旧容器健康、179张封面；49个新封面位置均为空，已有封面与本地字节一致 |
| 备份 | `/srv/backup/cookbook-covers-20260930-115626/`：`source-before.tar.gz`、停服后一致快照 `data-before.tar.gz`、前后镜像 ID、文件摘要、构建日志及 `rollback.sh`。目录700、配置600、脚本700；gzip和归档摘要校验通过 |
| 构建与实现 | 使用服务器已缓存 Node 基础镜像构建 `linux/amd64`，镜像 `sha256:8bacc07c07dfdc0e9d07bfc0ff853987cb3cab997eb598c7048cab28b729d884`。Compose校验通过，Dockerfile、Compose、最终CSS和署名页的服务器SHA-256均与本地一致。构建成功后仅停止、更新和启动 cookbook app |
| 数据保护 | 49张封面逐一确认空缺后追加，属主1000:1000、文件644；原有890个文件（含菜谱、历史、用户状态及图片）SHA-256逐个复核通过。没有覆盖线上 JSON 或旧图片 |
| 容器基线 | `healthy`、`unless-stopped`、用户node；端口仍为 `192.168.1.2:18081 → 8080/tcp`，挂载仍为 `/srv/data/cookbook → /data`。只读根目录、cap_drop ALL、no-new-privileges、256MiB、pids128和16MiB tmpfs保持不变 |
| 自动化检查 | 复用最终实现提交的有效证据：typecheck、check:data、build通过，26个测试文件共280项测试通过；本次随后仅改部署文档，`git diff --check`另行通过 |
| 真实运行与独立客户端 | 启动日志载入371道、跳过0文件、228/371有封面；服务器与Mac局域网客户端健康接口均正常。Mac核对49张线上JPEG与本地字节一致，线上署名页与源文件完全一致、45条记录。1440px和390px浏览器各8条卡片进入详情路径、署名页往返、图片解码、控制台及横向溢出检查通过；手机长用量正常换行，AI标签仍清晰可见 |
| 管理与其他服务 | iStoreOS HTTP/HTTPS仍均200，22/80/443与LAN18081监听不变；pt-media-assistant、prowlarr、lan-smoke-test的启动时间前后逐项一致。服务仅面向现有192.168.1.0/24物理LAN；VPN与Docker虚拟网段未新增绑定 |

受保护回滚入口：

```bash
ssh root@192.168.1.2 'sh /srv/backup/cookbook-covers-20260930-115626/rollback.sh --check'
ssh root@192.168.1.2 'sh /srv/backup/cookbook-covers-20260930-115626/rollback.sh'
```

`sh -n`与`--check`均通过，未实际执行回滚。脚本先核对运行镜像、全部源文件摘要、新图片摘要及备份；后续更新会拒绝回退。执行回退时保留当前源码和49张新增图片到备份目录，恢复旧源码和旧镜像，保留当时最新的菜谱、历史与用户状态。真实手机、用户对新图片的观感及厨房试做仍未验证，相关规格保持 `implemented`。

本次推送采用 origin/main 正常快进；部署记录提交与远端一致性的确认见本次交付结果，运行镜像对应的源码提交仍为上面的 `78f6006`。

---

## 0f. 全部剩余封面部署（2026-09-30）

用户明确要求“部署推送”，实施前授权范围见[CB-013 §18](features/CB-013-open-license-cover-batch.md#18-全部剩余封面部署授权2026-09-30)。本次把第三批18张、第四批50张、第五批75张，共143张封面和更新后的署名页部署到现有服务。源码归档来自 `16b5a71c9c714586629ee1ebb13456eb75dcd7be`；图片独立追加，继续不进Git、不进镜像。仅更新cookbook app，部署方式与暴露面不变。

| 项 | 现场结果 |
| --- | --- |
| 部署前对照 | 线上371道、228张封面、跳过0；本地缺口对应143个空目标。线上原939个数据文件与本地重合文件没有字节差异；运行源码157个可比文件与此前部署的78f6006一致，保留两份旧测试文件和AppleDouble元数据，不进行清理。远端main无新增提交，本地3个补图提交待正常快进 |
| 宿主机 | x86_64、Docker27.3.1；源码、数据和DockerRootDir=/srv/docker均为本地ext4，约880.4GiB空闲、62,207,885个空闲inode。物理LAN192.168.1.0/24；未向WireGuard、Tailscale或Docker虚拟网段新增绑定 |
| 备份与回滚 | `/srv/backup/cookbook-complete-20260930-191857/`：source-before.tar.gz、停服一致快照data-before.tar.gz、原配置、前后镜像ID、前后文件摘要、暂存素材、构建日志及rollback.sh。目录700、文件600、脚本700；gzip、归档SHA256和回滚守卫均通过。旧镜像8bacc07…保留本地回滚标签；未实际执行回滚 |
| 构建 | 上传前排除data和环境文件；162个源码文件与提交版摘要一致、143个暂存JPEG摘要一致。使用服务器已缓存的Node22.23.2基础镜像构建linux/amd64，未拉取新基础层；运行镜像 `sha256:d32e181a78ae129b166c76a3092c8b6ad5612caabf3ac65d43cee2fdf806f952`。Compose校验通过，无配置更改 |
| 数据保护 | 停服后先完整归档数据，再逐项确认空目标，只复制143个封面，新增文件1000:1000/644、新目录755；不覆盖既有目录权限。143张合计41,283,723B。部署前后原939个文件逐个SHA256完全一致，包括菜谱、历史、用户状态和旧图片 |
| 容器与端口 | cookbook running/healthy，unless-stopped，用户node；仍为192.168.1.2:18081→8080/tcp，/srv/data/cookbook→/data读写挂载。只读根目录、cap_drop ALL、no-new-privileges、256MiB、pids128和16MiB tmpfs保持不变 |
| 检查证据复用 | 运行代码与上一批未改变；复用16b5a71对应的typecheck、280项测试、check:data371/0、build及本地75张150条页面路径证据。部署只更新静态署名页和追加素材，没有新的应用代码变更 |
| 服务器与Mac独立客户端 | 健康接口ok/371；列表371/371含封面、跳过0。Mac逐个核对143张新JPEG为HTTP200/image/jpeg且与本地SHA256一致；署名页字节与源HTML一致、98行。1440×1000和390×844各12条搜索卡片→详情路径，共24条，通过解码、ID、标识裁切、无控制台错误和无横向溢出检查；署名入口与返回通过 |
| 管理及其他服务 | HTTP/HTTPS管理页仍为200，22/80/443及LAN18081的监听前后相同。pt-media-assistant、prowlarr、lan-smoke-test的容器ID和启动时间逐项未变，容器清单仍为原四个；SSH正常 |

受保护回滚入口：

```bash
ssh root@192.168.1.2 'sh /srv/backup/cookbook-complete-20260930-191857/rollback.sh --check'
ssh root@192.168.1.2 'sh /srv/backup/cookbook-complete-20260930-191857/rollback.sh'
```

脚本先核对当前镜像、整个源码摘要、新143张图片摘要及备份；后续修改会拒绝回退。执行时保存当前源码和新增143张图片，再恢复旧源码/镜像，**保留最新菜谱、历史和用户状态**，不整体还原数据归档。备份目录本身不删除。用户观感、真机和厨房体验仍待反馈，相关规格继续为implemented。

本次正常推送main，包括三个已验证补图提交和本节部署记录；最终远端HEAD核对见交付结果。运行镜像对应源码提交仍为上文16b5a71，部署记录后的文档提交不改变镜像行为。

---

## 1. 本地开发（Mac）

```bash
cd ~/Workspace/cookbook
npm install
npm run dev          # 前端 Vite + 后端 tsx watch 并发启动
```

- 前端开发地址：`http://localhost:5173`（Vite 代理 `/api` 与 `/images` 到后端；**端口固定**——`vite.config.ts` 设了 `strictPort`，被占用会直接报错而不是改用 5174）
- 后端：`http://localhost:3000`（仅本机；手机要用 `npm run start:lan` 监听 `0.0.0.0`）
- 手机真机联调：手机连同一 Wi-Fi，访问 `http://<Mac 局域网 IP>:5173`（Vite 已配 `--host 0.0.0.0`）

> **让手机固定用一个网址。** 浏览器本地设置（字号、常亮、我的厨具）**按网址隔离**：
> 换端口、换 IP（`.4` / `.5`）、`localhost` 与 `127.0.0.1` 之间互不相通 ——
> 看到"设置丢了"先确认是不是换了网址，而不是没保存。

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
# 关键：容器以 node(uid 1000) 运行，数据目录与文件必须归它，否则写操作全部 503/EACCES
# （点赞/收藏/厨具/菜谱编辑都是"运行期写 data/"，见 ADR-0003）
chown -R 1000:1000 /srv/data/cookbook
```

同时放入厨具词表（菜谱的厨具字段按它校验；缺了这个文件厨具功能会显示"清单未载入"）：

```bash
# Mac → 服务器
scp ~/Workspace/cookbook/data/equipment.json root@192.168.1.2:/srv/data/cookbook/
```

### 步骤 2 · 同步源码到构建上下文

在 Mac 上（**只同步源码，不带 `node_modules`、`data/`、`.env`**）：

```bash
> **服务器上没有 `rsync`**（iStoreOS 是 BusyBox），所以用 `tar` 管道同步；
> macOS 还要加 `COPYFILE_DISABLE=1` 并排除 `._*`，否则会把 AppleDouble 元数据文件传上去 ——
> 那些 `._*.json` 会被当成菜谱文件、解析失败，前端因此弹出"N 个文件未载入"告警（2026-09-21 首次部署踩到过）。

cd ~/Workspace/cookbook
COPYFILE_DISABLE=1 tar czf - \
  --exclude=node_modules --exclude=dist --exclude=.git --exclude=data \
  --exclude='*.log' --exclude=.env.server --exclude='._*' --exclude=.DS_Store \
  . | ssh root@192.168.1.2 'mkdir -p /srv/app/cookbook/source && tar xzf - -C /srv/app/cookbook/source'
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
# Mac → 服务器（用 tar 管道；COPYFILE_DISABLE 防止带上 ._* 元数据）
cd ~/Workspace/cookbook
COPYFILE_DISABLE=1 tar czf - -C data --exclude='._*' --exclude=.DS_Store \
  recipes images equipment.json tags.json baselines \
  | ssh root@192.168.1.2 'tar xzf - -C /srv/data/cookbook'
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

另外：**同步上游用的克隆在 `~/Workspace/HowToCook`**（不在 `data/` 里，也不进备份 —— 丢了重新 `git clone` 即可）。跑同步/回填脚本前先在那里 `git pull`。

`data/` 里现在包含：`recipes/`（菜谱正文）、`history/recipes/`（**每次保存的修改记录**）、`images/`、
`equipment.json`、`tags.json`、`user-state.json`（点赞/收藏/我的厨具），以及（CB-010 之后）`baselines/` 与 `sync-proposals/`。

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
| 网页保存报 409「服务端上已经是另一个版本」 | 说明这道菜在别处（另一台设备/手工编辑器）又被改过：重新加载看新内容，或用"覆盖"（会带最新版本号重试）。**没把握就别覆盖** |
| 想手工编辑 `data/recipes/*.json` | **先停服务**再改（应用没有文件锁）：改完启动时会重新载入；否则网页保存可能把你的修改覆盖掉（见 [ADR-0005](decisions/ADR-0005-editable-recipes-and-history.md) §1） |
| 重跑导入脚本 | **默认不会覆盖已存在的菜谱**；要覆盖加 `--overwrite-existing`，并先停服务（否则会吃掉网页上的修改） |
| 菜谱改坏了想回退 | 看 `data/history/recipes/<id>/` 里保存前的版本（也可以在应用内"改过 N 次"里看/恢复）；仍可用 git 回退整个 `data/recipes/` |
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
