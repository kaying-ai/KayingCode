# 官方 Web 工作台部署

应用 packages/web（@zcode/web）直接构建固定官方 ZCode 源码，版本与提交见该包 upstream-web.json；不再交付自有 RelayApp、composer 或裁剪工作台。根 UPSTREAM_BASE 不因这项独立 Web 构建而改变。两个账号适配文件、入口 bootstrap 及受哈希审计的品牌资产替换属于本产品差异，详情见 packages/web/README.md 和 spec。

构建需要 Node（mise.toml 固定版本）、pnpm、Git 与已安装依赖：

```sh
pnpm install --frozen-lockfile
pnpm --filter @zcode/web build
```

固定 Git 对象不在浅克隆时，构建只向官方仓库获取所选提交，不移动产品分支。源码导出到忽略的 .cache/upstream-web 目录，制品写入 packages/web/dist。依赖使用本仓锁文件。默认构建 base 为 /remote/；KAYINGCODE_REMOTE_ORIGIN 可覆盖同源 Relay origin，不注入任何 secret。manifest 记录上游提交与核心源码/适配器/锁文件哈希。

推荐按 [Cloudflare Relay 部署](kayingcode-relay-cloudflare.md) 同源发布 Web、V2 Relay 和轻量账号服务：

```sh
pnpm --dir apps/kayingcode-relay-cloudflare deploy
```

自建域名时在构建环境设置 KAYINGCODE_REMOTE_ORIGIN=https://relay.example.com；Web、账号与 Relay 同源，不需要入口发现变量。正式入口 /remote/v4，由桌面生成完整参数及一次性 authorize fragment；授权适配器立即清除 fragment 并换取独立手机凭据。没有官方 OAuth，也不接受旧 Node 配对串。仅复制静态页面、只部署旧 Docker Relay 或只有 Vite dev server，均不足以提供此 V2 入口。

发布检查：/remote/v4 的 HTML 必须 200 且没有到 /remote/ 的重定向；manifest 与哈希 JS/CSS 可读；旧 /v1/client-config 与 /admin/ 返回 404；匿名 V2 device API 返回 401；health/ready 200。使用实际桌面新二维码验证授权、已有会话、移动布局及刷新；不要在真实会话发送验证消息。

Web 普通 server 模式仍来自官方入口，需要 packages/server 配套运行时；本次验收针对手机 V2 远控。生产不使用 Vite dev server 托管。
