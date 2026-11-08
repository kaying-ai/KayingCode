# 开发态 React Scan 工具开关

## 规则

- React Scan 只在 Vite 开发服务器（`command === "serve"` 且非 production mode）可用。
- 默认关闭：未设置或设置为 `0` 时不注入脚本，不显示 FPS 工具条，也不增加渲染观察开销。
- 需要时显式设置 `KAYINGCODE_REACT_SCAN=1` 开启；shell 环境变量或仓库根 `.env.local` 均可。
- 所有 build（包括 production 构建）永不注入 React Scan。

## 配置入口

```bash
# 单次开发启动
KAYINGCODE_REACT_SCAN=1 pnpm run dev:desktop:test

# 或写入仓库根 .env.local（已被 .gitignore 忽略）
KAYINGCODE_REACT_SCAN=1
```

## 验收场景

1. `pnpm run dev:desktop:test` 默认启动，页面 `index.html` 不含 `react-scan`，右下角无 FPS 工具条。
2. 设置 `KAYINGCODE_REACT_SCAN=1` 后启动，脚本在 React 之前加载，工具条与渲染观察可用。
3. 设置 `KAYINGCODE_REACT_SCAN=0` 保持关闭。
4. production build 不包含 React Scan 模块或脚本。

回归入口：`node --import tsx --test packages/desktop/test/e2e/manual-review/pending/react-scan-dev.test.mjs`。
