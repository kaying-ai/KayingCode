# KayingCode 0.1.1 发布预验收 · 继续指导

> 快照时间：2026-11-09 09:30 CST。本文档是发布预验收工作暂停时的交接说明，按「3. 继续步骤」顺序执行即可恢复推进。
> 目标：为 `kayingcode 0.1.1` 完成四平台签名构建预验收，然后打正式标签 `kaying-code-v0.1.1` 触发正式构建。
> 流程依据：`scripts/spec/product-release-version.md`（发布签名与预验收规则）、`scripts/spec/branch-policy.md`（发布分支与标签规则）。
> 本次交接未修改任何构建代码，也未触发新构建；只更新了本文档。

## 0. 先看这里（本轮结论）

- **已在预验收中通过的平台**：Linux x64/arm64、macOS arm64、Android（验收提交 `8c0dd114`）。
- **macOS x64 仍未通过**：轮 7 的 x64 重跑（第 2 次尝试，旧代码 `8c0dd114`，不含 staple 重试）于 2026-11-09 09:20 CST 再次失败，失败点仍是 `stapler staple` 访问 `api.apple-cloudkit.com` 的 `Error 68 / NSURLError -1005`。这是**预期的旧代码失败**，不能据此判定 PR #11 的修复无效。
- **修复已在 main，但尚未验证**：PR #11（staple 重试）已合入 `origin/main` = `1f25e528`。该修复尚未在任何预验收轮次中执行过。
- **Windows 仍被证书阻塞**：`windows-release` 环境的 `WIN_CSC_LINK` 仍是自签测试证书 `CN=KayingCode Local Test`；两个 Windows Secret 的更新时间停留在 2026-11-08 16:10 CST，诊断后又未更新过，需要用户提供 CA 正式证书。
- **下一步唯一动作**：合并 PR #12（本文档）后，在最新 `origin/main` 上开一轮新预验收，重点验证 macOS x64；Windows 换正式证书后在同一轮验证。

## 1. 当前状态快照

- `origin/main` = `1f25e528301de444bbf56586cd0d45884fbaf397`（PR #11 合并提交，含 staple 重试）。
- 当前分支 `docs/release-011-continuation` = `1f25e528` + 本文档提交；工作区干净。
- PR #12「docs(deploy): add 0.1.1 release preflight continuation guide」**仍为 OPEN**，`Source checks (Windows)` 已通过，状态 `MERGEABLE`。本文档更新会追加到同一 PR。
- 本地 `main` 落后 `origin/main` 2 个提交；本地 `release/0.1.1` 指向旧 main `8c0dd114`，无独有提交。
- 仓库为 **public**（已解决私有仓库 Actions 计费限额问题），Actions 不受限。
- `gh` CLI 已登录（账号 `hengtuibabai`，token 在 keyring），后续命令均可用 `gh`。
- 本地所有 `codex/*`、`fix/*` 分支相对 `origin/main` 的独有提交数均为 0，已无保留价值，可在收尾时统一删除。

### 1.1 已合入 main 的发布修复

| PR  | 提交       | 内容                          | 根因                                                                                                                          |
| --- | ---------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| #7  | `fb1bce83` | Linux x64 pacman 产物名修复   | electron-builder 的 `getArtifactArchName` 对 x64 pacman 不映射 `x86_64`（保持 `x64`）；签名脚本、工作流矩阵、测试夹具同步修正 |
| #8  | `c162e34a` | Windows 跨盘符 tar 修复       | pnpm 缓存（D:\）与临时目录（C:\）跨盘符时 GNU tar 把 `D:/...` 当 remote host；改为 cwd=归档目录 + `./basename`                |
| #9  | `73b4ca00` | Windows 验签诊断              | `Get-AuthenticodeSignature` 失败时输出签名者证书、StatusMessage、完整链校验                                                   |
| #10 | `04c85f4e` | macOS `stapler validate` 重试 | Intel runner 访问 `api.apple-cloudkit.com` 偶发 Error 68；`runCommandWithRetry`（默认 3 次、间隔 20s）                        |
| #11 | `280ec09e` | macOS `stapler staple` 重试   | staple（下载票据）与 validate 访问同一服务，纳入同一重试                                                                      |

### 1.2 预验收轮次状态（当前有效轮次：`8c0dd114`）

| 平台              | 状态    | 证据                                                                                 |
| ----------------- | ------- | ------------------------------------------------------------------------------------ |
| Linux x64 / arm64 | ✅ 通过 | run `42537911966`（已连续五轮全绿）                                                  |
| macOS arm64       | ✅ 通过 | run `42537915667` 的 arm64 job                                                       |
| macOS x64         | ❌ 失败 | 同 run 第 2 次尝试（x64 job）09:20 CST 失败于 `stapler staple`，旧代码无 staple 重试 |
| Android           | ✅ 通过 | run `42537919348` 的 Android job                                                     |
| Windows           | ❌ 失败 | 同 run 的 Windows job：自签证书，链校验 `UntrustedRoot`                              |

> 说明：`gh run list` 显示的是 run 的创建时间；轮 7 x64 重跑虽然创建于 08:01，实际第 2 次尝试在 08:40–09:20 CST 执行。

## 2. 两个未闭环项

### A. Windows：环境里是自签测试证书（阻塞正式发布，需用户行动）

PR #9 的诊断输出确认 `windows-release` 环境的 `WIN_CSC_LINK` 为：

```
Subject: CN=KayingCode Local Test
Issuer:  CN=KayingCode Local Test   （自签发）
链校验:  UntrustedRoot
```

证书本身有效期到 2027-10-18，但自签根不被 Windows 信任，用户机器会报“未知发布者”，不能用于正式发行。最新证据：两个 Secret 的 `updated_at` 均为 **2026-11-08T08:10Z（16:10 CST）**，即上传测试证书的时间；后续的验签诊断轮次没有更新过 Secret。

**需要用户**：提供 CA 签发的正式代码签名证书（PFX/P12，SSL.com/Sectigo/DigiCert/GlobalSign/沃通等），更新 `windows-release` 环境的两个 Secrets：

- `WIN_CSC_LINK`：证书 base64
- `WIN_CSC_KEY_PASSWORD`：口令

更新地址：`https://github.com/kaying-ai/KayingCode/settings/environments/26617288607`

### B. macOS x64：Intel runner 到 Apple CloudKit 的网络抖动（代码已修，待新轮次验证）

- 轮 4–7 的 x64 均在 `stapler staple/validate` 访问 `api.apple-cloudkit.com` 时失败（Error 68 / NSURLError -1005），失败点在 staple 与 validate 之间交替；arm64 每轮都通过。
- PR #10 给 validate 加了有界重试，PR #11 把 staple 也纳入同一重试（默认 3 次、间隔 20s，耗尽仍失败则构建失败，不放宽验收）。
- 轮 7 的提交 `8c0dd114` 早于 PR #11，因此 09:20 的失败**只证明旧代码仍会失败**，不构成对修复的否定。PR #11 的重试逻辑还没有在任何预验收轮次里实际执行过。
- **验收方法**：在新一轮预验收中观察 x64 的 `Sign and notarize the macOS installer`；只要重试内成功通过即视为修复有效。若重试 3 次后仍报 Error 68，则说明 Intel runner 出口对该服务持续异常，不是瞬时抖动；此时先与用户对齐，再考虑「x64 改用 arm64 runner 打包」或「macOS 仅发 arm64」，不要继续堆兜底分支。

## 3. 继续步骤

### Step 0 · 开工检查与同步

```bash
cd /Users/yoyi/codes/kaying-office/KayingCode
node scripts/check-workspace-freshness.mjs
gh auth status
git fetch origin --prune --tags
git switch main && git pull --ff-only
```

预期：`main` 与 `origin/main` 一致；`gh` 显示 `hengtuibabai` 已登录。

### Step 0.5 · 合并 PR #12（建议）

PR #12 只含本文档，不影响构建产物。建议先合并，使后续预验收标签落在最新 main 提交上，避免「验收提交比 main 落后」的解释成本。

```bash
gh pr merge 12 --repo kaying-ai/KayingCode --merge
git fetch origin --prune
```

若暂不合并 PR #12，直接在 `1f25e528` 上预验收也可以：该提交是 `origin/main` 的祖先，且文档提交不影响制品；正式标签仍须指向实际通过验收的同一提交。

### Step 1 · 用最新 main 开新一轮预验收（重点 macOS x64）

```bash
SHA=$(git rev-parse origin/main); SHA12=${SHA:0:12}
TAG=kaying-code-preflight-v0.1.1-$SHA12
git tag $TAG $SHA && git push origin $TAG

for env in linux-release macos-release windows-release android-release; do
  gh api -X POST repos/kaying-ai/KayingCode/environments/$env/deployment-branch-policies \
    -f name=$TAG -f type=tag >/dev/null
done

gh workflow run "Build signed Linux release" --repo kaying-ai/KayingCode --ref $TAG
gh workflow run "Build signed macOS release" --repo kaying-ai/KayingCode --ref $TAG
gh workflow run "Build signed Windows and Android releases" --repo kaying-ai/KayingCode --ref $TAG
```

监控：

```bash
gh run list --repo kaying-ai/KayingCode --limit 6
gh run watch <run-id> --repo kaying-ai/KayingCode --exit-status
```

判定标准：Linux 双架构、macOS arm64+x64、Android 全部成功；Windows 取决于 Step 2 的证书是否已更新。macOS x64 若在重试内通过，即闭环未闭环项 B。

### Step 2 · 处理 Windows 证书（与 Step 1 并行）

1. 用户更新 `windows-release` 的两个 Secrets（地址见 2.A）。
2. 若新预验收轮次在 Secret 更新前已启动：直接重跑失败任务即可，Secret 在任务启动时读取。

```bash
gh run rerun <Windows失败的run id> --repo kaying-ai/KayingCode --failed
```

3. 重跑后 `Verify Windows installer signature` 必须为 `Valid`（不再是 `UnknownError/UntrustedRoot`）。
4. 若用户决定暂不发 Windows：按「三平台先行、Windows 同提交补发」推进，但需用户明确确认。

### Step 3 · 清理临时规则与旧标签（全部验收通过后）

先列出各环境策略，核对后再删：

```bash
for env in linux-release macos-release windows-release android-release; do
  gh api repos/kaying-ai/KayingCode/environments/$env/deployment-branch-policies --jq \
    '.branch_policies[] | select(.name | test("preflight")) | "\($env) \(.id) \(.name)"'
done
```

当前遗留的临时规则（4 轮旧标签，均为失败/被取代轮次）：

```
kaying-code-preflight-v0.1.1-8c0dd114d7e9
kaying-code-preflight-v0.1.1-a63355af61d1
kaying-code-preflight-v0.1.1-f7572ba73efb
kaying-code-preflight-v0.1.1-fa72bb665b4e
```

按 id 删除：

```bash
gh api -X DELETE repos/kaying-ai/KayingCode/environments/<env>/deployment-branch-policies/<id>
```

保留 `kaying-code-v*` 永久规则。**本轮正在使用的预验收精确标签规则，在正式标签验收通过后再删除**（spec 要求临时放行结束后移除）。

已推送的旧预验收标签（7 个，均为失败/被取代轮次）：

```
kaying-code-preflight-v0.1.1-6775af101fca   # 轮1：架构命名
kaying-code-preflight-v0.1.1-0ddee21ff3d7   # 轮2：pacman 命名
kaying-code-preflight-v0.1.1-0cd3b1375c13   # 轮3：会话中断未跑
kaying-code-preflight-v0.1.1-fa72bb665b4e   # 轮4：Windows tar
kaying-code-preflight-v0.1.1-a63355af61d1   # 轮5：Windows 验签
kaying-code-preflight-v0.1.1-f7572ba73efb   # 轮6：macOS x64 stapler
kaying-code-preflight-v0.1.1-8c0dd114d7e9   # 轮7：macOS x64 staple（重跑仍失败）
```

删除标签：`git push origin --delete <tag>`（删除前确认没有运行中的 Actions 引用它）。

另有 3 个早期的 `kaying-code-test-v0.1.1-*` 标签（`0e945a1c1f6d`、`9b57c49f7f09`、`c3dd8a96368d`），是正式预验收机制建立前的测试构建，对应的 run 已结束（1 成功、2 失败），可在用户确认后一并删除。

本地分支清理（全部相对 `origin/main` 独有提交为 0）：

```bash
git branch -d codex/fix-linux-release-artifact-names codex/linux-release-preflight \
  codex/linux-release-signing codex/multiplatform-release \
  fix/linux-pacman-x64-arch fix/stapler-staple-retry fix/stapler-validate-retry \
  fix/windows-authenticode-diagnostics fix/windows-crossdrive-tar release/0.1.1
```

### Step 4 · 正式发布

**决策点（需与用户确认）**：四平台全绿后打正式标签；若 Windows 证书暂缺，是否按「三平台先行、Windows 同提交补发」执行。正式标签必须指向**已通过预验收的同一 main 提交**。

1. 确认根 `package.json` 版本为 `0.1.1`（已在 main 就绪）。**不要再运行 `pnpm run release`**：release-it 会自增到 0.1.2 并用生成式变更日志覆盖手写条目（dry-run 已验证）；它用于下次版本递增。
2. 打正式标签并触发正式构建（`kaying-code-v*` 永久环境规则直接放行，无需临时规则）：

```bash
TAG=kaying-code-v0.1.1
git tag $TAG <验收通过的main提交SHA> && git push origin $TAG

gh workflow run "Build signed Linux release" --repo kaying-ai/KayingCode --ref $TAG
gh workflow run "Build signed macOS release" --repo kaying-ai/KayingCode --ref $TAG
gh workflow run "Build signed Windows and Android releases" --repo kaying-ai/KayingCode --ref $TAG
```

3. 正式构建制品名带 `-release` 渠道（预验收为 `-preflight`）。标签推送会触发 `Source checks`（校验标签是 main 祖先）。
4. 制品只上传到 Actions artifacts；**发布到 GitHub Release 由维护者完成安装验收后人工操作**（工作流无 Release 写权限，属预期行为）。

## 4. 各平台验收判定

- **Linux**：x64 与 arm64 各自的 `.AppImage`、`.deb`、`.rpm`、`.pkg.tar.zst` 齐全；SHA-256 清单稳定顺序；ASCII GPG 分离签名可被公开公钥验证；文件名使用 electron-builder 实际架构名，不重命名原始包。
- **macOS**：arm64 与 x64 的 DMG 均完成 Developer ID 签名、公证、staple 与 `stapler validate`；只有通过校验的制品才上传。
- **Windows**：恰好一个 `KayingCode-*-win-x64.exe`，Authenticode 状态为 `Valid`，证书链终止于受信任根。
- **Android**：release APK 经 `apksigner` 验证签名成功；缺失凭据或校验失败不得退化为未签名/debug 包。
- 预验收与正式构建都只产出 Actions artifacts，不创建 Release 或额外标签。

## 5. 关键技术事实备忘

- **标签机制**：预验收标签为 `kaying-code-preflight-v<版本>-<main提交前12位SHA>`，标签绑定提交且必须是 `origin/main` 祖先（`scripts/linux-release-tag.mjs` 校验）；正式标签为 `kaying-code-v<版本>`。环境默认只放行 `kaying-code-v*`，预验收需逐轮临时加精确标签规则、结束后移除。
- **electron-builder 架构名**：x64 → AppImage/rpm=`x86_64`、deb=`amd64`、pacman=`x64`；arm64 → AppImage/deb=`arm64`、rpm/pacman=`aarch64`。不重命名原始包。
- **环境数字 ID**：linux-release=26621608611、macos-release=26618917596、windows-release=26617288607、android-release=26616472260。
- **Secrets 清单**：macos-release 5 项（MAC_CSC_LINK、MAC_CSC_KEY_PASSWORD、APPLE_API_KEY_BASE64、APPLE_API_KEY_ID、APPLE_API_ISSUER）；linux-release 2 项（LINUX_GPG_PRIVATE_KEY、LINUX_GPG_PASSPHRASE）；windows-release 2 项（WIN_CSC_LINK、WIN_CSC_KEY_PASSWORD，**现为测试证书**）；android-release 4 项（ANDROID_KEYSTORE_BASE64、ANDROID_STOREPASSWORD、ANDROID_KEYALIAS、ANDROID_KEYPASSWORD）。
- **Secret 更新时间**：windows-release 两个 Secret 均为 2026-11-08T08:10Z（16:10 CST），即测试证书上传时间；macOS 证书为 2026-11-08T09:50Z，Apple API Key 为 08:54–08:55Z。
- **本机凭据备份**：`~/KayingCode-release-credentials/{macos,linux}`（Windows 无本机备份，材料在用户处）。
- **本次接入工具**：`gh` CLI（设备码授权，token 在 keyring）。调试用 Chrome 实例（`~/.kayingcode-agent/chrome-profile`，端口 9222）已无必要，可整目录删除。
- **CI 时长参考**：Source checks（Windows）约 5–15 分钟；Linux 双架构约 18–23 分钟；macOS arm64 约 18–28 分钟、x64（Intel）约 33–48 分钟；Windows 构建约 30 分钟；Android 约 15–20 分钟。

## 6. 历史轮次索引（run id）

| 标签轮次                                   | 结果                                                                                              | 关键 run                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 6775af10                                   | 双架构签名失败（架构名）                                                                          | 42473748953                             |
| 0ddee21f                                   | x64 失败（pacman 命名）                                                                           | 42478115435                             |
| fa72bb66                                   | Linux✅ macOS arm64✅ Android✅；Windows tar 失败                                                 | 42490441262 / 42490444854 / 42490448126 |
| a63355af                                   | Linux✅✅ macOS arm64✅ Android✅；Windows 验签 UnknownError；macOS x64 stapler 抖动              | 42492594598 / 42492598710 / 42492603465 |
| f7572ba7                                   | Linux✅✅ Android✅ macOS arm64✅；Windows 诊断为自签证书；macOS x64 抖动                         | 42533932607 / 42533935819 / 42533939091 |
| 8c0dd114                                   | Linux✅✅ Android✅ macOS arm64✅；Windows 自签证书；macOS x64 重跑（第 2 次尝试）仍失败于 staple | 42537911966 / 42537915667 / 42537919348 |
| 下一轮（1f25e528 或合并 PR #12 后的 main） | 待执行，重点验证 macOS x64 staple 重试；Windows 待正式证书                                        | —                                       |

## 7. 暂停时点待办清单

- [ ] 合并 PR #12（本文档），同步 `main`
- [ ] 用户更新 `windows-release` 的 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` 为 CA 正式证书
- [ ] 在最新 `origin/main` 打新预验收标签，三套工作流全部触发
- [ ] 确认 macOS x64 在 staple/validate 重试内通过（验证 PR #11）
- [ ] 确认 Windows Authenticode `Valid`
- [ ] 删除 4 条旧预验收环境规则 + 本轮临时规则（正式验收后）
- [ ] 删除 7 个旧预验收标签 + 3 个 `kaying-code-test-*` 标签（确认后）
- [ ] 清理本地已合并分支
- [ ] 打正式标签 `kaying-code-v0.1.1`，触发三套正式构建
- [ ] 维护者人工安装验收后发布 GitHub Release
