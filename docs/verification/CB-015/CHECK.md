# CB-015 验证记录

规格见 [CB-015](../../features/CB-015-daily-home-menu.md)，决策见 [ADR-0010](../../decisions/ADR-0010-daily-menu.md)。日期：2026-10-03；实现为 implemented，厨房反馈尚未完成。

## 静态检查与自动化

`npm run typecheck`、`npm test`、`npm run check:data`、`npm run build`、`git diff --check` 均通过。37个测试文件、365项测试；371道菜谱合法，0失败。没有新增依赖或改写菜谱、图片、用户状态格式。

新增18项测试覆盖模型请求/单次请求/候选ID和角色唯一/含body的超时；北京跨日、00:05调度与关闭取消；并发认领、同日预算与重载；先认领后请求、坏缓存保留、写失败零调用、旧菜单/失效ID/缺候选降级；厨具空数组、蚝油青菜与五花肉包菜区分；ready/inject/重复GET无模型请求。只使用临时目录。

## 真实DS与预算

- 现有接口 `/models` 返回 `deepseek-flash` 名称 `DeepSeek-V4.1-Flash`。
- 复制371道菜与词表到独立临时目录，图片只读链接；只读取得当前10件厨具设置。模型接收180道候选的必要摘要，43369字符，不传来源链接、步骤、图片、收藏或草稿。
- 北京日期2026-10-03，真实调用1次；promptTokens17795、completionTokens101、totalTokens17896。
- 返回蒜苔炒肉末、蒜蓉西兰花、西红柿鸡蛋汤。逐道检查原食材，分别含五花肉、蔬菜（蚝油作调味）、汤羹；原谱servings均为2，未缩放用量。
- 8个并发refresh、再次refresh、重建repository/service后依旧只调用1次，三道ID一致；371个正式菜谱文件SHA256不变。
- 临时证据位于 `/tmp/cookbook-daily-qa-20261003`；发布复用同一份日期缓存，不再次调用模型。上线与备份统一见 DEPLOYMENT。

## 浏览器与设计复核

Chrome真实渲染，1280×900、390×844、320×740无横向溢出；顶部两按钮均44×44px且名称正确。沿用白底绿字、圆角图标底与已有图片；桌面并列大图，手机完整显示三菜、简短角色，不增加模型说明长文。菜名保留完整按钮名称，320px的长汤名可换两行。

厨具图标打开原面板，砂锅取消/勾选与Enter收起可用；搜索西兰花时推荐区隐藏、显示2条结果，清空后恢复。三菜均实际点击进入原详情并返回，份量仍2人份。控制台warn/error为空。

截图：[本地桌面](screenshots/2026-10-03-home-desktop.jpg)、[本地手机](screenshots/2026-10-03-home-mobile.jpg)、[320px](screenshots/2026-10-03-home-narrow.jpg)、[线上桌面](screenshots/2026-10-03-live-home-desktop.jpg)、[线上手机](screenshots/2026-10-03-live-home-mobile.jpg)。

Docker新镜像已在无网络临时容器实测：onReady只读、onListen生成一次、重建应用复用cache，前端无实际密钥。线上1280/390px完整三菜、44px图标、面板开关、图片与控制台均通过；实际进程重启healthy，缓存SHA不变。部署与备份现场事实见 [DEPLOYMENT §0i](../../DEPLOYMENT.md#0i-两人每日菜单与厨具图标部署2026-10-03)。

## 尚未验证

真实手机触屏、两台实体设备和00:05实际跨夜运行尚未观察；时区/调度已有自动化证据。实际食量、口味与站着做饭是否顺手仍待用户试做，不以浏览器验证替代。
