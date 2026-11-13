# Changelog

## [0.1.5](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.4...kaying-code-v0.1.5) (2026-11-13)

### Features

* **taptap:** add lighting audit and per-file sampling ([2521880](https://github.com/kaying-ai/KayingCode/commit/2521880623385072e0eea561fd8a811aa7252dd1))
  * add a lighting topic for tone mapping, shadow bias/camera, tsun and post-processing
  * sample long topics per file (first/last 400) so late game code is not truncated
  * narrow the tsun pattern to the quoted source token
  * skip game.bundle.js when game.pretty.js exists

* **taptap:** add source audit and compare acceptance gate ([af48c1c](https://github.com/kaying-ai/KayingCode/commit/af48c1cfb986d1b10cf36799d53c0481ce9efbee))
  * add t3m audit with control-flow, shader, material, model, animation and UI evidence
  * include a GLB material table (clearcoat/emissiveStrength/doubleSided/COLOR_0)
  * skip *.bundle.js when its readable *.pretty.js exists
  * reject accept when side-pane compare metrics are missing, failed or stale
  * keep non-side-pane compare evidence as a warning for fallback workflows
  * update commands, references and policy tests

* **taptap:** close replay P0/P1 evidence gaps ([53b1470](https://github.com/kaying-ai/KayingCode/commit/53b1470e322485f2f4016128baafd12ea8792ad7))
  * add rb/ab/return-null control-flow patterns and library hit counts
  * add target-consistency report via audit --target
  * warn when gameplay screenshots are older than the latest scripts
  * validate visual_fixes source_evidence row by row
  * reject compare evidence without visual_review_mode
  * add compare profile state/freeze and a Turbo Tails golden fixture

* **taptap:** warn on missing source evidence at accept ([602188b](https://github.com/kaying-ai/KayingCode/commit/602188bd02ea3043816c1ccd6a7270fd14cba39f))
  * create source/SOURCE_NOTES.md and source/audit/ templates on init
  * warn when SOURCE_NOTES is missing, empty, unfilled or lacks file:line
  * warn when visual_fixes or gameplay_screenshot artifacts are missing
  * keep runtime_log/maker_url as hard gates and --force as the escape hatch
  * cover the warning branches with native unit tests


### Bug Fixes

* **taptap:** discover comparison guests through Browser Use ([564dbb9](https://github.com/kaying-ai/KayingCode/commit/564dbb9e209e3e0c3113e01bb8c7f77b024b2abe))
  * prepare_visual_comparison 成功响应返回回执 tab group，并提示在当前桌面会话探测、认领双 guest、串行截图后用 t3m compare
  * 新增 buildPluginBrowserCompareTabGroup，UI 与 MCP 共用同一组名构造，避免两边字符串漂移
  * 续做任务按当前会话重新探测，不沿用历史 Browser Use 错误；原始 PNG 先复制到工作区证据目录再交给转写 MCP
  * 同步 SKILL、visual-compare 参考与 preview-workflow spec，新增 MCP 端到端测试

* **ui:** preserve selected project when trying a plugin ([adfc469](https://github.com/kaying-ai/KayingCode/commit/adfc469ca3d75ee0c1ac296ead06fd74b85e041c))


### Documentation

* **agents:** document automated release workflow ([6ac70ec](https://github.com/kaying-ai/KayingCode/commit/6ac70ecce996c84e977ae7cbd9aa7b96df983dca))

* **taptap:** add real-project replay evaluation ([e5ac8ac](https://github.com/kaying-ai/KayingCode/commit/e5ac8ac01615a9c224961646d3eb59c583c49b69))

* **taptap:** add transcription plugin optimization handoff ([6dd824e](https://github.com/kaying-ai/KayingCode/commit/6dd824e98d38c8edc90f561997c5dbff59c74f53))

* **taptap:** enforce source-first transcription workflow ([57bfaf1](https://github.com/kaying-ai/KayingCode/commit/57bfaf120b6fe10162b9d4b6c3144435b4efcbb1))
  * add the source-first iron rule: screenshots identify differences,
  * add read-only subagent policy and contract for parallel audits
  * add source audit checklists: control flow, custom shaders, materials,
  * require SOURCE_NOTES, visual_fixes evidence and deterministic compare
  * add Turbo Tails anti-patterns and policy regression tests

* **taptap:** record P0/P1 commit in handoff status ([2074f9d](https://github.com/kaying-ai/KayingCode/commit/2074f9d6fdc2158592884766f407ef9c695260a8))

* **taptap:** record phase 2 commit in handoff status ([07e5d38](https://github.com/kaying-ai/KayingCode/commit/07e5d3860c88e663bf069f9cdeb522b529b2b0e6))

* **taptap:** record phase 3 commit in handoff status ([bcc956d](https://github.com/kaying-ai/KayingCode/commit/bcc956d59aea9579bac4cb8e4e3bd90933e54aa0))

* **taptap:** record replay commits in handoff status ([84f52b1](https://github.com/kaying-ai/KayingCode/commit/84f52b13329d7f9cc122b15ed4b89ed97f541279))

## [0.1.4](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.3...kaying-code-v0.1.4) (2026-11-11)

### Features

* **mobile:** add Russian UI locale ([637a3c2](https://github.com/kaying-ai/KayingCode/commit/637a3c20a84045e9bb26c5d9bc2ca0cb47c587d0))


### Bug Fixes

* restore project picker and embedded browser panels ([ef93fcc](https://github.com/kaying-ai/KayingCode/commit/ef93fcc06fd8aec49ba546f2fb3e58505d42e4df))
  * resolve selected project cwd through Host prepareSession and keep
  * retain plugin uiContributions in PluginMetadata so TapTap
  * consume the injected node_repl browser broker env and send
  * allow the TapTap preview partition in BrowserViewLoadUrl owner


### Documentation

* **mobile:** add Russian RuStore screenshots ([9c77d51](https://github.com/kaying-ai/KayingCode/commit/9c77d51b273fedb52af0c7623d00cf15fa73c43b))

* **review:** add review environment runbook ([84ccc19](https://github.com/kaying-ai/KayingCode/commit/84ccc192c779aa246a2a8a5919ab418c0f691468))
  * add step-by-step Ubuntu host deployment and link issuance runbook
  * document fixed Xvfb + VNC + xclip flow for headless hosts
  * link the runbook from deployment index and review docs

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
