# 产品发布版本

- 根 `package.json` 的 `version` 是桌面、统一运行包、独立 CLI、Taro 和 Flutter 同批发版的产品版本。CLI 与 Taro 在各自的 `package.json` 声明该版本，Flutter 在 `pubspec.yaml` 声明该版本及正整数 build number。Taro 展示值和 Flutter 展示版本的默认值都使用同一产品版本。
- Flutter build number 随发布构建递增，由 Flutter 清单维护。正式打包时如果注入 `APP_VERSION`，其值也应与产品版本一致。官方插件继续使用各自的发行版本。
- `node --test scripts/first-public-release.test.mjs` 从当前根清单读取目标版本，检查各端声明、Flutter 展示版本、build number 和安装标识。Taro 的 `appVersion.test.ts` 校验展示值和本端清单。版本漂移或 Flutter build number 缺失、无效时相应检查失败。
- 先更新本批版本，再运行 `node scripts/licenses.mjs notices` 和显式许可检查，确保生成清单记录的是准备交付的清单输入。签名、商店构建编号占用情况和制品验收由对应发布流程核对。

## GitHub 构建制品

- GitHub Actions 管理每次构建及其制品。推送 `kaying-code-v<版本>` 标签自动构建全部目标，也可手动选择桌面、移动或全部目标。正式标签必须指向 `origin/main` 的历史，且版本必须与根清单一致。每次运行先检查各端版本和安装标识，再启动目标任务。
- 在合并前，可从主题分支推送 `kaying-code-test-v<版本>-<提交 SHA 前 12 位>` 标签触发同一验收矩阵。测试标签校验版本和所指提交的 SHA，不要求提交已进入 `main`。正式标签继续执行 `main` 祖先检查。
- 桌面使用原生 runner，复用 `pnpm run bundle:desktop`。矩阵为 Windows x64、macOS x64/arm64 和 Linux x64/arm64。Windows 从固定上游发行取得源码快照中未收录的 ripgrep 归档，由现有准备脚本核对摘要及架构。打包使用 Preview 安装身份，跳过独立的远端资源 staging。
- Flutter 使用 `flutter-target.mjs`，按项目固定的上游 SDK 依次检查版本、按锁文件解析依赖和构建。Android 生成调试 APK，iOS 生成模拟器 `.app` 并打包保留文件权限。鸿蒙使用独立的 CPF-Flutter 和 DevEco 工具链，由现行平台发布流程负责。
- 构建使用只读仓库权限，各目标独立运行。每个成功任务将对应制品上传到本次 Actions 运行。失败保留在对应目标的状态，缺少预期制品视为失败。签名、公证、实机验收和正式发布由对应平台流程负责。

```text
标签推送 / 手动触发 → 校验提交及版本 → 原生平台 runner 构建 → 本次运行的 Actions Artifacts
```
