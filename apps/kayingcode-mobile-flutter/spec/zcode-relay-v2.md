# Flutter ZCode Relay V2

> UI 入口已由 [zcode-webview.md](zcode-webview.md) 迁移到官方网页容器；下列原生协议实现暂保留作回归，不是 Flutter ZCode 的正常连接路径。

- 与 TS core 的 `spec/zcode-relay-v2.md` 同步支持 V2 URL、账户登录、remote/token、ws2、秒级帧与 auth_ack 门禁；拒绝旧版 HMAC 链接，不保留兼容分支。
- 登录按 origin 隔离，使用既有安全存储保存账户 JWT；不写设备档案、导出或日志。401 清除凭据并引导登录。
- 首次连接 V2 Bot 时展示登录页，选择电脑端相同的 Z.ai / BigModel 后，用 url_launcher 打开服务端 authorize_url。保持服务端 callback，按间隔轮询；返回应用后可手动检查。
- 登录页仅拥有展示与一次 pending login 的生命周期；关闭/卸载使迟到结果失效。AppSession 继续拥有连接与设备激活代数，RelayClient 继续拥有 socket 与桥恢复。
- UI 支持简中、繁中、英文以及深浅主题。Android/iOS/OH 共用 Dart 实现，不修改 SDK/锁文件；通过 flutter-target 入口验证上游 SDK。
- 验收：链接兼容、OAuth 状态/失效/取消、JWT 安全存储隔离、V2 帧/重连与旧协议回归；widget 测试覆盖登录选择和取消。真机授权、iOS/OH 发布验证如未执行须明确说明。
- 本地化 UI 门禁在匹配既有白名单前统一路径分隔符，Windows 与 macOS/Linux 必须应用相同的文件豁免，不扩展豁免范围。
