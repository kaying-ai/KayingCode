# KayingCode 0.1.1 发布预验收 · 继续指导

> 快照时间：2026-11-09。本文档是发布预验收工作暂停时的交接说明，按「继续步骤」顺序执行即可恢复推进。
> 上下文：目标是为 `kayingcode 0.1.1` 完成四平台签名构建预验收，然后打正式标签 `kaying-code-v0.1.1` 触发正式构建。
> 流程依据：`scripts/spec/product-release-version.md`（发布签名与预验收规则）、`scripts/spec/branch-policy.md`（发布分支与标签规则）。

## 1. 当前状态快照

- `origin/main` = `1f25e528301de444bbf56586cd0d45884fbaf397`（已包含 PR #7–#11 全部修复）。
- 仓库已改为 **public**（解决私有仓库 Actions 计费限额问题），Actions 不再受限。
- `gh` CLI 已安装并登录（账号 `hengtuibabai`，keyring 存储），本指南所有操作默认走 `gh`。
- 本地工作区干净；本地遗留分支：`release/0.1.1`（指向旧 main，无独有提交，可删）、若干已合并的 `fix/*` 分支（可删）。

### 已合入 main 的修复

| PR | 内容 | 根因 |
| --- | --- | --- |
| #7 | Linux x64 pacman 产物名修复 | electron-builder 的 `getArtifactArchName` 对 x64 pacman 不映射 `x86_64`（保持 `x64`）；签名脚本、工作流矩阵、测试夹具同步修正 |
| #8 | Windows 跨盘符 tar 修复 | pnpm 缓存（D:\）与临时目录（C:\）跨盘符时 GNU tar 把 `D:/...` 当 remote host；改为 cwd=归档目录 + `./basename` |
| #9 | Windows 验签诊断 | `Get-AuthenticodeSignature` 失败时输出签名者证书、StatusMessage、完整链校验 |
| #10 | macOS stapler validate 重试 | Intel runner 访问 `api.apple-cloudkit.com` 偶发 Error 68；`runCommandWithRetry`（默认 3 次、20s） |
| #11 | macOS stapler staple 重试 | staple（下载票据）与 validate 访问同一服务，纳入同一重试 |

### 最近一轮预验收（标签 `kaying-code-preflight-v0.1.1-8c0dd114d7e9`，代码为 PR #10 时点）

| 平台 | 状态 |
| --- | --- |
| Linux x64 / arm64 | ✅ 通过（已连续四轮全绿） |
| macOS arm64 | ✅ 通过 |
| macOS x64 | ⏳ 失败后已重跑 failed job（run `42537915667`），**重跑结果未出**（旧代码，无 staple 重试） |
| Android | ✅ 通过 |
| Windows | ❌ 验签失败——`WIN_CSC_LINK` 是自签测试证书（见下） |

## 2. 两个未闭环项

### A. Windows：环境里是自签测试证书（阻塞正式发布，需用户行动）

诊断输出（PR #9 加入）确认 `windows-release` 环境的 `WIN_CSC_LINK` 为：

```
Subject: CN=KayingCode Local Test
Issuer:  CN=KayingCode Local Test   （自签发）
链校验:  UntrustedRoot
```

自签证书签出的安装包在用户机器上会报“未知发布者”，不能用于正式发行。macOS 与 Android 的证书均为真实 CA 证书（实测通过）。

**需要用户**：提供 CA 签发的正式代码签名证书（PFX/P12，SSL.com/Sectigo/DigiCert/GlobalSign/沃通等），更新 `windows-release` 环境的两个 Secrets：`WIN_CSC_LINK`（证书 base64）、`WIN_CSC_KEY_PASSWORD`（口令）。更新地址：`https://github.com/kaying-ai/KayingCode/settings/environments/26617288607`。

### B. macOS x64：Intel runner 到 Apple CloudKit 的网络抖动（代码已修，待验证）

三轮均失败于 `stapler staple/validate`（`api.apple-cloudkit.com`，Error 68 / NSURLError -1005），失败点在 staple 与 validate 之间交替，arm64 每轮都过。PR #11 已把两步都纳入有界重试（默认 3 次、20s 间隔，耗尽仍失败则构建失败，不放宽验收）。**该修复尚未在任何预验收轮次中验证过**（8c0dd114 轮的重跑仍是旧代码）。

## 3. 继续步骤

### Step 0 · 开工检查

```bash
node scripts/check-workspace-freshness.mjs   # 需基于最新 origin/main
gh auth status                               # 应显示 hengtuibabai 已登录
git fetch origin --prune --tags
```

### Step 1 · 处理 macOS x64

1. 先查 8c0dd114 轮重跑结果：`gh run view 42537915667 --repo kaying-ai/KayingCode`。
2. 若重跑 **成功**：x64 旧代码也能过（抖动自愈），macOS 平台在该提交上视为验收通过。
3. 若重跑 **失败**（预期可能再次命中 staple 抖动）：不代表 PR #11 无效——需用含 PR #11 的新 main 提交重新预验收，进入 Step 1b。
4. **Step 1b**：从最新 `origin/main` 开新预验收标签并触发三平台（Linux/macOS/Windows+Android）：

```bash
SHA=$(git rev-parse origin/main); SHA12=${SHA:0:12}
TAG=kaying-code-preflight-v0.1.1-$SHA12
git tag $TAG $SHA && git push origin $TAG
for env in linux-release macos-release windows-release android-release; do
  gh api -X POST repos/kaying-ai/KayingCode/environments/$env/deployment-branch-policies -f name=$TAG -f type=tag >/dev/null
done
gh workflow run "Build signed Linux release" --repo kaying-ai/KayingCode --ref $TAG
gh workflow run "Build signed macOS release" --repo kaying-ai/KayingCode --ref $TAG
gh workflow run "Build signed Windows and Android releases" --repo kaying-ai/KayingCode --ref $TAG
```

5. 若 x64 在新标签上**仍然**失败于 stapler（重试后仍 Error 68）：说明 Intel runner 池对该服务的出口持续异常，不是瞬时抖动。备选方案：把 x64 任务也改用 arm64 runner 跑（产物仍按 x64 打包）需要评估合法性与性能；或接受 arm64 为 macOS 唯一发行架构（产品决策）。此时先与用户对齐，不要继续堆兜底。

### Step 2 · 处理 Windows 证书（与 Step 1 并行）

- 用户更新 Secrets 后，**无需新标签**：直接重跑失败任务即可（secrets 在任务启动时读取）：

```bash
gh run rerun <Windows失败的run id> --repo kaying-ai/KayingCode --failed
```

- 重跑通过后，Windows 平台在当前预验收提交上视为验收通过。
- 若用户决定暂不发 Windows：可按「三平台先行」推进（见 Step 4 的决策点）。

### Step 3 · 全部目标平台通过后：清理临时规则与旧标签

当前各环境遗留的临时规则（`kaying-code-v*` 永久规则保留）：

```
kaying-code-preflight-v0.1.1-8c0dd114d7e9
kaying-code-preflight-v0.1.1-a63355af61d1
kaying-code-preflight-v0.1.1-f7572ba73efb
kaying-code-preflight-v0.1.1-fa72bb665b4e
```

```bash
for env in linux-release macos-release windows-release android-release; do
  gh api repos/kaying-ai/KayingCode/environments/$env/deployment-branch-policies --jq \
    '.branch_policies[] | select(.name | test("preflight")) | "\($env) \(.id) \(.name)"'
done
# 核对清单后按 id 删除（保留本轮正在用的标签规则，验收结束后一并移除）：
gh api -X DELETE repos/kaying-ai/KayingCode/environments/<env>/deployment-branch-policies/<id>
```

已推送的旧预验收标签（7 个，均为失败/被取代轮次，可删或归档）：

```
kaying-code-preflight-v0.1.1-6775af101fca   # 轮1：架构命名
kaying-code-preflight-v0.1.1-0ddee21ff3d7   # 轮2：pacman 命名
kaying-code-preflight-v0.1.1-0cd3b1375c13   # 轮3：会话中断未跑
kaying-code-preflight-v0.1.1-fa72bb665b4e   # 轮4：Windows tar
kaying-code-preflight-v0.1.1-a63355af61d1   # 轮5：Windows 验签
kaying-code-preflight-v0.1.1-f7572ba73efb   # 轮6：macOS x64 stapler
kaying-code-preflight-v0.1.1-8c0dd114d7e9   # 轮7：macOS x64 重跑中
```

删除标签：`git push origin --delete <tag>`（删除前确认没有运行中的 Actions 引用它）。

### Step 4 · 正式发布

**决策点（需与用户确认）**：四平台全绿后打正式标签；若 Windows 证书暂缺，是否按「三平台先行、Windows 同提交补发」执行。正式标签指向**已通过预验收的同一 main 提交**（spec 要求）。

1. 确认 `package.json` 版本为 `0.1.1`（已在 main 就绪，勿再运行 `pnpm run release`——release-it 会自增到 0.1.2 并用生成式变更日志覆盖手写条目，dry-run 已验证该行为；它用于下次版本递增）。
2. 打正式标签并触发正式构建（正式标签受 `kaying-code-v*` 永久环境规则放行，无需临时规则）：

```bash
TAG=kaying-code-v0.1.1
git tag $TAG <验收通过的main提交SHA> && git push origin $TAG
gh workflow run "Build signed Linux release" --repo kaying-ai/KayingCode --ref $TAG
gh workflow run "Build signed macOS release" --repo kaying-ai/KayingCode --ref $TAG
gh workflow run "Build signed Windows and Android releases" --repo kaying-ai/KayingCode --ref $TAG
```

3. 正式构建的制品名带 `-release` 渠道（预验收为 `-preflight`）。正式标签推送本身会触发 `Source checks`（校验标签是 main 祖先）。
4. 制品只上传到 Actions artifacts；**发布到 GitHub Release 由维护者完成安装验收后人工操作**（工作流无 Release 写权限，属预期行为）。

## 4. 关键技术事实备忘

- **预验收标签机制**：`kaying-code-preflight-v<版本>-<main提交前12位SHA>`，标签绑定提交且必须是 `origin/main` 祖先（`scripts/linux-release-tag.mjs` 校验）；正式标签为 `kaying-code-v<版本>`。环境（linux/macos/windows/android-release）默认只放行 `kaying-code-v*`，预验收需逐轮临时加精确标签规则、结束后移除。
- **electron-builder 架构名**：x64 → AppImage/rpm=`x86_64`、deb=`amd64`、pacman=`x64`；arm64 → AppImage/deb=`arm64`、rpm/pacman=`aarch64`。不重命名原始包。
- **环境数字 ID**：linux-release=26621608611、macos-release=26618917596、windows-release=26617288607、android-release=26616472260。
- **Secrets 清单**：macos-release 5 项（MAC_CSC_LINK、MAC_CSC_KEY_PASSWORD、APPLE_API_KEY_BASE64、APPLE_API_KEY_ID、APPLE_API_ISSUER）；linux-release 2 项（LINUX_GPG_PRIVATE_KEY、LINUX_GPG_PASSPHRASE）；windows-release 2 项（WIN_CSC_LINK、WIN_CSC_KEY_PASSWORD，**现为测试证书**）；android-release 4 项（ANDROID_KEYSTORE_BASE64、ANDROID_STOREPASSWORD、ANDROID_KEYALIAS、ANDROID_KEYPASSWORD）。
- **本机凭据备份**：`~/KayingCode-release-credentials/{macos,linux}`（Windows 无本机备份，材料在用户处）。
- **本次接入工具**：`gh` CLI（设备码授权，token 在 keyring）。调试用 Chrome 实例（`~/.kayingcode-agent/chrome-profile`，端口 9222）已无必要，可整目录删除。
- **CI 时长参考**：Source checks（Windows）约 8–15 分钟；Linux 双架构约 20 分钟；macOS arm64 约 25 分钟、x64（Intel）约 40 分钟；Windows 构建约 30 分钟；Android 约 15–20 分钟。

## 5. 历史轮次索引（run id）

| 标签轮次 | 结果 | 关键 run |
| --- | --- | --- |
| 6775af10 | 双架构签名失败（架构名） | 42473748953 |
| 0ddee21f | x64 失败（pacman 命名） | 42478115435 |
| fa72bb66 | Linux✅ macOS arm64✅ Android✅；Windows tar 失败 | 42490441262 / 42490444854 / 42490448126 |
| a63355af | Linux✅✅ macOS arm64✅ Android✅；Windows 验签 UnknownError；macOS x64 stapler 抖动 | 42492594598 / 42492598710 / 42492603465 |
| f7572ba7 | Linux✅✅ Android✅ macOS arm64✅；Windows 诊断为自签证书；macOS x64 抖动 | 42533932607 / 42533935819 / 42533939091 |
| 8c0dd114 | Linux✅✅ Android✅ macOS arm64✅；Windows 自签证书；macOS x64 重跑中 | 42537911966 / 42537915667 / 42537919348 |
