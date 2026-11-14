# 产品发布版本

- 根 `package.json` 的 `version` 是桌面、统一运行包、独立 CLI、Taro 和 Flutter 同批发版的产品版本。CLI 与 Taro 在各自的 `package.json` 声明该版本，Flutter 在 `pubspec.yaml` 声明该版本及正整数 build number。Taro 展示值和 Flutter 展示版本的默认值都使用同一产品版本。
- Flutter build number 随发布构建递增，由 Flutter 清单维护。正式打包时如果注入 `APP_VERSION`，其值也应与产品版本一致。官方插件继续使用各自的发行版本。
- `node --test scripts/first-public-release.test.mjs` 从当前根清单读取目标版本，检查各端声明、Flutter 展示版本、build number 和安装标识。Taro 的 `appVersion.test.ts` 校验展示值和本端清单。版本漂移或 Flutter build number 缺失、无效时相应检查失败。
- 先更新本批版本，再运行 `node scripts/licenses.mjs notices` 和显式许可检查，确保生成清单记录的是准备交付的清单输入。签名、商店构建编号占用情况和制品验收由对应发布流程核对。

## 发布构建触发

- 推送 `kaying-code-v<根版本>` 或 `kaying-code-preflight-v<根版本>-<目标提交前12位SHA>` 标签会直接触发 Linux、macOS、Windows+Android 三套签名构建，不需要维护者再逐套运行；`workflow_dispatch` 保留用于失败重跑或维护者显式重发。
- 预验收标签只上传带 `preflight` 名称的 Actions 制品，不创建 GitHub Release；只有正式标签会触发 `Publish GitHub release` 汇总制品并发布。
- 三套构建仍按标签校验版本与 `origin/main` 祖先关系。预验收使用受保护环境，推送预验收标签前必须先为该精确标签临时放行对应环境，否则环境校验会拒绝构建。
- `Publish GitHub release` 读取同一标签下由 `push` 或 `workflow_dispatch` 触发的最新构建运行，避免标签自动触发后发布任务找不到对应运行。

## Linux 桌面发行签名

- Linux 正式包工作流以 `kaying-code-v<根版本>` 标签且该提交属于 `origin/main` 为前提，分别在 x64 与 arm64 Linux runner 构建生产身份的桌面发行物。预验收仅允许 `kaying-code-preflight-v<根版本>-<目标提交前12位SHA>` 标签，并要求目标为 main 的祖先；正式和预验收使用同一签名流程，但 Actions 制品名称包含 `release` 或 `preflight`，避免混淆。一般测试构建不获得发行私钥。
- `linux-release` 环境拥有 GPG 私钥与口令；工作流仅在构建完成后读取，隔离钥匙目录中导入，校验私钥指纹与仓库公开公钥一致。签名或校验失败不得上传发行文件。
- 每种架构的 `.AppImage`、`.deb`、`.rpm` 和 `.pkg.tar.zst` 必须齐全；文件名使用 electron-builder `getArtifactArchName` 的实际架构名：x64 对应 AppImage/rpm 的 x86_64、deb 的 amd64 与 pacman 的 x64，arm64 对应 AppImage/deb 的 arm64 与 rpm/pacman 的 aarch64，不重命名原始包；以稳定的文件名顺序生成 SHA-256 清单，对清单生成 ASCII GPG 分离签名并用公开公钥验证。上传安装包、清单、签名及公开公钥供下载验签；该签名不等于包管理器的原生仓库签名。
- 工作流只上传 Actions 制品；正式发布人员核验后将其上传到对应 Release。该流程不修改 GitHub Release 或创建标签。

- 在创建正式标签前，以同一 main 提交执行预验收并检查两种架构的构建、签名及安装包；仅对该次预验收的精确标签临时放行 `linux-release` 环境，结束后移除该规则。正式发布仍使用同一提交的正式标签。

## macOS 正式签名构建

- 推送正式 `kaying-code-v<版本>` 标签或提交绑定的预验收标签后，`Build signed macOS release` 自动运行；重跑时仍可手动 dispatch 同一标签。预验收环境仅临时允许具体标签，制品名区分预验收和正式。校验任务先确认标签版本与根清单一致，且提交属于 `origin/main` 的历史。通过后，Apple Silicon 构建任务使用 `macos-release` 环境。
- macOS Intel（x64）自 0.1.5 起暂停构建，不再进入默认发布矩阵；0.1.4 及更早版本仍保留已发布制品。恢复 x64 构建前，须先记录实际用户需求、验收范围和签名/公证验证计划，再更新本节与工作流矩阵。
- GitHub Environment 保管证书和公证凭据。构建任务将 Developer ID Application 导入临时钥匙串，再调用现有 `bundle:desktop`。这样随包 Computer Use 插件、桌面应用和 DMG 都能使用发行身份。公证继续由现有 DMG hook 完成。
- 只有通过 DMG 签名校验和公证票据校验的制品才上传到本次 Actions 运行。`stapler validate` 的在线票据复核依赖 Apple 服务，0.1.4 及更早版本的 Intel runner 曾偶发 Error 68 网络抖动；构建脚本对该复核做有界重试（默认 3 次），重试耗尽仍失败则构建失败，不放宽验收标准。GitHub Release 由 `Publish GitHub release` 工作流在全部平台构建成功后创建；维护者仍应在对外分发前完成安装验收。

```text
正式标签 → 版本与 main 祖先校验 → macos-release 环境 → 签名与公证 → 验签 → Actions DMG
```

## Windows 与 Android 正式签名构建

- 使用与 Linux 相同的提交绑定标签校验和标签推送触发；Windows、Android 分别由对应受保护环境提供发行凭据。预验收仅临时放行精确标签并区分制品名称。
- Windows 使用既有 Electron 打包入口及 WIN_CSC 环境证书；安装器必须带签名，允许自签或未受信任根证书（当前发行使用自签证书，安装时可能显示未知发布者），验签状态、签名者和证书链写入构建日志后上传。Android 通过 Flutter 目标入口检查固定 SDK 后构建 release APK，以 apksigner 验证签名成功后上传；缺失凭据或校验失败不得退化为未签名或 debug 包。
- 预验收只上传 Actions 制品，不创建 Release 或标签；正式构建完成后由 `Publish GitHub release` 汇总制品并创建或更新 GitHub Release。所有目标验收通过后正式标签指向同一 main 提交。

## GitHub Release 发布

- `Publish GitHub release` 由三套正式构建的 `workflow_run` 完成事件触发，也支持手动 `workflow_dispatch` 并传入产品标签。只处理匹配 `kaying-code-v<版本>` 的标签。
- 发布任务读取该标签下三套构建工作流的最新运行（`push` 或 `workflow_dispatch` 触发）；任一运行未完成时退出，等待最后完成的构建再次触发；任一运行失败时拒绝发布。全部成功后下载三套 Actions 制品，按文件名去重。
- 发布任务生成 `SHA256SUMS-<版本>.txt`，用 `scripts/release-notes.mjs` 从 `CHANGELOG.md` 提取当前版本说明，并创建或更新 GitHub Release。已存在且含校验值资产的 Release 视为完成，重复触发不重复上传。
- 工作流使用 `contents: write` 创建 Release，`actions: read` 下载制品；构建工作流本身保持只读。发布失败时保留 Actions 制品，可手动运行同一工作流重试，不重新构建。
- 自动发布不替代安装验收：维护者在对外宣布或推广前，仍应按目标平台完成安装与启动验证。

## 站点与国内发行同步

- `Publish GitHub release` 在创建或更新 GitHub Release 后，通过 `CNB_TRIGGER_TOKEN` 调用 CNB OpenAPI `POST /kayingai/site-kayingai.com/-/build/start`，事件为 `api_trigger_release`，通过 `env` 传入 `RELEASE_TAG`、`KAYING_RELEASE_CNB_TOKEN` 与 `SITE_GITHUB_TOKEN`。CNB 构建在后台异步执行，响应中的 `sn` 与 `buildLogUrl` 用于追踪。
- 站点仓库的 `api_trigger_release` 流水线执行 `scripts/sync-kayingcode-release.mjs --tag <tag>`：校验 GitHub Release 的 macOS arm64、Windows x64、Android universal 与 `SHA256SUMS`，上传 CNB（`kayingai/kaying-code`）优先、GitCode（`kayingai/kaying-codex`）回退，更新站点 `download-info.json` 的 `cn` 与两个地区 `buildVersion`，提交并推送 CNB 与 GitHub；CNB 推送触发站点部署。站点 GitHub 仓库保持 private，不使用 GitHub Actions。
- 凭据边界：KayingCode 仓库保存 `CNB_TRIGGER_TOKEN`（对站点 CNB 仓库有 `repo-cnb-trigger:rw`）、可选 `CNB_RELEASE_TOKEN`（缺省复用触发 Token，提供 `kayingai/kaying-code` 的 release 写权限）、`SITE_GITHUB_TOKEN` 或既有 `SITE_DISPATCH_TOKEN`（站点 GitHub Contents 写权限）。触发时通过 CNB `build/start` 的 `env` 传给站点流水线，不依赖 CNB 密钥仓库。
- 站点同步失败不回滚已发布的 GitHub Release；重跑 `Publish GitHub release` 或在 CNB 重新触发 `api_trigger_release` 并传入同样的 `env` 即可。同名国内资产覆盖上传，站点文件无变化时不产生新提交。CNB 与 GitHub `main` 分叉时失败而不强推。

## 发布偏离记录

### 0.1.3：跳过预验收直接发布

- 决定：2026-11-10 维护者明确选择跳过 `kaying-code-preflight-v0.1.3-*` 预验收轮次，直接推送 `kaying-code-v0.1.3`，由标签触发三套正式签名构建并自动发布 GitHub Release。
- 原因：预验收与正式构建使用同一工作流、同一标签校验和同一签名环境；维护者要求缩短发布链路，直接以正式构建作为本轮验证。
- 影响范围：macOS x64 `stapler` 重试和 Windows 自签证书验签未在 0.1.3 预验收轮次单独验证，相关风险由正式构建首轮承担。正式构建失败时只重跑失败任务，不放宽签名、公证或验签标准；失败且无法修复时不发布该版本。
- 验证依据：`kaying-code-v0.1.3` 三套构建结果、Actions 制品与 `Publish GitHub release` 生成的 Release 及 `SHA256SUMS-0.1.3.txt` 作为本轮发布证据。
- 后续基线：本条为一次性偏离，不改变默认流程；0.1.4 起恢复「同一 main 提交先预验收、再正式标签」。
