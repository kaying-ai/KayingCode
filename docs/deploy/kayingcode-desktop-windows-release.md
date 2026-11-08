# Windows 桌面版：密钥、构建与发布教程

> 适用对象：在 Windows 构建并交付 `@zcode/desktop` 的 NSIS 安装包。所有命令默认在仓库根目录、PowerShell 中执行。本文核对于 2026-10-18；实际工具版本以 `mise.toml`、命令和源码为准。返回 [桌面部署](kayingcode-desktop.md)。

## 先了解这条发布链路

```text
源码与根 package.json 版本
  → Windows 构建机准备运行时资源
  → electron-builder 使用外部 PFX 签名并生成 NSIS 安装包
  → 生成与安装包对应的 Windows 更新元数据
  → 验证签名、摘要、安装及升级
  → 上传安装包和更新文件到组织的发布系统
  → 服务端 manifest API 向客户端开放新版本
```

`pnpm run package` 是现有的发行包构建入口：它自动识别当前系统和架构，在 Windows 上生成对应的 NSIS 安装包。该命令不上传产物，也不开放自动更新。客户端自动更新请求 `/api/v1/releases/electron/manifest`；打包配置里的 `http://localhost:8081` 是 electron-builder 所需的 generic publish 占位，不是生产发布地址。发布系统和上传凭据由部署方提供，仓库当前没有统一的 Windows 上传命令。

正式公开分发需要可信发行者的代码签名证书。自己生成的证书适合本机或受控测试，不能让公众设备天然信任。当前仓库可从显式环境变量或 Git 忽略的本机配置读取 PFX/P12 签名材料；未提供证书时日志标记 `windows-unsigned`，只可当开发包。证书私钥、PFX、口令均不得加入仓库、构建日志或发布附件。已进入旧历史的开发证书不得再用作正式签名。

## 1. 准备 Windows 构建机

1. 安装 Git、[mise](https://mise.jdx.dev/installing-mise.html)，并在仓库根目录运行 `mise install`。在当前 PowerShell 会话执行 `(&mise activate pwsh) | Out-String | Invoke-Expression`，使项目固定的工具进入 PATH。当前固定版本为 Node `24.14.0`、pnpm `10.31.0`。确保能联网取得依赖和 Electron/electron-builder 资源，并有足够的构建磁盘空间。
2. 使用拥有仓库读取权限的账号取得源码；正式发布选择已审核的 commit 或版本标签，保持工作区干净。x64 安装包在 Windows x64 机器上构建。ARM64 另按目标架构验收；启用 Windows 浏览器导入 helper 时，ARM64 还需 `KAYINGCODE_CSC_PATH` 指向支持 ARM64 的 Roslyn `csc.exe`。
3. 从仓库根目录执行：

```powershell
node scripts/check-workspace-freshness.mjs
git status --short
node --version
pnpm --version
pnpm run bootstrap
pnpm run source:check
pnpm run typecheck
pnpm run lint
```

`git status --short` 应为空；发布构建要记录 `git rev-parse HEAD`。`bootstrap` 不仅安装当前 Windows 依赖，还补齐打包和 mock CDN staging 所需的 macOS/Linux `node-pty` 变体。只运行普通 `pnpm install` 会使后续 `pnpm run package` 因缺少跨平台依赖失败。上面的类型、Lint、目录检查失败时先查明原因，不把失败产物送往发布。

## 2. 生成测试密钥，或取得正式签名证书

### 2.1 本机生成自签名测试密钥

以下命令在当前用户证书库生成一对密钥和代码签名证书，并导出为仓库外的 PFX。它只用于验证签名构建流程。不要将这个 PFX 上传公共下载站，也不要教用户关闭 SmartScreen 来安装测试包。

```powershell
$secretDir = Join-Path $env:USERPROFILE 'KayingCode-Secrets'
New-Item -ItemType Directory -Path $secretDir -Force | Out-Null
$testCert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject 'CN=KayingCode Local Test' `
  -CertStoreLocation 'Cert:\CurrentUser\My'
$pfxPath = Join-Path $secretDir 'kayingcode-local-test.pfx'
$pfxPassword = Read-Host 'Choose a test PFX password' -AsSecureString
Export-PfxCertificate -Cert $testCert -FilePath $pfxPath -Password $pfxPassword | Out-Null
$testCert | Select-Object Subject, Thumbprint, NotAfter
```

保管好 PFX 和口令；测试结束后按本机证书管理流程清理测试密钥。自签名证书在未配置测试信任的机器上无法通过公开发行的信任校验，这是预期现象。

### 2.2 正式发行证书

向可信 CA/签名服务申请适合 Windows Authenticode 的代码签名身份，按其流程在受控密钥设施中生成私钥、完成身份验证、取得证书及证书链。**仅生成一对本地密钥或 CSR 不会得到可信发行者身份。** 本仓库现有打包路径要求可供 electron-builder 使用的 PFX/P12 文件及口令；如果签名服务只允许 HSM、硬件令牌或远程签名，需先实现并验收对应的 electron-builder 签名集成，不能把该服务的访问密钥填进 `CSC_LINK` 冒充 PFX。

将正式 PFX 存在仓库外的受控密钥库或构建机受限目录，限定发布账号读取，制定备份、轮换和吊销负责人。用实际正式证书执行下面的签名构建与验收；不要复用旧仓库开发证书。关于当前可用的 Windows 签名方式及可信证书选择，参见 [electron-builder Windows 签名文档](https://www.electron.build/docs/features/code-signing/code-signing-win/) 和 [Microsoft 代码签名选项](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)。

## 3. 确定版本与发布身份

安装包版本取根 `package.json` 的 `version`，桌面构建元数据还记录 commit 和构建时间。正式发布前核对该版本和构建 commit，确认版本号尚未被发布系统使用；不要在同一版本号下重新上传内容不同的安装包。默认 `KAYINGCODE_ENV=production` 生成 `KayingCode` 正式身份；`KAYINGCODE_ENV=test` 生成测试后端的 `KayingCode Preview` 和 `_TEST` 文件名；`KAYINGCODE_PREVIEW_IDENTITY=1` 可在生产后端构建独立的 Preview 身份。正式 stable 发布前清除测试/Preview 环境变量。

## 4. 保存本机签名配置并构建 Windows x64 安装包

首次在构建机上创建配置文件，之后直接执行 `pnpm run package`。复制模板，并在本机编辑 `certificateFile` 为**仓库外 PFX/P12 的绝对路径**，`certificatePassword` 为导出时的口令；JSON 路径可使用正斜杠。正式发布填入可信发行证书，仅测试流程时可指向第 2.1 节的自签名 PFX。配置文件含明文口令，须限制本机访问权限；它被 Git 忽略，不应上传到发布系统。CI 仍可用 `CSC_LINK`/`CSC_KEY_PASSWORD` 注入，优先于本机配置。

```powershell
$configPath = 'packages/desktop/build/cert/windows-signing.local.json'
Copy-Item 'packages/desktop/build/cert/windows-signing.example.json' $configPath
notepad $configPath
git check-ignore $configPath
$env:KAYINGCODE_ENV = 'production'
Remove-Item Env:KAYINGCODE_PREVIEW_IDENTITY -ErrorAction SilentlyContinue
pnpm run package
if ($LASTEXITCODE -ne 0) { throw 'Package build failed' }
```

Windows x64 构建日志应显示 `target=win/x64`、`KAYINGCODE_ENV=production`、`codeSigning=windows-local-config`（若使用环境变量则为 `windows-external-certificate`）。`pnpm run package` 默认使用当前机器的系统和架构，准备资源、构建并打包。打包需要 `bootstrap` 安装的四种跨平台 `node-pty` 变体；只运行普通 `pnpm install` 会缺少其他系统的变体。不要跳过资源准备或构建步骤。Windows ARM64 请在 ARM64 构建机上运行同一命令，并在 ARM64 设备上验收。

默认产物目录为 `packages/desktop/dist/`。正式 x64 安装包名称形如 `KayingCode-<version>-win-x64.exe`；同目录的 `latest.yml` 是 electron-builder 生成的 Windows 更新元数据，发布时要与该安装包对应。打包脚本还会检查 app.asar 运行时依赖并审计安装包体积，但不会替代安装后的实机验收。

## 5. 验证签名和安装包

在发布构建机上选取**本次**生成的安装包，核对版本、哈希及签名。`Get-AuthenticodeSignature` 的 `Status` 对正式证书必须为 `Valid`，签名主体应是预期发行者；仅有签名数据却不受信任不能算通过。

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = Join-Path (Resolve-Path 'packages/desktop/dist').Path "KayingCode-$version-win-x64.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Installer not found' }
Get-FileHash -LiteralPath $installer -Algorithm SHA256
$signature = Get-AuthenticodeSignature -LiteralPath $installer
$signature | Select-Object Status, StatusMessage, SignerCertificate, TimeStamperCertificate
if ($signature.Status -ne 'Valid') { throw 'Installer signature is not trusted' }
```

如已安装 Windows SDK，可追加执行 `signtool verify /pa /v <安装包完整路径>` 检查 Authenticode 和时间戳；`/pa` 使用普通应用的验证策略。[Microsoft 签名验证说明](https://learn.microsoft.com/en-us/windows/win32/seccrypto/using-signtool-to-verify-a-file-signature)提供了具体用法。还应检查安装后的主程序 `KayingCode.exe` 与其他实际发布的可执行文件签名，并记录签名发行者、证书有效期、时间戳和 SHA256。

用干净的 Windows 测试机完成以下验收，再让外部用户下载：

| 场景                 | 通过条件                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| 全新安装、启动、卸载 | NSIS 安装正常，应用显示的版本和发布版本一致；卸载正常                                             |
| 基本功能             | 打开测试项目，使用真实可用的模型完成消息、文件修改及 Git 差异查看                                 |
| 重启恢复             | 退出并重新打开后，项目和历史会话可访问                                                            |
| 更新                 | 旧版本从实际更新服务发现并安装新版本，更新后仍可打开项目；核对 stable/preview 及 x64/ARM64 不串包 |
| 制品完整性           | 下载后的 SHA256 与发布记录一致，安装包及关键可执行文件的签名可信                                  |

## 6. 发布到下载渠道和自动更新服务

1. 将本次已验收的安装包、`latest.yml`、SHA256、commit、版本、架构、签名主体及验收记录整理为一个不可变发布批次。不要上传 PFX、口令或原始私钥。
2. 先把安装包上传到组织选定的存储/CDN，并用实际下载链接重新校验大小、SHA256、HTTPS 访问和 Range 下载。上传命令依赖该组织的存储服务；仓库当前没有通用上传脚本。
3. 在发布服务登记该批次，让 `/api/v1/releases/electron/manifest?platform=windows-x86_64&channel=1` 能返回与已上传文件匹配的版本、文件地址、大小和校验值。这里的 `channel=1` 是客户端 stable 请求；Preview 使用 `channel=3`。具体服务端发布操作取决于外部发布系统，不能把 `latest.yml` 上传到任意目录就假定客户端会更新。
4. 使用未参与构建的旧版 Windows 客户端检查实际更新请求、下载、安装和重启。确认成功后再开放下载页与 stable 灰度/全量；保留旧版本安装包和发布记录，以便停止推广或按组织流程回退。

发布前最后核对：构建 commit 已记录；根版本、安装包文件名、应用「关于」页、`latest.yml` 和服务端 manifest 一致；签名有效且无测试身份；用户从公开下载地址拿到的哈希与本地验收哈希一致。若版本已经对外发布，不覆盖同名文件，应修复后发布新版本。

## 常见问题

| 现象                          | 检查点                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 日志显示 `windows-unsigned`   | 当前构建进程没有收到环境证书，也没有读取到本机签名配置；检查文件路径和证书读取权限，产物不要发布                          |
| 缺少 `@lydell/node-pty-*`     | 在仓库根目录运行 `pnpm run bootstrap` 补齐跨平台变体；普通 `pnpm install` 只安装当前平台所需变体                            |
| 提供了 `CSC_LINK` 但签名失败  | 核对 PFX/P12 格式、口令、证书用途、有效期和证书链；预演不能验证这些条件                                                   |
| 签名状态不是 `Valid`          | 核对受信 CA 链、时间戳、文件是否在签名后被修改；自签名测试证书在公开设备上不受信任                                        |
| 有安装包但客户端未发现更新    | 核对服务端 manifest API、目标 `platform`/`channel`、版本、下载 URL、文件大小和校验值；本地 generic publish 占位不是生产源 |
| 文件名有 `_TEST` 或 `Preview` | 检查 `KAYINGCODE_ENV` 和 `KAYINGCODE_PREVIEW_IDENTITY`；重新构建正确身份，勿改文件名伪装                                  |

源码依据：`packages/desktop/scripts/bundle.mjs`、`desktop-code-signing.mjs`、`build-metadata.mjs`、`electron-builder.config.js`、`src/main/manifestUpdateProvider.ts`、根 `.release-it.mjs` 与 `package.json`。
