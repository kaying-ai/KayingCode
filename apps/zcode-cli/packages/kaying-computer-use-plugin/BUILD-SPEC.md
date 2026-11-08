# Computer Use 原生构建边界

## 规则与所有者

- `vendor/kaying-computer-use/Package.swift` 只登记当前仓库实际包含的 Swift 源码 target。公开构建交付 `OpenComputerUseKit` 和 `OpenComputerUse`；被移除的 fixture、smoke 和实验 target 不进入公开包清单。
- `scripts/build-native-runtime.mjs` 是插件原生构建入口，按目标平台产出 `native/<platform>-<arch>/`，并由现有 `verify-package.mjs` 校验。Desktop 只通过该入口准备插件运行时，不复制第二套构建清单。
- 本文约束构建清单与源码的对应关系；Windows 工作过程展示规则见 [`specs/visual-feedback.md`](specs/visual-feedback.md)，macOS 见 [`specs/macos-visual-feedback.md`](specs/macos-visual-feedback.md)。
- Windows 原生源码变更后必须重新编译并更新已受版本控制的 `native/win32-x64/kaying-computer-use.exe`。默认 `build:native` 会复用已存在的制品，出现 `reuse staged runtime` 不构成源码重编译验收；维护者需先编译 vendor，再通过现有 `--from-dist <目录>` 入口回填并校验。

## 失败语义与验收

- 如果公开运行 target 的源码缺失，Swift 构建必须失败；不得生成空实现代替。
- macOS 执行 `bun run --filter @kayingcode/kayingcode-cua-plugin build:native` 应产出并校验 `.app`；Desktop 完整 `build` 不再因已删除 target 的路径报错。
- 联调开发构建可显式设置 `KAYING_COMPUTER_USE_CODESIGN_MODE=adhoc`，避免本机多个同名 Developer ID 导致身份歧义；该结果不构成正式签名或公证验收。
- Swift `.build` 缓存与本地 macOS `native/` 下的 `.app` 是可再生构建产物，不纳入源码提交；Windows 已登记的预编译 `.exe` 随源码更新。
- `swift package dump-package` 中不应出现本仓库没有源码目录的 target；插件测试与根类型、Lint、架构检查按实际结果报告。
