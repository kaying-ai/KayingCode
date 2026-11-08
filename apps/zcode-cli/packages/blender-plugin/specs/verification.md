# Blender 接入验收（2026-10-21）

## 已执行

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
