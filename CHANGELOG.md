# Changelog

## [0.1.3](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.2...kaying-code-v0.1.3) (2026-11-10)

### 设置

- 新增「显示未读角标」开关（默认关闭），macOS Dock、Linux LauncherEntry 与 Windows 任务栏显示未读任务数量。
- 任务通知总开关关闭时角标开关置灰；关闭角标只上报 0，不清除未读状态，侧栏蓝点保持不变。
- `ProjectDirectoryProvider` 成为唯一上报者；多窗口取最大值，关闭窗口或卸载工作区后不再残留旧计数。

### 手机远控

- 「设置 → 远程设备」新增自定义 HTTPS Relay 地址，二维码、复制链接、设备注册/账号邀请、V2 HTTP 与 WebSocket 统一使用同一 origin。
- 修改地址后既有远控会话挂起，旧二维码不可复用；清空输入恢复部署默认 origin。

### 审核环境

- Relay 邀请与终端 TTL 支持按天配置，邀请可设置领取次数。
- Web 重开同一邀请时复用既有会话。
- Desktop 支持通过进程环境覆盖 Relay origin，用于自托管审核主机。
- Agent 审核 Token 预算支持环境级与会话级范围。
- 审核备注支持精简移动端链接，适配微信 200 字符限制。

### 界面

- 采用上游工作态加载指示器：像素轨道动画、working 文案与按轮次耗时计时的十分之一秒计时器，兼容深色主题、减弱动效与中英文文案。

### 文档与构建

- 新增开发与贡献指南、上游 ZCode 同步流程说明。
- 补充 Ubuntu 审核主机、应用审核部署与自托管 Relay 文档，新增移动端商店截图库。
- 签名构建全部成功后由 GitHub Actions 自动汇总制品并发布 Release。

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
