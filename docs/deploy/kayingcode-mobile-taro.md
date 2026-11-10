# Taro 移动壳部署

应用：`apps/kayingcode-mobile-taro`（`@kayingcode/mobile`）。返回[部署汇总](../deploy.md)。

## 接入与所有权

先部署 [Cloudflare V2、轻量账号与固定上游 Web](kayingcode-relay-cloudflare.md)。从桌面远控入口生成完整 HTTPS `/remote/v4?sid=…#authorize=…` 链接，在手机添加设备后打开网页。H5 与微信 WebView 都将自托管链接原样交给 Web；授权、工作区、会话和恢复由 Web 与已有 Desktop Host 管理。链接失效时从桌面重新生成。

上游 ZCode 在 H5 打开 Web，微信渠道保留原生 V2 OAuth/ws2。旧配对码、审批页、Node attachment 和 hash/t 已退役，无需另行部署旧 Relay/Agent Node。现用远程执行仍复用桌面 Host。

## 构建

依赖从仓库根安装，不生成独立锁文件。使用 mise.toml 指定的 Node/pnpm，在根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @kayingcode/mobile typecheck
pnpm --filter @kayingcode/mobile test
pnpm --filter @kayingcode/mobile build:h5
pnpm --filter @kayingcode/mobile build:weapp
```

输出分别为应用 `dist/h5/` 和 `dist/weapp/`。开发命令为 `dev:h5` / `dev:weapp`。H5 使用 browser 路由与根 publicPath，静态服务器必须将未知页面路径回退到 index.html。每次构建会重建输出目录。

## 微信发布

默认 AppID 为 `wx7c84fe95e306bc3c`，由应用的 `project.config.json` 提供。构建后在微信开发者工具导入 `dist/weapp`，以产物 `app.json` 的页面列表为准。为其他 AppID 构建时，可显式设置 `TARO_APP_ID`。

为实际使用的 HTTPS/WSS origin 配置 request/socket 合法域名，自托管 WebView 还需配置业务域名及满足微信平台资格。源码 urlCheck 保持开启，忽略域名校验只供本地调试。微信预览、上传、隐私声明和提审由开发者工具完成，仓库没有自动上传密钥。

授权链接及凭据不得写入源码、日志、截图或发布配置。小程序运行时兼容逻辑位于 src/ports，不将平台全局注入共享协议代码。

## 审核环境

应用商店或微信提审需要多天有效的链接时，使用独立审核 Relay 配置邀请有效期、领取次数和终端凭据有效期，并在 Ubuntu 审核主机设置 token 预算；Taro 不需要额外配置。完整步骤见[审核环境部署](kayingcode-review-environment.md)，Taro 侧规则见[审核接入规范](../../apps/kayingcode-mobile-taro/spec/review-environment.md)，平台提交位置与备注模板见[应用审核方案](kayingcode-app-review.md)。

- 微信 WebView 的审核 origin 必须加入提交 AppID 的业务域名，保持 `urlCheck` 开启。校验文件由 Relay 构建复制到根路径（默认 AppID 的校验文件为 `69txzPKb7q.txt`）；换用其他 AppID 需先扩展 Relay 静态白名单并重新构建。
- 建议审核 origin 使用 `kayingai.com` 等已知域名的子域，避免添加设备时的「未知服务器」确认；否则在审核备注写明点击继续。
- 微信提审备注限 200 字。审核主机设置 `KAYINGCODE_REVIEW_COMPACT_LINK=1` 生成只含 `sid` 和 authorize fragment 的紧凑链接，示例约 135 字；审核期间保持 Desktop 在线，重启后重新签发链接。
- H5 没有业务域名限制，但跨域 iframe 的存储分区可能让重开链接多 claim 一次，不作为商店提审产物。

## 验收

先 build:h5，再从根运行：

```sh
node apps/kayingcode-mobile-taro/scripts/kayingcode-web-h5.e2e.mjs
node apps/kayingcode-mobile-taro/scripts/zcode-web-h5.e2e.mjs
```

E2E 使用受控 HTTPS 替身，验证三入口、完整 URL、刷新、错误重试、迟到事件和无旧协议请求。生产扫码、微信域名、WebView、原生 V2 消息收发及前后台恢复需真机独立验收。构建的体积 warning 应记录，不能据构建成功宣称生产连通。

源码依据：[应用 README](../../apps/kayingcode-mobile-taro/README.md)、[接入 spec](../../apps/kayingcode-mobile-taro/spec/legacy-relay-retirement.md)。
