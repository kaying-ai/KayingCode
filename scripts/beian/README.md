# KayingCode App 备案签名信息工具

本目录提供 Android、iOS、HarmonyOS 三个平台的签名信息提取脚本。脚本从实际签名产物或发行证书读取包标识、公钥和证书指纹，供 App 备案表单填写。

脚本只读取公开签名证书和应用产物，不读取私钥、keystore 密码或 Profile 密码，不构建、不重新签名、不上传应用，也不会连接备案平台。需要先确认所选文件确实是准备备案和分发的 Release 版本。

## 快速开始

### 环境要求

- Python 3.10 或更高版本。
- OpenSSL 命令行工具。macOS 通常已提供；Windows 可安装 OpenSSL 并将 `openssl` 加入 `PATH`。
- Android：Android SDK Build-Tools，需可执行 `apksigner` 和 `aapt`。可以将对应 `build-tools/<版本>` 目录加入 `PATH`，或设置 `ANDROID_SDK_ROOT` / `ANDROID_HOME`。
- iOS：仅 macOS；需要 Xcode Command Line Tools 提供的 `codesign`。
- HarmonyOS：提供 AppGallery Connect 下载的签名证书链 `.cer`；如输入 `.p7b`，它必须是可解析的 PKCS#7 证书包，不能是 Profile 文件。

从仓库根目录运行：

```bash
python3 scripts/beian/android_app_signature.py \
  apps/kayingcode-mobile-flutter/build/app/outputs/flutter-apk/KayingCode-0.1.0-android-universal.apk

python3 scripts/beian/ios_app_signature.py \
  apps/kayingcode-mobile-flutter/build/ios/ipa/KayingCode.ipa

python3 scripts/beian/harmony_app_signature.py \
  /path/to/app-release-certificate-chain.cer \
  --package-id com.lingdian.kayingai.agent.code
```

添加 `--json` 可以输出 JSON，便于复制到其他自动化流程：

```bash
python3 scripts/beian/android_app_signature.py path/to/release.apk --json
python3 scripts/beian/ios_app_signature.py path/to/release.ipa --json
python3 scripts/beian/harmony_app_signature.py path/to/release.cer --json
```

参数错误、输入无效、签名校验失败或签名证书无法唯一确定时，脚本向标准错误输出原因并以非零状态退出。

## Android

### 输入与校验

输入已签名的 `.apk`。脚本使用 Android SDK 的 `apksigner verify` 校验 APK，再从 v3.1、v3、v2 签名块提取 signer 证书；没有 v2/v3 签名块时尝试从 v1 `META-INF/*.RSA`、`*.DSA` 或 `*.EC` 签名文件提取证书。包名通过 `aapt dump badging` 读取。

仅支持一个 signer 的 APK。多 signer APK 会报错，需确认备案平台是否要求为每个 signer 分别登记特征信息。

### 输出字段

- `packageId`：APK 的 applicationId。
- `publicKeyHex`：签名证书公钥。RSA 证书输出模数的十六进制表示，不包含 ASN.1 正数填充字节 `00`。
- `publicKeyDecimal`：同一 RSA 模数的十进制表示；表单允许十进制时可用。
- `md5Fingerprint`：实际 signer 证书的 MD5 指纹，32 位十六进制，不带冒号。
- `signatureVerified`：`apksigner` 校验成功时为 `true`。

### 示例

```bash
python3 scripts/beian/android_app_signature.py \
  apps/kayingcode-mobile-flutter/build/app/outputs/flutter-apk/KayingCode-0.1.0-android-universal.apk
```

如果提示找不到工具，可按本机 SDK 位置设置环境变量：

```bash
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" # macOS 示例
export PATH="$ANDROID_SDK_ROOT/build-tools/36.1.0:$PATH"
```

请以本机实际安装的 Build-Tools 版本替换示例中的 `36.1.0`。

## iOS

### 输入与校验

输入已签名的 `.ipa`、`.app` 或 `.xcarchive`。IPA 会被安全解包到系统临时目录；随后由 `codesign --verify --deep --strict` 校验签名，并从实际签名的 App 中提取 Bundle ID、签名身份和叶证书。临时文件在命令退出后清理。

请优先输入准备提交 App Store Connect 的 `.ipa` 或 `.xcarchive`。开发签名和 Distribution 签名会产生不同的证书指纹；脚本显示 `signingIdentity`，提交备案前应确认它符合计划分发的签名方式。

### 输出字段

- `packageId`：iOS Bundle ID。
- `signingIdentity`：`codesign` 报告的签名身份。
- `publicKeyHex`：RSA 证书公钥模数的十六进制表示。
- `publicKeyDecimal`：同一 RSA 模数的十进制表示。
- `sha1Fingerprint`：签名叶证书 SHA-1 指纹，40 位十六进制，不带冒号。
- `signatureVerified`：`codesign` 严格校验成功时为 `true`。

### 示例

```bash
python3 scripts/beian/ios_app_signature.py \
  apps/kayingcode-mobile-flutter/build/ios/ipa/KayingCode.ipa
```

如果要核对 Archive 中的签名：

```bash
python3 scripts/beian/ios_app_signature.py \
  apps/kayingcode-mobile-flutter/build/ios/archive/Runner.xcarchive
```

App Store Connect 上传的 IPA 与 Xcode Archive 可能使用不同导出签名。备案信息应对应计划分发的证书；启用商店托管重签时，请再核对商店实际分发证书。

## HarmonyOS

### 输入与证书链选择

输入 AppGallery Connect 为该应用签发的 Release `.cer` 证书链。脚本解析 PEM、DER 或 PKCS#7 证书包，并要求证书链中恰有一个 `CA:FALSE` 的叶证书。公钥和指纹均从该叶证书计算，避免误用 Huawei 根 CA 或中间 CA。

脚本本身不验证 `.app` / `.hap` 的 HAP 签名。应使用与最终 Release 包相同的 AppGallery Connect 证书；更换签名证书后，重新运行本工具并更新备案特征信息。

### 输出字段

- `packageId`：只有传入 `--package-id` 时输出；脚本不会从证书推断包名。
- `publicKeyHex`：证书公钥点的十六进制表示。椭圆曲线未压缩公钥点通常以 `04` 开头；不要将它替换成证书链中 CA 的公钥。
- `md5Fingerprint`：叶证书的真实 MD5 指纹，32 位十六进制，不带冒号。
- `sha1Fingerprint`：叶证书的 SHA-1 指纹，40 位十六进制，不带冒号。

Huawei Cloud 的 HarmonyOS 备案指南要求填写证书公钥和证书指纹，并注明这里显示的指纹是 SHA-1，可作为“MD5 值”备案。因此若使用华为云备案页面的鸿蒙签名指纹栏，按该指南填 `sha1Fingerprint`；若接入商明确要求实际 MD5，则填 `md5Fingerprint`。请以当前备案页面和接入商说明为准：[华为云 App 特征信息及其获取方式](https://support.huaweicloud.com/usermanual-icp/zh-cn_topic_0000002085120221.html)。

### 示例

```bash
python3 scripts/beian/harmony_app_signature.py \
  /Users/you/work/app-release-certificate-chain.cer \
  --package-id com.lingdian.kayingai.agent.code
```

不要传入 `.p12`、CSR、私钥或保存签名密码的配置文件。`.p7b` 若是 AppGallery Connect 的发布 Profile 而非证书包，也不能作为本工具输入。

## 公钥格式说明

不同签名算法的公钥表示不同：

| 公钥算法   | `publicKeyHex` 的含义                              | 其他表示                                    |
| ---------- | -------------------------------------------------- | ------------------------------------------- |
| RSA        | RSA 模数，去除前导 `00` 后的十六进制字符串         | `publicKeyDecimal` 为同一模数的十进制字符串 |
| EC / ECDSA | X.509 证书公钥点的十六进制字节串，通常以 `04` 开头 | 不生成十进制值                              |

备案表单若允许十六进制，直接粘贴 `publicKeyHex`，不要加空格、换行、冒号或 `0x` 前缀。指纹也去掉冒号后再粘贴。

## 测试

在仓库根目录运行：

```bash
python3 -m unittest discover -s scripts/beian -p 'test_*.py'
```

测试覆盖 Android v2 签名块中的 signer 证书提取，以及包含 CA 根证书的 HarmonyOS 证书链叶证书选择和公钥解析。端到端签名校验应另外用本机 Android SDK、Xcode 和 AppGallery Connect 发布证书运行各平台示例命令。
