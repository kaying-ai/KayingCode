# Android 发布：Google Play

本指南针对本 Flutter 工程，覆盖发布签名、Android App Bundle、Play Console 测试和正式发布。Google Play 推荐上传 **AAB**；Debug APK 只用于本地测试，不要作为商店发行包。

## 工程发布身份

| 项目                   | 当前值                             | 规则                                                                        |
| ---------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| 工程版本               | 见 `pubspec.yaml`                  | `+` 前是展示版本，`+` 后是 Android `versionCode` / iOS build number         |
| Android application ID | `com.lingdian.kayingai.agent.code` | 创建 Play 应用后保持不变                                                    |
| 应用名称               | `KayingCode`                       | Play 商店标题可以独立于 application ID                                      |
| 签名配置               | `android/app/build.gradle.kts`     | 读取 `android/key.properties` 或 `ANDROID_*` 环境变量；Release 缺签名会失败 |
| target API             | 当前构建结果为 36                  | 每次提交按 Play 最新 target API 要求复核                                    |

本工程的 `versionCode` 和 `versionName` 来自 Flutter `version`。每次上传新 AAB 都要提高 build number。Play 不接受已使用过的 `versionCode`。

## 前置条件

1. 注册并完成 Google Play Developer account 验证，接受 Play Console 当前显示的协议。
2. 准备隐私政策 URL、支持邮箱/网站、应用描述、图标、截图、分类、内容分级和目标受众信息。
3. 完成 App content 中适用的数据安全、广告、应用访问、账号删除及其他政策声明。声明要覆盖应用与所有集成 SDK 的真实行为。
4. 本应用使用摄像头扫描配对二维码，并允许从照片或文件中导入二维码/附件。按真实数据流填写权限及 Data safety，不能只按权限列表推断数据是否“收集”。
5. 如果 Play Console Dashboard 显示身份验证或其他阻塞设置，先完成这些任务。

截至 2026-08-31，普通手机应用的新应用及更新须 target Android 16 / API 36 或更高；规则可能变化，发布当天以[官方 target API 要求](https://developer.android.com/google/play/requirements/target-sdk)和 Play Console 校验为准。工程当前构建结果 target API 36。

## 创建与保护上传密钥

### Play App Signing 的密钥关系

建议启用 **Play App Signing**：

- **App signing key**：Play 用它签署交付给用户的 APK。启用 Play App Signing 时，可让 Google 生成并托管。
- **Upload key**：发布者用它给上传至 Play Console 的 AAB 签名。私钥由发布团队保管；丢失或泄露时可在 Play Console 请求重置。
- **Upload certificate**：上传密钥的公钥证书，可提供给 Google 或 API 服务登记，不包含私钥。

不要混淆 upload key 与 app signing key。通常采用 Google 托管 app signing key、团队单独保管 upload key。

### 生成 PKCS12 上传密钥

把密钥放在仓库之外。下面使用本机 JDK `keytool`；交互式输入身份信息和密码，不要把密码拼进命令行或提交到 Git。

PowerShell：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.android" | Out-Null
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore "$env:USERPROFILE\.android\kayingcode-upload.p12" `
  -storetype PKCS12 `
  -alias kayingcode-upload `
  -keyalg RSA -keysize 2048 -validity 10000
```

macOS / Linux：

```bash
mkdir -p "$HOME/.android"
"$JAVA_HOME/bin/keytool" -genkeypair -v \
  -keystore "$HOME/.android/kayingcode-upload.p12" \
  -storetype PKCS12 \
  -alias kayingcode-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

PKCS12 通常使用同一个 keystore/key 密码；如 `keytool` 提示输入 key password，可直接回车沿用 keystore 密码，并在 `key.properties` 中把 `keyPassword` 设为相同值。检查别名和证书：

```bash
"$JAVA_HOME/bin/keytool" -list -v -keystore "$HOME/.android/kayingcode-upload.p12" \
  -storetype PKCS12 -alias kayingcode-upload
```

导出并登记到 Play Console 的只是**公钥证书**：

```bash
"$JAVA_HOME/bin/keytool" -exportcert -rfc \
  -keystore "$HOME/.android/kayingcode-upload.p12" \
  -storetype PKCS12 -alias kayingcode-upload \
  -file "$HOME/.android/kayingcode-upload-certificate.pem"
```

不要把 `.p12` 私钥交给 Play Console、提交到代码仓库或放进构建产物。`android/.gitignore` 已忽略 `key.properties` 和 `.jks`/`.keystore`；仍应将 `.p12` 放在仓库外。

### 配置本地 Gradle 签名

创建 `apps/kayingcode-mobile-flutter/android/key.properties`，保留在本机，不要提交：

```properties
storeFile=C:/Users/<Windows用户名>/.android/kayingcode-upload.p12
storePassword=<keystore 密码>
keyAlias=kayingcode-upload
keyPassword=<key 密码>
```

macOS / Linux 将 `storeFile` 换成实际绝对路径，例如 `/Users/<用户名>/.android/kayingcode-upload.p12`。绝对路径可避免 Gradle 相对路径从 `android/app` 目录解析时指错位置。检查 `git status --short`，确认该文件没有被 Git 跟踪。

### CI 密钥

CI 应从 Secret Manager 注入：

| Gradle 环境变量         | 内容                                |
| ----------------------- | ----------------------------------- |
| `ANDROID_STOREFILE`     | runner 临时目录中的 `.p12` 完整路径 |
| `ANDROID_STOREPASSWORD` | keystore 密码                       |
| `ANDROID_KEYALIAS`      | `kayingcode-upload`                 |
| `ANDROID_KEYPASSWORD`   | key 密码                            |

将 `.p12` 字节以 base64 保存为 CI secret；作业开始时解码到 runner 临时目录，并设置 `ANDROID_STOREFILE`。作业结束时删除。禁止打印 secret、输出解密命令或缓存/上传含密钥的临时目录，只给发布作业和受信任维护者访问权限。

## 构建并检查 AAB

所有 Flutter/Dart 命令使用仓库钉住的 FVM 版本：

```bash
cd apps/kayingcode-mobile-flutter
fvm flutter --version       # Flutter 3.35.5 / Dart 3.9.2
fvm flutter pub get
fvm flutter analyze
fvm flutter test --no-pub
```

发布前在 `pubspec.yaml` 增加版本，例如：

```yaml
version: 1.0.0+2
```

`1.0.0` 是用户看到的版本，`2` 是单调递增且从未使用过的 Android versionCode。也可在构建命令显式指定：

```bash
fvm flutter build appbundle --release \
  --build-name=1.0.0 \
  --build-number=2 \
  --no-pub
```

本工程 Gradle 会在 `bundleRelease` 前检查签名四项配置及 keystore 文件。Agent 使用以下目标入口执行 Play AAB 构建：

```bash
node scripts/flutter-target.mjs android bundle
```

Play 上传文件通常位于：

```text
build/app/outputs/bundle/release/app-release.aab
```

Play 首发推荐上传 AAB，由 Play 为设备生成优化 APK。需要线下测试 APK 时，使用 `node scripts/build-android-apk.mjs release`；不要将 Debug 包上传为正式版本。

上传前确认：

1. `applicationId` 为 `com.lingdian.kayingai.agent.code`，与 Play 应用记录的包名一致。
2. versionCode 高于该 Play app 所有已上传版本。
3. Release 使用已登记的 upload key，不是 Android debug certificate。
4. target API、权限、隐私政策、Data safety 和 Play Console 政策检查均通过。
5. 安装测试新构建，覆盖首次启动、相机/照片授权、配对、连接和附件核心流程。

## 创建 Play 应用并完成商店资料

1. 登录 [Google Play Console](https://play.google.com/console)，选择 **Create app**。
2. 填应用名 `KayingCode`、默认语言、App/Game、免费/付费、联系邮箱并接受当前声明和 Play App Signing 条款。
3. 确认 Play 创建的包名与工程 `applicationId` 完全一致。发布后不要更换包名。
4. 在 **Store presence / Main store listing** 填短描述、完整描述、图标、截图、功能图、分类、联系信息和支持网站；素材规格以控制台字段提示为准。
5. 在 **App content** 完成 Data safety、隐私政策、广告、目标受众、内容分级、应用访问和账号/数据删除等适用项目。结合代码、Relay/Node 数据流与第三方 SDK 填写，不要猜选“未收集”。
6. 如果审核员需要配对才能进入主功能，在 **App access** 提供可用演示环境、有效配对说明/测试凭据及逐步操作步骤；不要提供真实用户生产凭据。自托管 V2 链接默认 5 分钟、单次领取；审核周期较长时使用独立审核 Relay 配置长有效期/多领取，并为每位审核员提供单独链接或明确说明可重复领取，注明 Desktop 需保持在线。
7. 首次启用 Play App Signing 时，按控制台提示确认 Google 托管 app signing key，并登记本地 upload certificate。

## 先发测试轨道

1. 进入 **Test and release > Testing > Internal testing** 创建内部测试，上传 AAB，添加测试人员并发布测试版本。
2. 邀请测试者通过 Play 链接安装，验证升级、真实设备、Android 版本和后台限制。
3. 需要扩大范围时创建 Closed testing 或 Open testing。开放测试可能显示在 Play 商店，先确认资料适合公开。
4. Google Play 在 2023-11-13 后创建的个人开发者账号目前要求至少 **12 位测试者连续选择加入封闭测试 14 天**，再申请 Production access。按账号 Dashboard 和[官方说明](https://support.google.com/googleplay/android-developer/answer/14151465)确认适用性；不要把个人账号要求套用到组织账号。

## 正式发布

1. 完成 Dashboard 必需任务、Store listing、App content、定价/国家地区和正式 AAB。
2. 进入 **Test and release > Production > Create new release**，上传 AAB，确认版本号、变更说明、受支持设备和 Play App Signing 状态。
3. 检查 Play 自动报告的警告与错误；按计划选择国家/地区和分阶段 rollout 比例。
4. **Review release** 核查全部变更后提交审核/开始发布。若账号需要 Production access，先申请并等待批准。
5. 在 Publishing overview 跟踪审核和发布状态。发现崩溃、安装失败或政策问题时暂停 rollout，修复后用更高 versionCode 发布新 AAB。

## 后续版本与恢复

- 每次增加 `pubspec.yaml` build number，例如 `1.0.0+2` → `1.0.0+3`；通常不需要改 application ID 或上传密钥。
- 使用同一 upload key 发布更新。密钥丢失/泄露时，通过 Play Console 申请 upload key reset；这不会替换 Google 托管的 app signing key。
- 归档 AAB、SHA-256、versionName/versionCode、upload certificate 指纹、提交人和审核结果；私钥不要与产物一起归档。
- 检查最新 target API 截止时间、政策表单和隐私声明。

## 常见问题

| 问题                          | 处理                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| `Release signing is required` | 检查 `android/key.properties` 四项，或 CI 的大写环境变量          |
| keystore file does not exist  | `storeFile` 必须是 runner 上存在且可读的完整路径                  |
| 包名不匹配                    | 检查 `applicationId`；不要用 `namespace` 代替 applicationId       |
| version code 已使用           | 增大 `pubspec.yaml` 中 `+` 后整数并重建                           |
| signing certificate mismatch  | 检查是否使用已登记的 upload key；换 key 需通过 Play Console reset |
| target API 不合规             | 按 Play Console 报错升级 Flutter/Android SDK 并验证插件兼容性     |

## 官方资料

- [Flutter：Build and release an Android app](https://docs.flutter.dev/deployment/android)
- [Android Developers：Sign your app](https://developer.android.com/studio/publish/app-signing)
- [Android Developers：Target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Play Console：Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152)
- [Play Console：Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Play Console：Testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Play Console：Prepare and roll out a release](https://support.google.com/googleplay/android-developer/answer/9859348)
