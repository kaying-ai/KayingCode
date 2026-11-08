# kayingcode-site（产品网站）部署

> 应用目录：`apps/kayingcode-site`；包名 `kayingcode-product-site`。
> 返回 [部署汇总](../deploy.md)。

面向游戏开发者的单页静态产品站。**独立静态站点，不复用工作台业务运行时，也不托管 Web 工作台、Agent 或 Relay。**

---

## 1. 本地预览

```sh
pnpm --dir apps/kayingcode-site run dev
```

默认 `http://127.0.0.1:4173`，端口冲突时设置 `KAYINGCODE_SITE_PORT`。

## 2. 验证

```sh
pnpm --dir apps/kayingcode-site run test
```

覆盖静态服务器边界、工作流 Tab、键盘切换、中英文、明暗主题、移动导航、剪贴板反馈、不可用 localStorage 和响应式溢出。截图输出到仓库忽略的 `.tmp/site-preview/`。

> 该应用**没有 `build` 脚本**（纯静态资源 + 测试），验证入口是 `test`。

## 3. 部署

部署以下静态文件即可：

- `index.html`
- `site.css`
- `site.js`
- `content.js`
- `assets/kayingcode-logo.png`
- `assets/island-concept.png`

`dev.mjs`、`test/` 和 `tools/` 只用于本地预览、验证和桌面应用截图，**不需要发布**。

| 检查点    | 期望                           |
| --------- | ------------------------------ |
| 首屏      | 深色产品长页正常渲染，默认中文 |
| 主题/语言 | 切换英文与浅色主题正常         |
| 移动导航  | 窄屏导航与响应式无溢出         |
| 静态边界  | 不发起工作台/Agent/Relay 请求  |

## 4. 内容边界

- 产品事实以根 `README.md`、当前源码和产品测试为准。
- 首页与流程区的岛屿图片是概念占位图，阶段切换是产品流程示意，不执行真实 Agent、构建或发布，也不代表真实游戏画面。
- 游戏原生预览、双预览与本机控制限定于本地 Desktop；模型和 TapTap 平台请求仍按用户配置与授权访问网络。

素材来源、生成提示和许可说明见 `apps/kayingcode-site/assets/README.md`。

## 5. 源码依据

- `apps/kayingcode-site/README.md`、`package.json`、`dev.mjs`、`content.js`
