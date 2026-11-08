# kaying-game-playtest · 小咖游戏试玩助理

默认启用的 KayingCode 内置插件。按[产品策划](https://chatgpt.com/share/6ad9b614-4904-83ed-bfb4-692b803fd51b)
落地首版“真实操作 → 视觉复核 → 证据记录 → 体验报告”。使用现有聊天任务，不新增专属原生面板。

在聊天中请求“试玩这个 APK，重点检查新手引导并生成报告”，或使用插件的 `playtest` 命令。
运行时复用内置插件宿主的 Node 环境（含 Electron/SEA）；Android 需要 PATH 中可用的 adb 和已授权的
模拟器/设备。`android_emulator(inspect|start)` 优先复用连接设备；需要启动时使用已有 AVD，
缺省优先 `emulator -avd <AVD> -gpu host -no-snapshot-load -no-snapshot-save`。
不清 userdata、不加载/保存快照；启动后检查 bootCompleted 和实际 GLES，SwiftShader 回退会告警。
已有运行中的模拟器不会自动重启。安装 APK 会替换设备上同包名应用；使用专用测试设备。
不会自动安装 SDK、清除数据或卸载。
H5 需要启用现有 Browser Use 插件。scrcpy、FFmpeg/ffprobe 为可选媒体依赖，缺失时明确输出限制。

已实现：本地 APK 校验、指定设备安装启动、点击/滑动/长按/返回、截图返回模型、预算、
会话保存/暂停/恢复、事件/操作记录、Web 证据接入、无音频 Android 录制、视频切片、
离线 HTML/Markdown/JSON 十二章报告、证据约束评分与本地报告比较。
默认生成面向读者的《新游戏试玩报告》，介绍设计风格、核心玩法、亮点、成长线索和适合人群，
配合精选截图/短片说明；设备、计时与验收记录放在附录。运行诊断使用 diagnostic。
支持诊断/评价两种报告、明确验收目标、事件事实草稿、自动基础信息和证据索引、
评分与目标进度分离、增量评价修订、关联历史来源、设备/观察计时和缺项检查。
操作可选棋盘区域稳定帧检查与缩略预览（原图坐标映射保留），录制默认60秒/15fps，
自然封装后 finalize；不把帧稳定或输入命令成功当作通关。

下载链接由现有浏览器/文件能力取得本地 APK 后导入。本地项目由其构建命令生成产物后使用；
不猜测项目构建步骤。暂不包含多点触控/帧级动作控制、音频评价、自动集锦拼接、性能测量、
远程设备池、竞品数据库、Issue 自动提交或专属三栏工作台。视觉理解与报告评价使用当前
聊天 Agent；运行时不另起模型或冒充自动理解游戏。

产物：`<workspacePath>/playtest-results/session-<uuid>/`，包括 session.json（唯一事实）、
manifest.json、events.jsonl、actions.jsonl、metrics.json、screenshots/、recordings/、
highlights/、logs/、report.html、report.md、report.json。整个目录可复制离线浏览。
JSONL/指标/报告在 stop/report 时由 session 重建。日志限目标游戏当前 PID；进程退出时
标记采集缺失，分享前仍需检查脱敏。

会话身份使用 `workspaceIdentity?.trim() || workspacePath`。Android 设备独占检查限同一工作区；
不要从其他工作区/应用同时控制同一设备。进程内串行、同工作区写锁、动作先记 pending，
不保证任意系统崩溃下的设备输入恰好执行一次；未知输入永不自动重放。
工作区留下崩溃锁时，核对 `.writer-lock` 中 PID 已退出后移除锁再恢复。

验证：从本目录执行 `pnpm run test`（Node test runner）。协议及假设备端到端测试不代表
已经达到策划中的真实游戏兼容率、10–20 分钟自主试玩或候选片段质量指标。
完整规则、事件顺序和验收见 [docs/spec/playtest.md](docs/spec/playtest.md)，工具见 [docs/CONTRACT.md](docs/CONTRACT.md)。
