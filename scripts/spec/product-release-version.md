# 产品发布版本

- 根 `package.json` 的 `version` 是桌面、统一运行包、独立 CLI、Taro 和 Flutter 同批发版的产品版本。CLI 与 Taro 在各自的 `package.json` 声明该版本，Flutter 在 `pubspec.yaml` 声明该版本及正整数 build number。Taro 展示值和 Flutter 展示版本的默认值都使用同一产品版本。
- Flutter build number 随发布构建递增，由 Flutter 清单维护。正式打包时如果注入 `APP_VERSION`，其值也应与产品版本一致。官方插件继续使用各自的发行版本。
- `node --test scripts/first-public-release.test.mjs` 从当前根清单读取目标版本，检查各端声明、Flutter 展示版本、build number 和安装标识。Taro 的 `appVersion.test.ts` 校验展示值和本端清单。版本漂移或 Flutter build number 缺失、无效时相应检查失败。
- 先更新本批版本，再运行 `node scripts/licenses.mjs notices` 和显式许可检查，确保生成清单记录的是准备交付的清单输入。签名、商店构建编号占用情况和制品验收由对应发布流程核对。

## macOS 正式签名构建

- 维护者从正式 `kaying-code-v<版本>` 标签手动运行 `Build signed macOS release`。校验任务先确认标签版本与根清单一致，且提交属于 `origin/main` 的历史。通过后，Intel 与 Apple Silicon 两个构建任务各自使用 `macos-release` 环境。
- GitHub Environment 保管证书和公证凭据。构建任务将 Developer ID Application 导入临时钥匙串，再调用现有 `bundle:desktop`。这样随包 Computer Use 插件、桌面应用和 DMG 都能使用发行身份。公证继续由现有 DMG hook 完成。
- 只有通过 DMG 签名校验和公证票据校验的制品才上传到本次 Actions 运行。Release 由维护者在完成安装验收后发布。

```text
正式标签 → 版本与 main 祖先校验 → macos-release 环境 → 签名与公证 → 验签 → Actions DMG
```
