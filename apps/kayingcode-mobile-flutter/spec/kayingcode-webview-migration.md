# KayingCode WebView 接入

当前规则以 [V2 退役与接入规范](legacy-relay-retirement.md) 为准，取代此前的 v1 配置发现、自有 H5 与原生回退计划。

- 仅接收桌面生成的完整 HTTPS V2 授权链接，WebView 原样打开，不请求 /v1/client-config，不 claim、不建立旧 attachment。
- Bot 卡片、设备管理与冷启动最近 Bot 复用同一导航，连续点击只保留一个容器；迟到 load/error 不覆盖新实例。
- Web 拥有授权、工作区、会话和恢复，Flutter 仅拥有档案、最近入口与 WebView 生命周期，不读取 Web JWT/Cookie。
- 旧配对码、fragment v1、hash/t 和原生 KayingCode adapter/构建开关已退役。历史档案与安全存储不自动擦除，失效邀请由桌面重新生成。
- 返回优先网页历史，无历史则关闭；刷新、失败重试及引擎不可用提供明确动作。Android 文件选择复用现有 FilePicker；iOS/Windows/鸿蒙引擎能力逐端验收。
- 固定 SDK 规则见应用 AGENTS；Android/iOS 使用 Flutter 3.35.5，鸿蒙独立暂存与锁文件不变。

```text
AccountStore 档案 → 单一 WebView → 上游 Web 授权 → 已有 Desktop Host
                       ↑ 只管理生命周期           ↑ 会话事实与恢复
```

验证包括三个入口、URL 原样交接、档案隔离、刷新/错误/迟到事件与旧格式拒绝。浏览器/Widget 不代替真机 WebView 或生产扫码验收。

## 历史验证记录

以下仅追溯当时执行结果，不表示旧协议仍受支持。

## 验证记录（2026-11-05）

- `node apps/kayingcode-mobile-flutter/scripts/flutter-target.mjs android check` 确认上游 Flutter 3.35.5。
- `android test` 119 项全部通过，包含 V2 原始 URL 交接、非法 scheme/path/旧 hash 拒绝，以及 v1 Web 二维码按 Bot scope 发现。
- 未执行：iOS/鸿蒙测试目标与真机 WebView；真机验收仍待执行。
