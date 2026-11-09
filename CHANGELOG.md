# Changelog

## [0.1.2](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.1...kaying-code-v0.1.2) (2026-11-09)

### 许可与合规

- 项目根许可切换为 GNU AGPL-3.0（SPDX：`AGPL-3.0-only`），新增中英文隐私声明与商用授权说明。
- 上游 ZCode 派生部分继续适用 Apache-2.0；内置插件与第三方组件保留各自声明的许可。

### 文档与下载

- README 顶部新增 Windows、macOS、Linux、Android 下载入口与当前版本说明。
- 补充联系与交流方式（微信二维码、service@kayingai.com）。
- 恢复内置插件总览与协议评估文档。

### 构建

- Windows 验签门禁允许自签或未受信任根证书，仍要求安装器带签名并记录验签诊断。

## 0.1.1

- 修复浏览器生命周期与 TapTap Maker 预览路由，预览面板复用平台预览链路。
- 内置 kaying-for-taptap 插件升至 `0.1.1`，随包分发重建的原生运行时（core / t3m）。
- 新增游戏开发插件展示、插件技能详情与游戏试玩插件。
- 移动端支持 ZCode v2 与平台专属接入，补充简体中文、繁体中文与英文文案。
- 加固 macOS 签名与公证流程，安装包发布前仍需完成签名、许可与更新源验收。

## 0.1.0 (unreleased)

- 首次公开源码基线，版本从 `0.1.0` 开始。
- Desktop、Android 和 iOS 使用新的安装标识；旧产品不承诺原位升级或自动迁移。
- 发布安装包前仍需通过签名、许可、设备与更新源验收。本条目不表示制品已经发布。

本项目衍生自 ZCode；上游归属和第三方声明见 [README.md](README.md)、[LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。旧产品的 3.x 发布记录保留在旧仓库历史中，不构成新产品的连续升级记录。
