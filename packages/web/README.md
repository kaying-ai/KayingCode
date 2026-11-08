# 官方 Web 制品

本包的工作台直接来自官方 [zai-org/ZCode](https://github.com/zai-org/ZCode)，固定提交见 `upstream-web.json`。构建会导出固定源码到根 `.cache/upstream-web/<commit>`，工作台、Root、共享 UI 和连接逻辑均使用该导出，不解析到本仓裁剪后的 UI。上游依赖使用本仓 pnpm 锁定的浏览器依赖，补充的构建依赖在本包登记。

账号适配为 `src/auth/webAuthService.ts`、`src/auth/WebLoginPage.tsx` 和加载它们的 HTML bootstrap。品牌适配由 `scripts/apply-upstream-branding.mjs` 将明确列出的纯 Logo 函数、资产、页头和标题字面量替换为 KayingCode；复用现有品牌派生文件，manifest 记录前后哈希。账号由自建 Cloudflare 服务提供，扫码换取独立终端凭据；不接官方 OAuth。禁止覆盖工作台业务行为、composer 或上游连接逻辑。源码不复制入产品目录。

导出与补丁统一由 `scripts/stage-upstream-web.mjs` 执行，`.cache/upstream-web/<commit>/.stage-state.json` 记录输入指纹，指纹一致时复用。`packages/web-share`（`/cn/share/` 分享页）复用同一份导出构建，只保留 localrun 入口覆盖，规则见 `packages/web-share/spec/upstream-share-build.md`。

- `pnpm --filter @zcode/web build`：构建 `/remote/` 制品到本包 dist。
- `pnpm --filter @zcode/web dev`：导出同一源码并启动官方 Vite Web。
- `pnpm --filter @zcode/web-share build`：复用同一份导出构建 `/cn/share/` 分享页。
- `pnpm --filter @zcode/web test`：验证本仓账号适配器。
- `node packages/web/test/branding.e2e.mjs`：构建后在本地浏览器检查 JS 前首屏、React 加载、连接品牌、深浅主题和手机/桌面首页；结果位于 `.tmp/web-branding/`。
- `UPSTREAM_WEB_E2E_CDP=http://127.0.0.1:9229 pnpm --filter @zcode/web test:e2e`：在已运行且有历史会话的本仓 Desktop 上验证扫码、官方手机布局、会话读取与刷新恢复。需要 agent-browser 与其可用浏览器；测试不发送消息，退出时注销测试浏览器凭据。CDP 必须为本机地址。

Cloudflare 的 `build:web` 调用此构建后复制静态制品；发布通过该应用的 deploy 命令完成。修改账号/V2 服务时先更新本包 spec 与 Cloudflare spec 并验证真实 RPC，而不是修改官方页面绕过服务缺失。
