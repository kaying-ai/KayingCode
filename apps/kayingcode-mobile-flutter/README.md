# KayingCode Flutter 移动壳

[简体中文](README.md) · [English](README.en.md)

本工程提供 Android/iOS 客户端、Windows 竖屏体验及鸿蒙壳工程。鸿蒙真机接入需独立验收。开源许可与源码归属见 [NOTICE](../../NOTICE.md)。

移动端通过桌面生成的 HTTPS V2 授权链接连接自托管 KayingCode。WebView 中的工作台负责授权、工作区、会话与回复，移动壳负责保存连接及最近项目。

| 路径 | 职责 |
| --- | --- |
| lib/protocol/connection_params.dart | V2 链接解析，拒绝旧格式 |
| lib/ui/bot_webview_uri.dart | 自托管完整 URL 交接，无发现/claim 请求 |
| lib/ui/zcode_webview_page.dart | 平台 WebView 生命周期、刷新与错误重试 |
| lib/state/account_store.dart | 本地档案串行写入、origin+SID 去重及安全存储 |

添加自托管 Bot 后点击卡片打开 Web。过期或已消费的邀请需在桌面刷新；旧本地档案可删除后重新添加，不自动擦除历史存储。导入导出不包含原生 OAuth 账户凭据。

## SDK 与验证

先阅读 [AGENTS.md](AGENTS.md)。以下命令在本应用目录执行：

```sh
node scripts/flutter-target.mjs android check
node scripts/flutter-target.mjs android analyze
node scripts/flutter-target.mjs android test
node scripts/flutter-target.mjs android build apk --release
```

Android/iOS 使用 `.fvm/flutter_sdk` 固定的 Flutter 3.35.5。切换 iOS/Windows/鸿蒙必须先通过同一脚本的目标 check，再用同一入口构建；不得修改 `.fvmrc`、根 pubspec.lock 或全局 PATH 来切平台。鸿蒙使用独立 CPF-Flutter 3.35.8-ohos-1.0.4，详见 [鸿蒙发行](docs/release/ohos.md)。

平台教程：[Android](docs/release/android-google-play.md)、[iOS](docs/release/ios-app-store.md)、[鸿蒙](docs/release/ohos.md)。安装/签名和发布步骤以这些教程及实际 SDK 检查为准；单元/Widget 测试不能代替真机 WebView、权限和扫码验收。

当前协议规则见 [退役与接入 spec](spec/legacy-relay-retirement.md)。后端部署见 [Cloudflare V2](../../docs/deploy/kayingcode-relay-cloudflare.md)，无需在本机启动旧 Relay + Node 配对环境。
