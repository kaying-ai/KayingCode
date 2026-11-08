# KayingForBlender 内置插件

基于 [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender)，提供 Blender 创作流程、独立 doctor 和可追溯的上游更新。随应用内置，默认关闭；在插件市场「公开」中搜索 `KayingForBlender` 并启用，无需重复添加 MCP。内部插件 ID 保持 `blender@kayingcode-plugins-official`，改名不会重置启用状态。

## 首次使用

1. 安装 Blender（上游要求 3.0+）和 [官方 uv](https://docs.astral.sh/uv/getting-started/installation/)。
2. 启用 Blender 插件。启动器使用随包源码与 `uv.lock`，在用户缓存创建 Python 3.11 环境。首次可能需要网络下载 Python 和依赖；安装日志进入 stderr。插件目录可以只读。
3. 在 Blender 的 Preferences → Add-ons → Install from Disk 中选择此插件安装目录里的 `vendor/mcp-for-blender/addon.py`，启用 MCP for Blender。Blender 版本较新时安装入口可能在 Preferences 菜单中。
4. 重启 Blender。在 3D 视图按 N，打开 MCP for Blender 面板，确认服务已启动（默认 localhost:9876）。
5. 在聊天中运行 `/blender-doctor` 或说“诊断 Blender 环境”；通过后即可描述创作目标。

启用插件不会自动打开 Blender、安装 add-on、运行上游 setup 或改写其他 AI 客户端配置。doctor 只读检查，不会安装/下载。离线使用需先在同一主机准备好缓存环境。

## 调度与体验

内置 skill 复用会话阶段清单，按“检查 → 草模及首张预览 → 局部细化 → 动画验证 → 保存交付”推进。先给真实草模图和工作副本，再细化；每个阶段结束说明已完成项和下一步。模糊的精细化请求先收敛为 2–3 个具体目标，默认一轮实现、一轮纠偏后返回当前成果及限制，避免无目标地反复微调。细则与验收边界见 [创作进度规范](specs/creation-progress.md)。这是 Agent 工作流指导，不承诺模型每次都遵循或保证耗时。

复用上游 MCP 的工具、资源和客户端能力协商，不假设宿主一定支持上游的内联 viewport/素材选择界面；不支持时使用 `look` 图像及场景工具验证。宿主从第一次模型重试开始展示实际恢复状态，有退避时显示剩余秒数；该状态不代表 Blender 报错或进度。

Blender 保存场景事实，上游服务管理连接和 socket 锁。不同客户端不要同时修改同一实例；修改超时后先读取确认，不盲重试。流程规则见 [spec](specs/integration.md)。

## 配置与诊断

在执行 MCP 的主机环境中配置，修改后重新启用插件：

| 变量                            | 用途                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `KAYINGCODE_BLENDER_UV`         | uv 可执行文件绝对路径；未设置时检查 PATH 和标准用户安装位置  |
| `KAYINGCODE_BLENDER_CACHE`      | 可写缓存根目录；按上游 commit 隔离虚拟环境                   |
| `BLENDER_EXECUTABLE`            | doctor 检查 Blender 版本用的绝对路径（不自动启动 GUI）       |
| `BLENDER_HOST` / `BLENDER_PORT` | 与 Blender 面板一致；默认 localhost / 9876，非法端口直接报错 |

macOS/Linux 默认缓存位于 `${XDG_CACHE_HOME:-~/.cache}/kayingcode/blender/<commit>`；Windows 位于 `%LOCALAPPDATA%/KayingCode/Cache/blender/<commit>`。服务端 telemetry 固定关闭：本地 Python 入口提供禁用配置，补齐上游 Git 源码未包含私有 `config.py` 的发行缺口；不修改 vendor 或已安装的 Python 包。其他上游配置如 `BLENDER_MCP_SAFE_MODE` 原样继承。

独立 Node MCP `blender_doctor` 在主服务缺失 uv/Python 时仍然可调用。CLI：

```sh
node apps/zcode-cli/packages/blender-plugin/scripts/doctor.mjs
```

输出 `ready` 和各检查的 `status/evidence/suggestion`；未就绪退出 1。快照缺失/篡改、依赖未准备、协议不一致会阻塞就绪；未发现 Blender 文件仅表示安装位置未知，以实际握手为准。握手超时可能是 Blender 忙碌/弹窗阻塞。非本地主机时，应用检查标为未验证，网络与依赖属于执行主机/目标主机各自的范围。

## 跟随上游

上游文件保持原样，适配层在 `scripts/`、`skills/` 和 `commands/`；不运行时拉取 HEAD 或浮动 PyPI 版本。维护者先准备干净的本地 checkout，再从仓库根运行：

```sh
node apps/zcode-cli/packages/blender-plugin/scripts/sync-upstream.mjs --source /absolute/path/to/mcp-for-blender --ref <commit-or-tag> --plugin-version <new-version>
pnpm install --lockfile-only --ignore-scripts
pnpm --dir apps/zcode-cli/packages/blender-plugin run verify
pnpm --dir apps/zcode-cli/packages/blender-plugin run test
pnpm --dir apps/zcode-cli/packages/blender-plugin run test:upstream
pnpm run source:plugins
pnpm run source:map
pnpm run source:check
node scripts/licenses.mjs notices
```

脚本按 Git commit 导入白名单快照，校验 add-on 两份副本、协议及 lock 版本，更新文件 hash、插件版本和生成目录；不会覆盖本地适配层。审查上游差异与许可后提交。Python 锁文件变化会在新 commit 的隔离环境生效；用户手动在 Blender 内升级 add-on 时应重新诊断匹配性。发布前还需真实 Blender 的建模、预览、保存与导出验收。

可选真实 GUI 验收：`pnpm --dir apps/zcode-cli/packages/blender-plugin run test:blender`，必要时设置 `BLENDER_EXECUTABLE`。它启动独立 factory-startup 进程、临时用户目录和随机端口，不安装 add-on、不保存用户配置；退出后清理测试进程及临时文件。设置 `KAYINGCODE_BLENDER_E2E_OUTPUT` 可保留测试预览、`.blend` 与 `.glb`。

上游原始许可见 [vendor LICENSE](vendor/mcp-for-blender/LICENSE)；不随包分发 Blender。
