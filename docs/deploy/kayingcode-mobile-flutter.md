# Flutter 移动壳部署

应用：`apps/kayingcode-mobile-flutter`，Dart 包名 zflow，应用身份 `com.lingdian.kayingai.agent.code`。返回[部署汇总](../deploy.md)。

## 接入

先部署 [Cloudflare V2 与固定上游 Web](kayingcode-relay-cloudflare.md)。添加桌面生成的完整 HTTPS V2 授权链接后，在 WebView 打开；Web 处理授权、工作区、会话和恢复，执行复用已有 Desktop Host。失效邀请需在桌面重新生成。旧配对码、审批、hash/t 与自有 native KayingCode adapter 已退役，没有原生旧协议回退开关。上游 ZCode 默认使用 Web，受支持入口保留原生 V2 OAuth/ws2。

应用商店审核需要跨多天、多人使用时，按[审核环境部署](kayingcode-review-environment.md)使用独立审核 Relay 和 Ubuntu Desktop Host；邀请有效期、领取次数和终端凭据有效期在 Relay 端配置，客户端不需要改动。

外壳拥有本地档案与 WebView 生命周期，旧档案不自动擦除；导出不携带原生 OAuth 凭据。不要将授权链接或凭据放入构建配置、日志或截图。

## 固定 SDK 与构建

先读[应用 AGENTS](../../apps/kayingcode-mobile-flutter/AGENTS.md)。以下在应用目录执行：

```sh
node scripts/flutter-target.mjs android check
node scripts/flutter-target.mjs android pub-get
node scripts/flutter-target.mjs android analyze
node scripts/flutter-target.mjs android test
node scripts/flutter-target.mjs android debug
node scripts/flutter-target.mjs android release
```

Android/iOS 使用项目 `.fvm/flutter_sdk` 固定的 Flutter 3.35.5。缺少 SDK 时先按应用 AGENTS 配置，不修改全局 PATH、.fvmrc 或锁文件来绕过版本检查。切换 iOS/windows/ohos 时先执行对应目标 check，再用同一入口构建。鸿蒙使用独立 CPF-Flutter SDK，不能在应用根目录执行其 pub get。

iOS 需要 macOS/Xcode、CocoaPods 和发布签名；打开 ios/Runner.xcworkspace。Android 正式发布需要发布密钥，不能使用 debug 签名交付升级。平台教程：[Android](../../apps/kayingcode-mobile-flutter/docs/release/android-google-play.md)、[iOS](../../apps/kayingcode-mobile-flutter/docs/release/ios-app-store.md)、[鸿蒙](../../apps/kayingcode-mobile-flutter/docs/release/ohos.md)。

## 验收与升级

analyze、单元/Widget 测试、安装启动与真实 WebView 分别记录。真机覆盖扫码或粘贴新链接、打开 Web、首发/回复、刷新恢复、前后台与网络切换；过期邀请重新生成。Widget 与替身页面测试不代表生产链路通过。iOS 后台长连接和推送不承诺可用。

保留旧本地档案和安全存储，不因迁移自动清空用户数据。回退只能使用与当前 V2 服务兼容的完整制品，不能恢复已退役旧协议。Pods、构建缓存、签名材料及模拟器数据不入库。

源码依据：[应用 README](../../apps/kayingcode-mobile-flutter/README.md)、[当前接入 spec](../../apps/kayingcode-mobile-flutter/spec/legacy-relay-retirement.md)。
