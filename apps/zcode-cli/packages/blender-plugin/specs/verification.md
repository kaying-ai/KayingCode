# Blender 接入验收

## 2026-11-20 · Windows 快照校验与输入防护

- 环境：Windows x64 10.0.26300，Node 25.9.0（仓库 `mise.toml` 固定 24.14.0，CI 以工作流配置为准），插件 0.2.0 / 上游 2.3.0（`b6a2ce30c14636a562b5549684d9db6fc01f29ab`）/ protocol 16。
- 从旧分支切入后，14 个内容未变的 vendor 文件仍保留 CRLF，`verify` 报 hash 不一致。按 lock 的字节重写后通过，31 个文件与 lock 全部一致；该现象只影响旧检出的工作区，不影响新 clone 和 CI。
- `verify` 现在列出不一致路径，并区分仅 CRLF 的检出漂移、缺失、额外和真实改动；CRLF 情形提示删除对应文件后重新 checkout，不修改 lock。新增 CRLF 漂移、缺失和等量“一缺一多”三个回归。
- `asset-check.py` 在读取场景前校验 `requirements`、`target`、`unit_scale` 和 `tolerance`；非法输入返回带字段名的 `ValueError`。真实 Blender e2e 增加维度长度、负面数预算和未知字段三类拒绝用例；本机另以最小假 `bpy` 模块执行 12 个非法输入分支，均返回预期错误（临时校验，未纳入 CI）。
- 删除重复且过期的 `docs/features/blender-plugin-optimization-assessment.md`，状态与方案以插件 [评估](blender-plugin-optimization-assessment.md) 和本记录为准。
- `pnpm --filter @kayingcode/blender-plugin run verify` 通过；`test` 14 项通过；`blenderMcpPreview.test.ts` 4 项通过（新增无 artifactStore 时保留内联缩略图的回退）。
- `pnpm run typecheck`、`pnpm run source:check`、`pnpm run architecture:check --changed` 通过；`pnpm run lint` 0 错误、133 条存量警告。`node scripts/licenses.mjs check` 因第三方声明在 macOS 生成、当前 Windows 主机平台不匹配而拒绝执行，未在本机重新生成声明。
- 本轮未执行真实 Blender GUI、真实上游 MCP、Desktop 安装包、Windows/Linux 实机与手机接续；这些仍以既有记录为基线，不据此宣称跨端验收完成。

## 参考图建模默认连续执行

- 隔离 KayingCode 运行时加载了已播种的新版命令、Skill、参考图指南及 doctor。命令展开保留 Skill 要求和带空格的路径，并要求同一轮继续细化和交付。指南明确本地路线、自行修正及用户要求分阶段时的例外。
- 插件单测 13 项通过。上游快照、MCP 集成和真实 Blender GUI 测试通过，后者执行草模预览、局部细化、动画核验和导出。类型检查通过，Lint 为 0 错误、133 条警告，架构检查无违规。
- 命令加载与 Blender 工具执行分别验证。真实模型在生成器关闭时是否完成本地路线、全程有无多余询问，仍需通过参考图会话复测。

## 2026-11-18 · 参考图建模入口

- 隔离 KayingCode 配置中的官方插件可发现 `/blender-from-reference` 和 `/blender-doctor`。展开新命令保留用户参数和带空格的参考图路径，并要求调用 `blender` Skill。验证了已播种的参考图指南可读取。
- 真实 Blender GUI 测试验证草模预览、工作副本、后续局部修改、动画和导出。要求校验活动相机时，漏设判为 `needs-fix`，设置后通过，独立 Blender 进程复读 `.blend` 时保留交付机位。
- 插件单测 12 项、上游快照校验和 MCP 集成测试均通过。剪影对照的视觉判断以及 Agent 按草模反馈续做，仍需真实参考图会话验收。

## 2026-11-18 · 参考图角色流程修订

- 基于实测将配对与能力、参考图输入、实际建模路线、产物与视觉验收及耗时检查纳入 `/blender-doctor`。已知的连接与脚本失败在 Agent 侧标为工具失败。
- `test:upstream` 通过。模拟 Blender 在已配对连接断开后切换到旧协议，插件拦截写入，同时还能读取 add-on 版本。`test:blender` 通过，隔离 Blender 5.2.1 GUI 的匹配版安装、预览、局部修改和导出仍可用。插件单测 12 项、快照校验均通过。
- Agent runtime 回归覆盖官方 Blender `look` 超限时模型收到缩略图、完整字节进入会话产物、无图片处理端口时回退，以及同名第三方工具保持原有行为。也覆盖连接错误、脚本拒绝与成功打印错误字样的区分。验证基于现有图片端口和本地夹具。
- 指定角色的生成路线选择、首次视觉对照和终稿相似度留给真实 `dev:desktop` 复测。报告按实际配对、已配置生成服务及用户授权区分可达到的交付范围。

## 2026-11-18 · 插件 0.2.0

- 环境为 macOS arm64、Node 24.14.0、pnpm 10.31.0、Blender 5.2.1 LTS。上游 2.3.0（`b6a2ce30c14636a562b5549684d9db6fc01f29ab`），协议 16。
- `verify` 通过。单独使用 `core.autocrlf=true` 重检出候选，31 个 vendor 文件逐一与固定 Git blob 比对，字节及锁校验均通过。已接入 Windows Source checks，本地运行覆盖 macOS 上的换行转换模拟。
- `test` 12 项通过，包含确切安装路径、磁盘和运行版本证据、损坏快照不提供安装路径、七篇指南存在、真实同步 CLI 成功与失败回退。`test:upstream` 通过，真实 2.3.0 MCP 连模拟 add-on，核对协议、场景读取和继承环境尝试开启时的服务端遥测关闭状态。
- `test:blender` 通过。真实 GUI 用隔离配置从含空格的 staged 路径安装并启动随包 add-on，验证其默认 loopback。模拟 uv 与 Python 缺失时 staged doctor 仍可用。先输出开门动画资产的草模图和工作副本，再加宽门体并重建 MCP 连接，验证尺度、枢轴、材质、Action、关键姿势和无关对象。独立 Blender 复读 `.blend`，通过仅导出目标门体的 GLB 导入核对内容与动画，并检查导出后选择与活动对象已恢复。
- 使用隔离用户配置和本地确定性模型夹具跑真实 KayingCode CLI/Agent。插件清单校验通过，成功加载已播种的 `blender` Skill 并经 Read 取得原样 `rigging.md`，连接诊断获得 `blender_doctor` 返回的安装证据。真实 Blender 回归和真实 Agent 入口检查分别执行，覆盖范围见各自用例。
- `source:check`、`architecture:check --changed`、类型检查、格式检查通过。架构基线 0、新增 0。Lint 为 0 错误、133 条现有警告。第三方声明重新生成，基础许可检查通过，严格检查仍有 19 项仓库级材料待补齐。
- 待验收项包括已更新的正式 Desktop 安装包、Windows/Linux Blender 实机、手机接续、使用真实模型的完整会话与优化前后耗时对照。当前 GUI 回归重建的是 MCP 连接，真实模型在写入结果不确定时恢复的表现需由完整会话验证。

## 2026-10-21 · 初次接入

- 环境：macOS arm64、Node 24.14.0、Bun 1.3.14、Blender 5.2.1 LTS。
- 上游：mcp-for-blender 2.2.2，commit `5a3618fccb2d982d0dd61e7a1879912c3100073b`，add-on protocol 14。`verify` 通过，vendor 字节与上游快照一致。
- `bun run --cwd apps/zcode-cli/packages/blender-plugin test`：10 项通过。覆盖 doctor MCP 在 uv/Python 缺失时仍可调用、错误参数、端口校验、分片 UTF-8、协议偏差、错误服务、忙碌超时、缓存隔离、损坏快照和上游更新失败时保留原快照。
- `bun run --cwd apps/zcode-cli/packages/blender-plugin test:upstream`：1 项通过。真实上游 Python MCP 连接模拟 add-on，完成初始化、工具发现、状态读取与场景读取。此前 get_addon_status 因缺少私有 config.py 失败；采用独立禁用遥测配置后同一回归通过。
- `bun run --cwd apps/zcode-cli/packages/blender-plugin test:blender`：1 项通过。真实 Blender GUI 使用临时配置、随机端口和独立 factory-startup 进程，完成 doctor → 状态/场景读取 → 创建球体 → 双视角实际图像 → 保存 .blend → GLB 导出，并验证文件内容。测试退出后清理测试进程；没有安装或替换用户现有 add-on。
- `node --test scripts/official-plugin-catalog.test.mjs`：9 项通过。
- 使用仓库现有 CLI 的 `plugins validate`：插件清单有效。全局 kayingcode 不在 PATH，通过校验脚本的 `--cli` 指向仓库现有 dist/kayingcode.cjs 完成验证。
- `bun run typecheck` 通过；`bun run lint` 退出 0，129 条现有警告、0 错误。
- `source:check`、`architecture:check --changed`、改动文件格式及 `git diff --check` 通过。架构基线 0、新增违规 0。
- 第三方通知已重新生成；`readVerifiedNotices()` 的输入/hash 新鲜度验证通过。这不代表全仓严格发行许可门禁通过。

## 边界与后续平台验收

场景由 Blender add-on 唯一持有，上游 MCP 管理进程内 socket 锁；Agent 按 skill 顺序完成每一步，不新增 Host/Renderer 队列。doctor 每次读取事实，写入结果不确定时不自动重放。改动位于 plugins 模块、官方插件配置及生成的 agent-contracts，附带目录计数测试和第三方来源记录；业务状态所有者未迁移。

Windows/Linux 的路径分支没有在真实设备运行；Desktop 插件列表、手机远控与实际安装包没有进行 GUI 验收。MCP Apps 仍按宿主能力协商，真实测试验证的是工具返回的图像，没有宣称内联 viewport 已在 KayingCode UI 验证。

后续实机排查修复了 Dev 入口未定位到仓库源码根的问题：编译后的 CLI 和 staged bundle 均从仓库外 cwd、隔离存储成功播种全部 15 项。使用正常 CLI 查询入口更新当前插件目录后，确认 Blender 条目存在、默认关闭、声明 blender 与 blender_doctor 两个 MCP。路径与既有 seed 测试共 7 项通过；类型检查通过、Lint 无错误（129 条现有警告）。此检查确认运行时目录，未宣称已操作当前桌面 UI 刷新或启用开关。

## 分阶段创作与重试反馈验收

- 工作流规范先于实现更新，见 `creation-progress.md`；skill 使用既有会话 Todo，要求草模预览/工作副本先行、局部细化收敛、动画关键帧核验、阶段反馈及简短交付。已通过正常 CLI 播种入口同步当前插件缓存，并比对 skill 内容一致。
- UI 使用既有 `snapshot.control.apiRetry` 读取模型重试事实，第一轮恢复可见；绝对 `nextRetryAt` 派生倒计时，到点只表示正在重试，不代表连接成功。不修改运行时重试策略、协议、队列或工具重放逻辑。
- `node packages/ui/test/modelRetryProgress.e2e.mjs` 通过：生产组件、真实浏览器，覆盖首轮退避、秒数递减、重新挂载后剩余时间、过期快照、重试次数、成功清理及结束消失；375px/1200px 和中英文。截图检查无水平溢出。该测试不覆盖真实手机到 Host 的断线重放链路。
- 真实 Blender GUI 测试已扩展为草模图 → 有效工作副本 → 保留对象并局部修改材质/比例 → 实际动画关键帧及拼图 → 保存/GLB 导出，独立进程运行通过。没有编辑用户熊猫场景。
- 插件 10 项测试通过；全仓 typecheck 通过，Lint 0 错误、129 条现有警告，source:check 和 architecture:check --changed 通过（基线 0、新增违规 0）。
- 尚未重跑真实模型驱动的熊猫创作，因此不宣称模型一定遵循 skill，也不宣称耗时已下降。当前 Dev UI 可随源码热更新；已加载旧 skill 的会话建议新建会话或重新加载插件后再验收。保留用户正在运行的任务，不自动重启应用。
- 本轮 UI 进度改动含规范与浏览器验收共新增 220 行、删除 58 行，净增 162 行；模块为 ui 与 plugins，既有状态所有者及跨端事件顺序保持不变。
