# 内置插件上游检查（2026-10-23）

## 结果与范围

以 config/official-plugins.json 中当前 16 个发行项为范围，检查 README、清单、许可与来源锁；对明确的运行时上游读取官方仓库默认分支或 npm latest，并审查本地适配和技能边界。没有将“使用开源依赖”视为“整个插件开源”，没有调整游戏专区的开源 banner 分类。

| 内置插件                                                                                         | 来源检查与本轮处理                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| blender                                                                                          | ahujasid/mcp-for-blender：锁定的 2.2.2 / 5a3618fccb2d982d0dd61e7a1879912c3100073b 与公开 HEAD 相同，保留原样快照；31 个文件 SHA-256、add-on protocol 14 校验通过。                                                                                                                                                                                                  |
| computer-use                                                                                     | 仓库从 kaying-studio 迁移到 kaying-ai，更新 README、第三方声明、锁文件 repository 和后续同步脚本。公开 HEAD 133941c8834bb76dd3f0d1cf4fc5021a9230186f 的 package 版本为 0.2.3；现有锁为 0.2.4 / 984ad2f406e8f83abaf7d91599c4d7cd325f362b。GitHub 比较返回 404，Git 对象获取也返回 not our ref；无法证明其祖先关系，不覆盖现有 vendor 或原生制品，不改写版本/commit。 |
| kaying-for-taptap                                                                                | @taptap/maker 从 0.0.36 更新到官方 npm latest 0.0.38；@taptap/instant-games-open-mcp 1.24.14 已是 latest。保留 npm integrity，更新补丁后的 distSha512。插件 package/manifest/MCP 报告版本统一为 0.1.1。原有清单 0.1.0 与 MCP 常量 1.7.2 不一致，已有集成测试先复现失败，统一版本后通过。                                                                            |
| plugin-creator、skill-creator、kayingcode-guide                                                  | README 记录为 ZCode MIT 内容的本地移植，未记录原始导入 commit。已检查 zai-org/zcode-plugins 的公开 HEAD daf8fdee47e651250cd584b5de39db9697240114、目录树和对应 plugins 路径历史，未发现这三个来源目录；不能声明其与公开 HEAD 同步，保留本地适配。                                                                                                                   |
| documents、pdf、presentations、spreadsheets                                                      | README 明确为基于 Python 库的原创实现；并非 ZCode 专有插件源码的副本，本轮不覆盖这些技能或浮动升级其环境依赖。                                                                                                                                                                                                                                                      |
| android-emulator、ios-simulator、browser-use、image-search、kaying-game-playtest、node-repl-host | 当前目录没有可同步的第三方源码快照锁；保留仓库现有实现。Openverse API、系统 SDK 和内部服务依赖不作为插件整体上游升级。                                                                                                                                                                                                                                              |

## Maker 代码和技能适配

0.0.38 更换了 Git 网络调用入口并新增云端工作区修复。维护脚本按本次固定 bundle 的函数及语句定位，任何关键锚点缺失即报错；保留上游网络重试和云端修复流程，只替换可能引入远端文件的同步/合并路径。

本地工作区继续是文件事实来源：常规历史分叉与云端修复后的合并均使用 ours 策略；成功回执读取最终 HEAD。只有明确的 non-fast-forward/fetch first 才进行历史对齐；鉴权、网络、云端阻塞等错误保持各自的原有处理路径。

检查了 npm 包中六项技能。game-publisher 适配 cloud_workspace_blocked / cloudRepair 的诊断与恢复指引；gameplay-engineer 增加 .project/settings.json 健康检查与 @runtime 保留规则。未整包导入要求全局升级或另起控制台/预览的指引，也未把 Lua UI 编辑器的完整工作流当作 KayingCode 已集成能力。现有 7 个技能入口及 UI 详情计数保持一致。

同步规则与所有者见 [TapTap 维护规范](kaying-for-taptap/spec/upstream-maintenance.md) 与 [Computer Use 维护规范](computer-use/specs/upstream-maintenance.md)。改动模块为 plugins 和生成的 agent-contracts，SOURCE_PACKAGES.md 由 source:map 更新；没有新增业务状态所有者或改变跨模块依赖方向。

## 验证

- TapTap：插件完整测试（包含新增实际分发代码的本地 Git 分叉/云端修复回归、错误分类和技能规则），33/33 通过。
- TapTap：build、verify:assets、test:artifact 均通过（darwin-arm64）；临时复制完整插件后启动 MCP，发现六个现有工具，并调用只读 doctor、命令发现与转写 doctor。
- Blender：verify 通过，单测 10/10，上游 Python MCP 对模拟 add-on 的回归 1/1。没有操作用户 Blender 场景。
- Computer Use：server 单测 3 项通过、2 项 Windows 测试按平台跳过；verify-package 通过。vendor 与 native 未修改，因此没有重跑原生编译或真实桌面操作。
- 根 typecheck 通过；根 lint 为 0 errors / 129 条已有 warnings。
- source:check、architecture:check --changed、改动文件格式检查与 git diff --check 通过；架构 violations 0 / baseline 0 / new 0。
- 未向实际 TapTap 项目发布、推送或修改用户游戏；Git 回归只连接临时本地 bare 仓库。

## 可复核的上游来源

- [Blender 已核对的 HEAD](https://github.com/ahujasid/mcp-for-blender/commit/5a3618fccb2d982d0dd61e7a1879912c3100073b)
- [Computer Use 已核对的公开 HEAD](https://github.com/kaying-ai/kaying-computer-use/commit/133941c8834bb76dd3f0d1cf4fc5021a9230186f) 及其 [package.json](https://github.com/kaying-ai/kaying-computer-use/blob/133941c8834bb76dd3f0d1cf4fc5021a9230186f/package.json)
- [Maker 0.0.38 官方 npm 元数据](https://registry.npmjs.org/@taptap/maker/0.0.38)，包 SHA-512 以锁文件记录为准；镜像下载内容已与官方 integrity 对照。
- [TapTap MCP 官方 npm 元数据](https://registry.npmjs.org/@taptap/instant-games-open-mcp/1.24.14)
- [ZCode 插件仓库本轮核对的 HEAD](https://github.com/zai-org/zcode-plugins/tree/daf8fdee47e651250cd584b5de39db9697240114)

本次改动（含新增文件及生成目录）：+373 / -100，净增 273 行。
