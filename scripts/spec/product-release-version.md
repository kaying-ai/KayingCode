# 产品发布版本

- 根 `package.json` 的 `version` 是桌面、统一运行包、独立 CLI、Taro 和 Flutter 同批发版的产品版本。CLI 与 Taro 在各自的 `package.json` 声明该版本，Flutter 在 `pubspec.yaml` 声明该版本及正整数 build number。Taro 展示值和 Flutter 展示版本的默认值都使用同一产品版本。
- Flutter build number 随发布构建递增，由 Flutter 清单维护。正式打包时如果注入 `APP_VERSION`，其值也应与产品版本一致。官方插件继续使用各自的发行版本。
- `node --test scripts/first-public-release.test.mjs` 从当前根清单读取目标版本，检查各端声明、Flutter 展示版本、build number 和安装标识。Taro 的 `appVersion.test.ts` 校验展示值和本端清单。版本漂移或 Flutter build number 缺失、无效时相应检查失败。
- 先更新本批版本，再运行 `node scripts/licenses.mjs notices` 和显式许可检查，确保生成清单记录的是准备交付的清单输入。签名、商店构建编号占用情况和制品验收由对应发布流程核对。

## Linux 桌面发行签名

- Linux 正式包工作流以 `kaying-code-v<根版本>` 标签且该提交属于 `origin/main` 为前提，分别在 x64 与 arm64 Linux runner 构建生产身份的桌面发行物。测试构建不获得发行私钥。
- `linux-release` 环境拥有 GPG 私钥与口令；工作流仅在构建完成后读取，隔离钥匙目录中导入，校验私钥指纹与仓库公开公钥一致。签名或校验失败不得上传发行文件。
- 每种架构的 `.AppImage`、`.deb`、`.rpm` 和 `.pkg.tar.zst` 必须齐全；以稳定的文件名顺序生成 SHA-256 清单，对清单生成 ASCII GPG 分离签名并用公开公钥验证。上传安装包、清单、签名及公开公钥供下载验签；该签名不等于包管理器的原生仓库签名。
- 工作流只上传 Actions 制品；正式发布人员核验后将其上传到对应 Release。该流程不修改 GitHub Release 或创建标签。
