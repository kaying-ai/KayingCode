# KayingCode Taro 移动壳

工程提供 H5 与微信小程序。自托管授权链接直接打开固定上游 Web，容器不维护另一套 KayingCode 聊天业务。上游 ZCode 在 H5 也打开 Web；微信渠道使用原生 V2 OAuth/ws2 与现有会话桥。旧 Node 配对、审核、attachment 双腿和 hash/t 已移除。

从桌面左下角手机入口复制新的完整 HTTPS V2 授权链接，保存 Bot 后点击打开。Web 单次消费邀请，管理终端登录、工作区、会话与恢复。外壳只拥有本地档案、页面导航、主题与 WebView 生命周期，核心协议和账本位于 `packages/mobile-client-core`。

```text
src/pages/home        Bot / 会话 / 我的
src/pages/zcode-web   完整 Web 链接容器，路由只传本地档案 ID
src/flow/zcode*       上游 V2 原生连接、导航与 Web 入口
src/flow/store.ts     连接与 UI 线索
src/ports            Taro 存储、HTTP、SocketTask 平台适配
```

## 开发与构建

在仓库根目录使用 mise.toml 指定的 Node/pnpm，统一安装依赖，不生成应用独立锁文件：

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
pnpm --filter @kayingcode/mobile typecheck
pnpm --filter @kayingcode/mobile test
pnpm --filter @kayingcode/mobile build:h5
pnpm --filter @kayingcode/mobile build:weapp
```

输出为本应用 `dist/h5`、`dist/weapp`。开发命令为 `dev:h5`、`dev:weapp`。微信 AppID 在 `project.config.json`，用微信开发者工具打开 weapp 产物，并配置实际 request/socket/WebView 合法域名；微信平台资格及真机授权需实际验收，构建成功不代表连通。

H5 WebView E2E：先 build:h5，再执行 `node apps/kayingcode-mobile-taro/scripts/kayingcode-web-h5.e2e.mjs`。该场景使用受控 HTTPS 页面替身，验证三入口、布局、刷新、错误重试与无原生协议调用；真实会话链路由 Cloudflare 与 Web 集成覆盖。

规则见 [当前接入 spec](spec/legacy-relay-retirement.md)、[WebView spec](spec/zcode-webview.md)，服务部署见 [Cloudflare 教程](../../docs/deploy/kayingcode-relay-cloudflare.md)。
