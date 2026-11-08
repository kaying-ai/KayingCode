# Agent 指令

这里是 KayingCode 手机端 Flutter 客户端（私有 Dart 包名 `kayingcode_mobile`，安装身份 `com.lingdian.kayingai.agent.code`）。Android、iOS、Windows 与鸿蒙工程共用 Dart UI。通用规则遵循[根 AGENTS.md](../../AGENTS.md)；本文件补充本工程的工具链、构建与验证规则。

## ⚠️ 多端 Flutter SDK 切换（每次构建前必读）

| 目标 | Agent 入口与 SDK | 依赖与构建目录 |
| --- | --- | --- |
| Android / iOS | `node scripts/flutter-target.mjs <android|ios> ...`；读取项目 `.fvm/flutter_sdk`，固定上游 Flutter **3.35.5** | 应用根 `pubspec.lock`、`.dart_tool/`、`build/` |
| Windows 竖屏体验版 | `node scripts/flutter-target.mjs windows ...`；同一上游 Flutter **3.35.5**，需要 Visual Studio C++ 与 WebView2 | 应用根锁文件与 `build/windows/`；初始客户区 450×800 |
| HarmonyOS / OpenHarmony | `node scripts/flutter-target.mjs ohos ...`；委托 CPF-Flutter **`3.35.8-ohos-1.0.4`** 构建入口 | 每次独立 `build/ohos-stage-*/` 与 `build/ohos-pub-cache/` |

- **每次换目标先运行 `node scripts/flutter-target.mjs <目标> check`。** Android/iOS 无需全局 `fvm` 命令；Agent 入口核对 `.fvmrc`、`.flutter-version` 与 `.fvm/flutter_sdk` 的实际版本。鸿蒙本机路径首次用 `node scripts/flutter-target.mjs ohos configure <CPF-SDK绝对路径> <DevEco-sdk绝对路径>` 保存到被忽略的 `.local/ohos-toolchain.json`；环境变量 `KAYING_FLUTTER_OH_SDK`、`DEVECO_SDK_HOME` 可覆盖本机配置。
- **禁止用 `fvm flutter build hap`、系统 PATH 上的 `flutter` 或上游 Flutter 构建鸿蒙；禁止为了鸿蒙执行 `fvm use <ohos版本>` 或改写 `.fvmrc`。** 鸿蒙构建入口核对 CPF SDK 的固定 Git commit，优先使用所选 DevEco 的 `ohpm/hvigorw/hdc`，并为鸿蒙插件生成独立暂存工程。
- **禁止在本应用根目录直接运行 CPF Flutter 的 `pub get`、`analyze`、`build hap`。** 这会污染 Android/iOS 锁文件与缓存。返回 Android/iOS 时先运行对应的 `node scripts/flutter-target.mjs <android|ios> check`，确认上游 Flutter 3.35.5。
- 鸿蒙 SDK 的固定 tag/commit、最低设备 API **21** 与允许编译 API **21/26** 见 [`ohos/flutter-sdk.json`](ohos/flutter-sdk.json)，解析结果固定在 [`ohos/flutter-pubspec.lock`](ohos/flutter-pubspec.lock)；安装、签名和多端发布步骤见 [`docs/release/ohos.md`](docs/release/ohos.md)。API 20 和 API 23 不匹配当前 Flutter OH 引擎；API 26 已完成未签名 `assembleHap` 编译，设备运行和签名仍须实际验证。SDK 与插件版本变更先更新 [`spec/ohos-platform.md`](spec/ohos-platform.md)，再用 `node scripts/flutter-target.mjs ohos refresh-lock` 刷新并审查鸿蒙锁文件。

## 工具链（最重要）

- Android/iOS 使用 **上游 Flutter 3.35.5**，版本由已入库的 [.fvmrc](.fvmrc) 与 [.flutter-version](.flutter-version) 钉住。Agent 使用 `flutter-target.mjs`；人工开发可继续使用 `fvm flutter ...` / `fvm dart ...`。不要用 PATH 里的全局 `flutter`：混用会污染构建缓存（见下一节）。
- 首次或换机执行 `fvm use 3.35.5`；本工程已提交 `.fvmrc`，之后直接用 `fvm flutter ...` 即可。
- Android/iOS 需要正式升级版本时才用 `fvm use <version>` 并把 `.fvmrc` 一起提交；鸿蒙 SDK 的切换仅修改独立路径 `KAYING_FLUTTER_OH_SDK`，不改 Android/iOS 的 FVM 配置。

## 版本混用的症状与恢复

- 典型症状是 iOS 构建报 Swift 预编译头过期，例如：
  `File '.../Debug-iphonesimulator/Flutter.framework/Headers/FlutterPlugin.h' has been modified since the precompiled header '...Runner-primary-Bridging-header.pch' was built: size changed (was … , now …)`。
  原因：`build/ios/.../Flutter.framework` 会随构建被替换成**执行命令的那个 Flutter 版本**的 header，而 Xcode 的 PCH 缓存仍是按上一个版本生成的，两者对不上就报这个错（PCH 里的 header 大小与当前 header 不一致）。
- 恢复顺序：`fvm flutter clean` → 删除本工程对应的 `~/Library/Developer/Xcode/DerivedData/Runner-*` → `node scripts/flutter-target.mjs ios pub-get` → 重新构建。
- **只删 DerivedData 或只 `flutter clean` 都可能不够**：framework 与 PCH 必须来自同一个 Flutter 版本。删 DerivedData 只是丢掉缓存（Xcode 会重建），不影响其他仓库代码。
- 定位本工程的 DerivedData：`ls -td ~/Library/Developer/Xcode/DerivedData/Runner-* | head -1` 取最近构建的那个（本检出为 `Runner-estvhlmelaufzocesfatdlbejalx`，hash 由工程绝对路径决定，换目录后不同）；拿不准就把 `Runner-*` 一起清掉。

## 常用命令

| 用途             | 命令                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 拉依赖           | `node scripts/flutter-target.mjs <android|ios> pub-get`（强制现有锁文件；子进程包源自动对齐锁文件） |
| 静态检查         | `node scripts/flutter-target.mjs <android|ios> analyze`（期望 `No issues found`） |
| 单元/widget 测试 | `node scripts/flutter-target.mjs <android|ios> test` |
| 构建模拟器产物   | macOS：`node scripts/flutter-target.mjs ios debug` |
| 开发运行         | 人工开发可用 `fvm flutter run -d <ios-simulator-uuid>`（终端 `r` 热重载、`R` 热重启、`q` 退出） |
| Android/iOS 环境核对 | `node scripts/flutter-target.mjs <android|ios> check`（不依赖全局 `fvm`） |
| Android APK | `node scripts/flutter-target.mjs android <debug|release>`（沿用 APK 命名与签名规则） |
| iOS 构建 | 在 macOS 上 `node scripts/flutter-target.mjs ios <debug|release>` |
| 鸿蒙环境核对 | `node scripts/flutter-target.mjs ohos check`（首次先 `configure`） |
| 鸿蒙静态检查 | `node scripts/flutter-target.mjs ohos analyze`（独立暂存工程） |
| 鸿蒙 Debug HAP | `node scripts/flutter-target.mjs ohos debug`（独立暂存工程；需调试签名） |
| 鸿蒙 Release HAP | `node scripts/flutter-target.mjs ohos release`（需本机 `KAYING_OHOS_SIGNING_PROFILE`） |

- 模拟器 UUID 用 `xcrun simctl list devices booted` 查，不要写死：同名设备可能有多个系统版本。
- 不在终端里挂着 `flutter run` 时可用 `xcrun simctl install booted build/ios/iphonesimulator/Runner.app` + `xcrun simctl launch booted com.lingdian.kayingai.agent.code` 验证构建产物；这种方式**不带热重载**。`simctl install` 会保留 App 数据容器，设备列表与安全存储里的凭据不会因此丢失。
- Xcode 调试打开 `ios/Runner.xcworkspace`，不要只打开 `Runner.xcodeproj`。
- 模拟器不需要签名；真机签名由开发者在 Xcode 自行配置，个人 Team 不入库。

## 验证与边界

- 行为改动先在本应用内更新对应 spec 再改代码；iOS、视觉与主题、设备凭据和设备身份的现行边界均须以当前代码与测试复核。
- 当前检出的测试只有 `test/**/*.dart`（含连接、凭据、重启与配对生命周期用例）。README 里出现的 `integration_test/ios_smoke_test.dart` 在本检出中不存在，不要照抄该命令。
- Pods、Flutter 生成配置、`build/`、鸿蒙签名材料与模拟器数据不入库；保留 `Podfile.lock` 以便复现。
- 如实记录执行过的命令、真实输出和未验证范围；环境受限或已有失败不得写成通过。
