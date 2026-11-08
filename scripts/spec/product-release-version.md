# 产品发布版本

- 根 `package.json` 的 `version` 是桌面、统一运行包、独立 CLI、Taro 和 Flutter 同批发版的产品版本。CLI 与 Taro 在各自的 `package.json` 声明该版本，Flutter 在 `pubspec.yaml` 声明该版本及正整数 build number。Taro 展示值和 Flutter 展示版本的默认值都使用同一产品版本。
- Flutter build number 随发布构建递增，由 Flutter 清单维护。正式打包时如果注入 `APP_VERSION`，其值也应与产品版本一致。官方插件继续使用各自的发行版本。
- `node --test scripts/first-public-release.test.mjs` 从当前根清单读取目标版本，检查各端声明、Flutter 展示版本、build number 和安装标识。Taro 的 `appVersion.test.ts` 校验展示值和本端清单。版本漂移或 Flutter build number 缺失、无效时相应检查失败。
- 先更新本批版本，再运行 `node scripts/licenses.mjs notices` 和显式许可检查，确保生成清单记录的是准备交付的清单输入。签名、商店构建编号占用情况和制品验收由对应发布流程核对。

## Linux 桌面发行签名

- Linux 正式包工作流以 `kaying-code-v<根版本>` 标签且该提交属于 `origin/main` 为前提，分别在 x64 与 arm64 Linux runner 构建生产身份的桌面发行物。预验收仅允许 `kaying-code-preflight-v<根版本>-<目标提交前12位SHA>` 标签，并要求目标为 main 的祖先；正式和预验收使用同一签名流程，但 Actions 制品名称包含 `release` 或 `preflight`，避免混淆。一般测试构建不获得发行私钥。
- `linux-release` 环境拥有 GPG 私钥与口令；工作流仅在构建完成后读取，隔离钥匙目录中导入，校验私钥指纹与仓库公开公钥一致。签名或校验失败不得上传发行文件。
- 每种架构的 `.AppImage`、`.deb`、`.rpm` 和 `.pkg.tar.zst` 必须齐全；文件名使用 electron-builder `getArtifactArchName` 的实际架构名：x64 对应 AppImage/rpm 的 x86_64、deb 的 amd64 与 pacman 的 x64，arm64 对应 AppImage/deb 的 arm64 与 rpm/pacman 的 aarch64，不重命名原始包；以稳定的文件名顺序生成 SHA-256 清单，对清单生成 ASCII GPG 分离签名并用公开公钥验证。上传安装包、清单、签名及公开公钥供下载验签；该签名不等于包管理器的原生仓库签名。
- 工作流只上传 Actions 制品；正式发布人员核验后将其上传到对应 Release。该流程不修改 GitHub Release 或创建标签。

- 在创建正式标签前，以同一 main 提交执行预验收并检查两种架构的构建、签名及安装包；仅对该次预验收的精确标签临时放行 `linux-release` 环境，结束后移除该规则。正式发布仍使用同一提交的正式标签。

## macOS 正式签名构建

- 维护者从正式 `kaying-code-v<版本>` 标签或提交绑定的预验收标签手动运行 `Build signed macOS release`；预验收环境仅临时允许具体标签，制品名区分预验收和正式。校验任务先确认标签版本与根清单一致，且提交属于 `origin/main` 的历史。通过后，Intel 与 Apple Silicon 两个构建任务各自使用 `macos-release` 环境。
- GitHub Environment 保管证书和公证凭据。构建任务将 Developer ID Application 导入临时钥匙串，再调用现有 `bundle:desktop`。这样随包 Computer Use 插件、桌面应用和 DMG 都能使用发行身份。公证继续由现有 DMG hook 完成。
- 只有通过 DMG 签名校验和公证票据校验的制品才上传到本次 Actions 运行。Release 由维护者在完成安装验收后发布。

```text
正式标签 → 版本与 main 祖先校验 → macos-release 环境 → 签名与公证 → 验签 → Actions DMG
```

## Windows 与 Android 正式签名构建

- 使用与 Linux 相同的提交绑定标签校验，Windows、Android 分别由对应受保护环境提供发行凭据。预验收仅临时放行精确标签并区分制品名称。
- Windows 使用既有 Electron 打包入口及 WIN_CSC 环境证书，验证安装器的 Authenticode 签名有效才上传。Android 通过 Flutter 目标入口检查固定 SDK 后构建 release APK，以 apksigner 验证签名成功后上传；缺失凭据或校验失败不得退化为未签名或 debug 包。
- 预验收与正式构建均只上传 Actions 制品，不创建 Release 或标签；所有目标验收通过后正式标签指向同一 main 提交。
