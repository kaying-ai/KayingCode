# Android APK 产物命名

## 行为

- Android Release APK 使用与 Electron 相同的产物字段顺序：`产品名-版本-平台-架构.apk`。
- 当前名称为 `KayingCode-<pubspec 版本>-android-universal.apk`；`+` 后的 Android build number 不进入展示版本名。
- Debug APK 使用相同名称并追加 `-debug`，避免与可发行的 Release APK 混淆。
- APK 命名由 Flutter 应用内的 Android 构建脚本负责。Flutter 仍负责构建 APK、Gradle 仍负责签名；脚本只在成功构建后将标准输出文件重命名到版本化名称。
- `universal` 表示默认未使用 `--split-per-abi` 的 APK。若未来改为 ABI 分包，应在 spec 中定义每个 ABI 的名称后再改构建行为。

## 所有者与边界

- 产品名称固定为 `KayingCode`，遵循 Electron `buildDesktopArtifactName` 的命名字段顺序。
- 版本唯一来源是 `pubspec.yaml` 的 `version` 字段，展示版本取 `+` 前部分。
- 仓库发布一致性检查校验展示版本与产品版本一致，并要求 build number 为正整数；同一展示版本的后续构建可递增 build number，不固定为首次构建的 `1`。
- Flutter build 命令负责生成 `app-release.apk` 或 `app-debug.apk`；命名脚本只处理对应的 APK 和 Flutter 生成的可选 `.sha1` sidecar。
- Release keystore、凭据、Android applicationId、签名规则和 iOS 产物不由本命名行为管理。

## 验收场景

1. 执行 Android Release 构建脚本后，标准 `app-release.apk` 被命名为 `KayingCode-<version>-android-universal.apk`。
2. 执行 Android Debug 构建脚本后，产物命名为 `KayingCode-<version>-android-universal-debug.apk`。
3. Flutter 构建失败时脚本返回失败，且不把旧 APK 误报为本次产物。
4. `pubspec.yaml` 版本含 build number 时，文件名只使用 `+` 前的版本。
