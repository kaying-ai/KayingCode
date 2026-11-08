# HarmonyOS / OpenHarmony HAP 构建与多端 SDK 切换

本工程的鸿蒙应用使用 [CPF-Flutter 的 Flutter OH SDK](https://gitcode.com/CPF-Flutter/flutter_flutter) 与官方 `ohos/` 工程模板。Android/iOS 和鸿蒙共用 `lib/`，但构建时使用两套独立 Flutter SDK 与依赖解析目录。

> **发布前先选目标平台并运行 `node scripts/flutter-target.mjs <android|ios|ohos> check`。Android/iOS 固定使用项目 `.fvm/flutter_sdk` 中的上游 Flutter 3.35.5；鸿蒙固定使用独立 CPF-Flutter `3.35.8-ohos-1.0.4`。不要在应用根目录用鸿蒙 SDK 执行 `pub get`、`analyze` 或 `build hap`，也不要为切换平台修改 `.fvmrc`、根锁文件或全局 PATH。**

| 目标          | SDK 命令入口                                                                                                          | 依赖锁与构建缓存                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Android / iOS | Agent：`node scripts/flutter-target.mjs <android                                                                      | ios> ...`；人工开发可用 `fvm flutter ...`                                                                                      | 根 `pubspec.lock`、`.dart_tool/`、`build/` |
| 鸿蒙          | `node scripts/flutter-target.mjs ohos ...`，固定 tag/commit 见 [`ohos/flutter-sdk.json`](../../ohos/flutter-sdk.json) | [`ohos/flutter-pubspec.lock`](../../ohos/flutter-pubspec.lock)、`build/ohos-stage-*/`、`build/ohos-pub-cache/`；根锁文件不参与 |

## 1. 安装鸿蒙 SDK 和 DevEco 工具链

在应用目录之外克隆固定 tag；目录使用自己的绝对路径。3.35 系列 SDK 与 Engine 已在同一仓库，无需另克隆 Engine。

```bash
git clone --depth 1 --branch 3.35.8-ohos-1.0.4 \
  https://gitcode.com/CPF-Flutter/flutter_flutter.git \
  <鸿蒙 Flutter SDK 的绝对路径>
```

安装 DevEco Studio / Command Line Tools 与 HarmonyOS SDK。当前工程允许 **API 21 或 API 26 作为编译 SDK**：API 21 是原有基线；API 26 已在本机完成 `assembleHap` 的 ArkTS 编译与未签名打包。API 20 缺少 `AutoFillType` 等类型，API 23 已出现 ArkTS 编译错误，因此入口会拒绝。HAP 模板的**最低兼容设备 API 仍为 21**；API 26 编译成功不等于 API 21 真机运行已验收。完成 SDK 许可与签名配置后，指定包含 `default/` 的 **sdk 根目录**，其下应有 `default/sdk-pkg.json`。入口会自动把所选 DevEco 自带的 `ohpm`、`hvigorw`、`hdc` 放到子进程 PATH 前面，避免读取终端中旧版本的工具。工具链获取方式见[华为 Command Line Tools 下载指引](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-commandline-get)；Flutter 环境步骤见 [Flutter OH 环境搭建指导](https://gitcode.com/CPF-Flutter/flutter_samples/blob/master/docs/ohos/getting-started/flutter-oh-env-setup.md)。

首次配置本机绝对路径（把占位路径换成实际安装目录）：

```text
cd apps/kayingcode-mobile-flutter
node scripts/flutter-target.mjs ohos configure "<CPF Flutter SDK 绝对路径>" "<DevEco Studio 或 Command Line Tools 下的 sdk 绝对路径>"
node scripts/flutter-target.mjs ohos check
```

`configure` 核对 CPF Git commit 和所选 SDK 的 API/工具目录，将路径保存到被 Git 忽略的 `.local/ohos-toolchain.json`，供后续终端和 Agent 会话复用。CI 或临时覆盖可设置 `KAYING_FLUTTER_OH_SDK`、`DEVECO_SDK_HOME` 两个环境变量；它们优先于本机配置。不要把本机配置提交到仓库。

CPF Flutter 若曾通过 `flutter config --ohos-sdk` 保存旧 DevEco 路径，Flutter 会优先读取该全局设置。`ohos check` 会检测与本次选定 SDK 的冲突并停止，提示清除旧值；Agent 不会自动改动全局 Flutter 配置。清理后重新运行 `check`。

PowerShell 临时覆盖示例：

```powershell
$env:KAYING_FLUTTER_OH_SDK = '<CPF Flutter SDK 绝对路径>'
$env:DEVECO_SDK_HOME = '<DevEco SDK 根目录>'
node scripts/flutter-target.mjs ohos check
```

`check` 校验 Flutter SDK 的 Git commit、默认 HarmonyOS SDK 的编译 API 与配套工具，并输出 Flutter OH 版本；错误版本会立即失败。`analyze` 只检查 Dart 代码，不替代 `check` 和 HAP 编译。构建脚本为 Flutter 工具指定 Google 的普通 Engine 资源地址和 CPF-Flutter 的 OH Engine 资源地址。本机用普通 Flutter 镜像请求该版本的 `engine_stamp.json` 曾返回 404；不要通过修改 Android/iOS SDK 的缓存来绕过。

## 2. 构建和调试

```bash
node scripts/flutter-target.mjs ohos analyze  # 生成隔离工程并运行 Dart 静态检查
node scripts/flutter-target.mjs ohos debug    # 生成签名 Debug HAP
```

脚本从根 `pubspec.yaml` 生成鸿蒙专用依赖：CPF-Flutter 的 `shared_preferences`、`path_provider`、`image_picker`、`url_launcher`，鸿蒙版 `mobile_scanner`，以及鸿蒙安全存储和文件选择插件。插件 Git tag 固定在 [`scripts/build-ohos.mjs`](../../scripts/build-ohos.mjs)，解析结果固定在 [`ohos/flutter-pubspec.lock`](../../ohos/flutter-pubspec.lock)。正常构建强制使用该锁文件；有意升级依赖时先更新 spec 和插件 tag，再执行 `node scripts/build-ohos.mjs refresh-lock` 并审查锁文件差异。`file_picker` 与 `flutter_secure_storage` 在原应用仍使用 Android/iOS 插件；脚本仅在暂存工程中切换其导出点。每次重新准备暂存工程，根 `pubspec.lock`、`.fvmrc` 与 Android/iOS 插件依赖不变。

每次构建会创建新的 `build/ohos-stage-*/`，命令输出实际路径。`debug` 需要 DevEco 调试签名；无签名时 ArkTS 可以完成编译，但 Flutter HAP 命令不会报告可安装产物。可在 DevEco Studio 打开**输出路径下的 `ohos/`**，通过 `File > Project Structure > Signing Configs` 配置自动调试签名，再将该 `build-profile.json5` 保存到仓库外并设置 `KAYING_OHOS_SIGNING_PROFILE`，供下一次 `ohos debug` 复制到新的暂存工程。连接设备后用所选 SDK 的 `hdc install <HAP绝对路径>` 安装。需要检查暂存工程、或在 DevEco Studio 中打开它时先运行：

```bash
node scripts/flutter-target.mjs ohos prepare
```

## 3. Release 签名

`ohos/build-profile.json5` 保留可入库的模板，不包含证书与密码。在 DevEco Studio 中为 `ohos` 项目配置发行签名后，将生成的 `build-profile.json5` 保存到仓库外的本机位置，确保其中引用的签名文件路径在构建机上有效。构建脚本只把这个文件复制进暂存工程。

```powershell
$env:KAYING_OHOS_SIGNING_PROFILE = '<本机签名 build-profile.json5 的绝对路径>'
node scripts/flutter-target.mjs ohos release
```

缺少该变量时脚本会拒绝 Release 构建。HAP 的 `bundleName` 为 `com.lingdian.kayingai.agent.code`；暂存工程的 `versionName`、`versionCode` 从根 `pubspec.yaml` 的 `version` 同步。签名文件、证书、私钥、密码和构建产物均不得入库。发布前还需在鸿蒙真机完成安装、配对、会话和权限验证。

## 4. 返回 Android / iOS 构建

```text
cd apps/kayingcode-mobile-flutter
node scripts/flutter-target.mjs android check  # 或 ios check；必须显示上游 Flutter 3.35.5
node scripts/flutter-target.mjs android debug  # Android 调试 APK；iOS 在 macOS 上选 ios debug
```

Agent 入口不依赖全局 `fvm`，而是核对后直接使用项目 `.fvm/flutter_sdk`。人工开发和 Android AAB / iOS 高级发布参数继续按各平台发行指南使用 `fvm flutter`；无全局 `fvm` 时可直接调用 `.fvm/flutter_sdk/bin/flutter`。不要用 `fvm flutter build hap`；也不要把 CPF SDK 的 `bin` 放到 Android/iOS 构建终端的 PATH 前面。鸿蒙脚本以独立暂存工程解析依赖，返回 Android/iOS 时无需将鸿蒙插件写回根 `pubspec.lock`。

上游依赖需要重新解析时，运行 `node scripts/flutter-target.mjs android pub-get`（iOS 可选 `ios pub-get`）；该动作使用固定的上游 SDK、从根锁文件读取的包源和 `--enforce-lockfile`，避免机器级镜像配置在切换环境时重写根锁文件。若锁文件包源暂时无法联网，保留锁文件并等待网络恢复。静态分析、测试和标准构建分别用 `analyze`、`test`、`debug` 或 `release`。高级签名参数仍按各平台发行指南执行。

## 运行边界

- 鸿蒙首版复用前台 Bot 配对、工作区、会话、聊天、扫码与文件选取。`AppSession`、`KayingcodeAdapter` 和 `ConversationTransport` 继续处理手机 `web-remote-replayable` 的重连、快照和 gap repair。
- Android 的通知、前台服务、WakeLock 和电池优化请求只在 Android 可用。鸿蒙首版不承诺后台长连接或任务通知；这类能力需要独立的鸿蒙原生实现与真机验收。
- 相机权限用于扫码；照片和文件选择由对应鸿蒙插件处理。无相机或拒绝授权时仍可粘贴连接串添加设备。
- 本指南描述构建接入。实际 HAP 构建、签名及真机运行状态应以相应机器上的命令输出为准，不应把静态检查当作设备验收。
