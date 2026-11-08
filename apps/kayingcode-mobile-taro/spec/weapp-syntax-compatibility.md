# 微信小程序构建语法兼容

## 产品规则

- `weapp` 产物必须能被微信开发者工具直接解析和预览，不依赖开发者工具额外开启 ES6 转 ES5、增强编译或运行时语法插件。
- 小程序兼容目标固定为 ES2019；`?.`、`??`、逻辑赋值和 class 私有字段等更新语法必须在构建期降级。
- 业务源码和随包依赖遵守同一目标。Taro 默认只让 `sourceRoot`、Taro 包与显式 `mini.compile.include` 中的脚本经过 Babel，因此仅出现在 `node_modules` 的运行时依赖必须显式加入小程序编译范围。
- H5 构建保持现有现代浏览器目标，不为小程序兼容引入全局 TypeScript 或 Babel target 变更。

## 状态与接口

- `apps/kayingcode-mobile-taro/babel.config.js` 是 Taro Babel 目标的唯一配置点；仅当 `TARO_ENV=weapp` 时声明 ES2019 等价目标。
- `apps/kayingcode-mobile-taro/config/index.ts` 是依赖编译范围的唯一配置点；Zod 的脚本通过 `mini.compile.include` 进入 Babel。
- `bun run build:weapp` 在 Taro 构建完成后调用 `verify:weapp-syntax`，以 ES2019 parser 校验所有输出脚本。任一脚本含更新语法时构建失败并报告文件名与位置。

## 失败语义

- Babel 未处理依赖或产物重新出现更新语法时，`build:weapp` 必须失败，不能把可能无法在微信开发者工具中解析的产物当作成功。
- 校验只读取 `dist/weapp` 下的 JavaScript 产物，不修改文件，也不改变小程序运行时连接或会话状态。

## 验收场景

1. 执行 `bun run --cwd apps/kayingcode-mobile-taro build:weapp` 成功，且 `dist/weapp/vendors.js` 不再包含 `?.` 或 `??`。
2. 微信开发者工具使用当前 `project.config.json`（关闭 ES6 转换与增强编译）预览时，不再出现 `vendors.js` 的 `Unexpected token :`。
3. `dist/weapp` 下全部 JavaScript 文件均可被 ES2019 parser 解析；校验失败时命令返回非零状态。
4. H5 构建与 `tsconfig.base.json` 保持原有目标，不受小程序兼容配置影响。
