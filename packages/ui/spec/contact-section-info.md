# 联系我们页信息面板

## 产品规则

- 设置 → 联系我们保持两栏：左侧客服二维码，右侧信息面板。
- 右侧信息面板在官网入口下方展示三项只读信息：
  1. 联系邮箱 `service@kayingai.com`
  2. KayingCode 构建版本号（产品版本，来自构建注入的 `KAYINGCODE_VERSION`）
  3. ZCode 构建版本号（已验收的官方上游基线版本，来自 `UPSTREAM_BASE.json`）
- 版本值随构建变化，不在 UI 内硬编码；缺失元数据时回退显示 `unknown`。

## 数据所有者与接口

- KayingCode 版本：`packages/shared/src/version.ts` 的 `KAYINGCODE_VERSION`，由各 bundler 的 define 注入。
- ZCode 上游版本：新增 `ZCODE_UPSTREAM_VERSION`，构建期由 `scripts/upstream-version.mjs` 读取 `UPSTREAM_BASE.json` 的 `version` 注入；与 `ZCODE_VERSION`（兼容旧协议，仍等于产品版本）区分。
- 联系邮箱是稳定的产品常量，不需要新增服务、持久化或网络请求。

## 验收场景

1. 中文和英文下，右侧面板依次显示联系邮箱、KayingCode 构建版本号、ZCode 构建版本号。
2. 邮箱与版本值可选中复制；长版本号在窄栏内换行，不撑破卡片。
3. 桌面构建显示实际产品版本和上游基线版本（如 `0.1.1` / `3.17.2`），不显示 `0.0.0-dev`。
4. 官网标题、提示、地址与访问按钮保持原有行为。
