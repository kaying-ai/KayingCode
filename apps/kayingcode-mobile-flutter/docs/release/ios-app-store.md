# iOS 发布：App Store 与 TestFlight

本指南针对本 Flutter 工程，说明 Apple 开发者账号、iOS 签名资产、构建、TestFlight、App Store Connect 审核与发布。iOS 发布必须在 macOS 上使用 Xcode；Windows 不能完成签名、Archive 或 App Store Connect 上传。

## 工程发布身份

| 项目             | 当前值                                      | 规则                                                                                      |
| ---------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Flutter 工程版本 | 见 `pubspec.yaml`                           | `+` 前是商店版本，`+` 后是 Apple build number                                             |
| Bundle ID        | `com.lingdian.kayingai.agent.code`          | 必须与 App ID 和 App Store Connect app record 完全一致                                    |
| App 展示名称     | `KayingCode`                                | 来自 `ios/Runner/Info.plist` 的 `CFBundleDisplayName`                                     |
| 最低 iOS         | 13.0                                        | 当前 `IPHONEOS_DEPLOYMENT_TARGET`                                                         |
| 签名             | Xcode `CODE_SIGN_STYLE = Automatic`         | 推荐 Xcode 自动管理 Distribution certificate 与 App Store profile；个人 Team 不提交到仓库 |
| 权限用途说明     | `Info.plist` 已包含相机、照片和本地网络说明 | 权限用途变化时同步更新说明、隐私声明和审核资料                                            |

`pubspec.yaml` 的 version 会传入 `CFBundleShortVersionString`，`+` 后数字会传入 `CFBundleVersion`。每次上传必须使用未曾上传过且递增的 build number；同一商店版本可上传多个不同 build number 的构建。

## 前置条件

1. 加入 [Apple Developer Program](https://developer.apple.com/programs/)。组织发布需 Account Holder 完成组织验证和协议签署；按账号角色分配最小必要权限。
2. 使用 App Store Connect 当前接受的 Xcode 与 iOS SDK。**截至 2026-04-28，上传应用要求 Xcode 26 或更新版本及 iOS 26 SDK**；发布当天核对 [Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/) 和上传页面。
3. 安装项目指定 Flutter 3.35.5、依赖、Xcode Command Line Tools 和 CocoaPods。
4. 准备商店资料：名称、副标题、描述、关键词、分类、支持 URL、隐私政策 URL、截图、年龄评级、定价/地区和联系信息。
5. 准备审核说明与可用测试路径。KayingCode 核心功能连接桌面端/Relay；为审核员提供稳定可访问的演示环境、配对步骤和必要测试凭据，不要提供生产用户凭据。自托管 V2 链接默认 5 分钟、单次领取；审核周期较长时，使用独立审核 Relay 并配置邀请有效期、领取次数和终端凭据有效期，为每位审核员提供单独链接，或提供一条明确配置为多次领取的链接。审核期间保持 Desktop 远控和工作区在线。

本工程 Flutter 固定为 3.35.5。先在发布 Mac 上确认该版本与 App Store 当期要求的 Xcode/SDK 能正常构建；若不兼容，按项目 FVM 流程升级并提交 `.fvmrc`/`.flutter-version`，不要混用全局 Flutter 来规避构建错误。

## Apple 签名与密钥管理

Apple 发布涉及三种不同资产：

- **Apple Distribution certificate**：签署 App Store 构建。私钥保存在创建证书的 Mac Keychain。
- **App Store provisioning profile**：关联 App ID、Distribution certificate 和 App Store 分发用途。自动签名时由 Xcode 管理。
- **App Store Connect API key**（可选）：供 CI/Transporter 自动上传或调用 API 使用；它不负责签署 iOS app。

不要混淆证书私钥、provisioning profile 和 App Store Connect API key。个人/单机发布首选 Xcode 自动签名；团队 CI 按下文安全管理签名资产。

### 推荐：Xcode 自动签名

1. 在 Mac 登录 Xcode：**Xcode > Settings > Accounts**，添加属于 Apple Developer Program 的 Apple Account。
2. 打开 `ios/Runner.xcworkspace`，不要用 `.xcodeproj` 替代 workspace。
3. 选择 **Runner project > Runner target > Signing & Capabilities**。
4. 勾选 **Automatically manage signing**，选择正确 **Team**，确认 Bundle Identifier 为 `com.lingdian.kayingai.agent.code`。
5. Xcode 会按需创建/更新签名证书和 profile。不要把个人 `DEVELOPMENT_TEAM` 写入共享源码或提交个人签名配置。

### 手动创建 Distribution certificate（CI 或手动签名）

1. 在 macOS **Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority** 创建 CSR 并保存。
2. 登录 Apple Developer **Certificates, Identifiers & Profiles > Certificates > +**，选择 **Apple Distribution**，提交 CSR 并下载 `.cer`。
3. 双击安装 `.cer`。Keychain Access 的 **My Certificates** 中必须显示证书及其私钥；只有 `.cer` 不能签名。
4. 从 Keychain Access 将证书和私钥导出为有密码保护的 `.p12`。
5. 在 **Profiles** 为 `com.lingdian.kayingai.agent.code` 创建 **App Store Connect** profile，关联 Distribution certificate，下载并安装。

App Store profile 不需要登记测试设备 UDID；Ad Hoc profile 面向设备限定分发，不是 App Store 上传 profile。迁移 Mac 时必须安全迁移 `.p12` 私钥及 profile，不能只复制 `.cer`。

### 密钥备份、轮换与 CI

- 用团队密码管理器保管 `.p12` 导出密码；加密备份证书私钥、profile、API key 的 Key ID / Issuer ID、用途、创建者和到期时间，并演练恢复。
- App Store Connect `.p8` private key 只在创建时提供一次下载。放入受控 Secret Manager，禁止提交、邮件发送或输出到构建日志。
- CI 只给受保护的发布 job 访问 secrets；不要缓存 Keychain、`.p12`、`.mobileprovision` 或 `.p8` 临时文件。
- 私钥泄露时按 Apple Developer 流程撤销证书、重新签发并更新 profile 和 CI secrets。先协调正在进行的发布作业。
- API key 是团队服务凭据；即使用它上传，也仍需要有效的 iOS code signing。

### 可选：App Store Connect API key

在 App Store Connect **Users and Access > Integrations > App Store Connect API** 创建团队 API key，下载 `.p8` 并记录 Issuer ID / Key ID。只授予上传所需权限。手工发布可以从 Xcode Organizer 上传，避免额外 API key；CI 可将 `.p8` 存入 Secret Manager，供 Transporter 或 Apple 官方 API 工具授权。

## 创建 App Store Connect app record

1. 登录 [App Store Connect](https://appstoreconnect.apple.com/)。Account Holder 先完成适用的 **Agreements, Tax, and Banking** 协议。
2. 进入 **Apps > + > New App**，选 iOS，填写 App Name `KayingCode`、主要语言、Bundle ID `com.lingdian.kayingai.agent.code` 和唯一 SKU。
3. 上传 build 之前必须创建 app record；Bundle ID 必须与 Xcode target 一致。
4. 补齐商品页元数据、支持 URL、隐私政策 URL、年龄评级、版权、价格和可用地区。
5. 在 **App Privacy** 申报 app 与第三方 SDK 收集/使用的数据。以当前代码、Relay/Node 数据流、网络服务和所有 SDK 行为为依据；隐私政策 URL 对 iOS app 必填。
6. 在审核备注中写清用途、测试设备/系统、配对和连接步骤、外部服务依赖、演示环境和进入核心功能的方法。当前审核域名、链接规则和备注模板见[应用审核方案](../../../../docs/deploy/kayingcode-app-review.md)。

## 更新版本并构建

在项目目录执行：

```bash
cd apps/kayingcode-mobile-flutter
fvm flutter --version
fvm flutter pub get
fvm flutter analyze
fvm flutter test --no-pub
```

上传前更新 `pubspec.yaml`，例如：

```yaml
version: 1.0.0+2
```

`1.0.0` 对应商店营销版本，`+2` 对应 CFBundleVersion。App Store Connect 每次上传都要求未使用过的 build number。

### 方式 A：Xcode Archive（推荐）

1. 打开 `ios/Runner.xcworkspace`，选择 Runner scheme 与 **Any iOS Device (arm64)**。
2. 在 Signing & Capabilities 确认 Team、Bundle ID、Automatically manage signing 和所需 capabilities。
3. 选择 **Product > Archive**。如果 Archive 不可选，确认 destination 不是模拟器。
4. Xcode Organizer 选中 archive，先点 **Validate App**。处理签名、版本、privacy manifest 或 entitlement 错误后重新 Archive。
5. 选择 **Distribute App > App Store Connect > Upload**，检查签名和上传选项后完成上传。

### 方式 B：Flutter CLI 生成 IPA

完成 Xcode Team/自动签名设置且此 Mac 可访问签名资产后运行：

```bash
fvm flutter build ipa --release \
  --build-name=1.0.0 \
  --build-number=2
```

成功后检查：

```text
build/ios/archive/Runner.xcarchive
build/ios/ipa/*.ipa
```

可通过 Xcode Organizer 上传 `.xcarchive`，或用 Apple Transporter 上传 `.ipa`。若团队采用固定导出选项，可先在 Xcode Organizer 导出一次，再使用：

```bash
fvm flutter build ipa --release \
  --build-name=1.0.0 \
  --build-number=2 \
  --export-options-plist=path/to/ExportOptions.plist
```

iOS 发布必须在 macOS/Xcode 运行，不能在 Windows 上生成可提交的签名包。

## 隐私、权限与提交前检查

1. 确认 `ios/Runner/Info.plist` 的相机、照片和本地网络用途说明仍准确；新增权限时，只申请功能必要的权限并写明用途。
2. 检查 archive 内的 `PrivacyInfo.xcprivacy` 与 Required Reason API 声明。Flutter 插件/第三方 SDK 可能自带 privacy manifest；按 Apple 当前要求检查每个集成 SDK，不能仅凭主 app 目录没有文件就断定无需处理。
3. App Privacy 应覆盖 app 和第三方合作方。凭据加密保存在设备，不代表 Relay/Node 端没有接收或处理数据。
4. 如包含加密功能，按实际情况完成 Export Compliance 问题；不要盲目声明“免出口合规”。
5. 提交真实截图、应用描述和当前年龄评级问卷，不放尚未实现功能的宣传图。
6. 为审核员提供可用配对/服务环境。默认一次性、5 分钟的 V2 链接需要安排测试时段；跨多天审核使用独立审核 Relay 的长有效期/多领取配置，并在备注中写明有效时长、Desktop 在线要求和备用链接。
7. 先用 TestFlight 在真实设备测试冷启动、扫码/粘贴二维码、连接、会话列表、附件及拒绝权限路径。

Apple 对部分常见第三方 SDK 要求包含有效 privacy manifest。提交前检查[当前隐私清单要求](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)和 App Store Connect 构建验证报告。

## TestFlight、审核和正式发布

1. 上传后等待 Apple 处理 build；处理完成后在 **TestFlight** 查看状态、导出合规和测试信息。
2. 先建 Internal Testing 测试组；需要外部测试时创建 External Testing group，并完成 Apple 要求的 beta review。
3. 通过 TestFlight 在真实设备验证。发现缺陷时增加 build number，重新构建上传。
4. 在 iOS app version 页面补齐元数据、选择处理完成的 build、填写 App Review Information 和联系信息。
5. 选择手动、自动或分阶段发布策略。点击 **Add for Review** 创建 submission 后，再点 **Submit for Review** 正式提交。
6. 在 App Store Connect 跟踪 Waiting for Review / In Review / Rejected / Approved 状态。被拒时阅读 Resolution Center 原因，修复后上传更高 build number 并回复审核团队。
7. 通过审核后按发布策略上线；确认商店页面、下载、启动和崩溃指标。

## 后续版本与常见问题

- 每次上传增加 build number（例如 `1.0.0+2` → `1.0.0+3`）；新商店版本时同时提升 `1.0.0`。
- 保持 Bundle ID 不变，不要用另一 Apple Team 的证书签署现有 app。
- 定期检查 Apple 的 Xcode/SDK 上传门槛、年龄评级、隐私 manifest 和加密声明。
- 归档 `.xcarchive`、IPA SHA-256、version/build number、证书指纹、提交人和审核结果。私钥/API key 单独存入密码管理器或 Secret Manager。

| 问题                             | 处理                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `No profiles for ... were found` | 检查 Apple Account 的 Team、App ID、Bundle ID；首选 Xcode 自动签名并刷新 profiles |
| 找不到 distribution private key  | `.cer` 不含私钥；回到创建 CSR 的 Mac Keychain 找原私钥，或由管理员创建新签名资产  |
| App Store Connect 找不到 build   | 等待 Apple 处理并查看邮件；确认 Bundle ID 与 version/build number                 |
| build number 已用                | 增大 `pubspec.yaml` 的 `+N`，重新构建上传                                         |
| SDK/Xcode 太旧                   | 安装符合 Apple 最新上传要求的 Xcode/SDK，并确认 Flutter 与插件兼容                |
| 隐私或权限被拒                   | 核对隐私政策、App Privacy、Info.plist、privacy manifest、SDK 行为和审核备注       |

## 官方资料

- [Flutter：Build and release an iOS app](https://docs.flutter.dev/deployment/ios)
- [Apple Developer Program](https://developer.apple.com/programs/)
- [Apple：Certificates overview](https://developer.apple.com/help/account/create-certificates/certificates-overview)
- [Apple：Create an App Store Connect provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile)
- [App Store Connect：Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)
- [App Store Connect：Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)
- [App Store Connect：Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Apple：Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Apple：Privacy manifests for apps and third-party SDKs](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)
- [App Store Connect：Complete review information](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review)
- [App Store Connect：Submit an app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/)
