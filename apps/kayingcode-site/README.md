# KayingCode 产品网站

面向游戏开发者的单页产品站。首页采用深色产品长页，先展示 KayingCode 与“把游戏想法，做成可玩的作品”，再展示开发循环、预览验证、TapTap Maker、工作台底座与源码启动。默认中文、深色主题，支持英文和浅色主题。

## 本地预览

在 `apps/kayingcode-site/` 目录执行：

```bash
pnpm run dev
```

默认地址为 `http://127.0.0.1:4173`。也可以从仓库根目录运行 `pnpm --dir apps/kayingcode-site run dev`。端口冲突时设置 `KAYINGCODE_SITE_PORT`。

## 验证

```bash
pnpm --dir apps/kayingcode-site run test
```

测试覆盖静态服务器边界、工作流 Tab、键盘切换、中英文、明暗主题、移动导航、剪贴板反馈、不可用 localStorage 和响应式溢出。截图输出到仓库忽略的 `.tmp/site-preview/`。

## 部署

部署以下静态文件即可：

- `index.html`
- `site.css`
- `site.js`
- `content.js`
- `assets/kayingcode-logo.png`
- `assets/island-concept.png`

`dev.mjs`、`test/` 和 `tools/` 只用于本地预览、验证和桌面应用截图，不需要发布。

## 内容边界

- 产品事实以根 `README.md`、当前源码和产品测试为准。
- 首页与流程区的岛屿图片是概念占位图，阶段切换是产品流程示意，不执行真实 Agent、构建或发布，也不代表真实游戏画面。
- 游戏原生预览、双预览与本机控制限定于本地 Desktop；模型和 TapTap 平台请求仍按用户配置与授权访问网络。

素材来源、生成提示和许可说明见 [assets/README.md](assets/README.md)。
