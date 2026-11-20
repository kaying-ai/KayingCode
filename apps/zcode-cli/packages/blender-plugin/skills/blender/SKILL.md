---
name: blender
description: Create, edit, inspect, render and export Blender scenes through the builtin Blender MCP. Use for Blender modeling, materials, lighting, animation and scene workflows, or diagnosing a Blender connection. Start with the independent blender_doctor tool when setting up or troubleshooting.
---

# Blender 工作流

## 1. 连接与能力

本次任务第一次写入前，以及出现连接错误或重连时，调用独立 MCP `blender_doctor`。只有 `ready=true` 且实际运行协议等于随包协议才进入写入。`ready=false` 时只读排查，给出证据和一个具体的恢复步骤。发现 `get_addon_status` 的实际版本与 doctor 矛盾时，重新诊断监听实例。

- uv 缺失：使用官方 uv，或配置 `KAYINGCODE_BLENDER_UV` 绝对路径。GUI 的 PATH 可能与终端不同。
- Python 环境未准备：启用/重新启用插件，启动器按随包 uv.lock 准备独立环境；首次可能需要下载，检查网络、代理、证书、缓存写权限。
- add-on 缺失或协议不同：本机优先运行 `/blender-install`，先看 dry-run 计划，用户确认后再写入。安装器不可用（Blender 运行中、远端主机、版本未初始化）时，使用 doctor 的 `installation.addonPath` 和 `addonsDir`，在实际运行 Blender 的设备上通过 Install from Disk 安装随包副本，或在目标主机运行同一安装入口。诊断显示磁盘副本与运行实例不符时，先核对 Blender 实例，重启并复查握手。
- add-on 默认 `auto_start_server=True`；安装并启用后打开或重启 Blender 即会自动监听。只有用户曾停止服务、端口冲突或旧场景保存了关闭状态时，才需要在 3D 视图按 N 打开 MCP for Blender 并重新连接。
- doctor 只诊断，不应把用户的诊断请求解释为安装或重写配置。安装只通过用户显式发起的 `/blender-install` 执行；安装帮助见插件 README。

doctor 就绪后调用上游 `get_addon_status` 获取当前版本、能力和可用集成；再调用 `get_scene_info` 读取场景。以本次工具发现的 schema 为准，不照搬旧版上游工具名。

远程 Agent 的工具运行在远端主机：依赖和 Blender/add-on 应部署在对应主机，或由受保护的隧道连接。手机使用桌面已有的 Host，不要为手机另起 Blender 服务。不要把未认证 add-on 端口暴露到公网。

用户反馈生成质量或速度时，按同插件的 `${KAYINGCODE_SKILL_DIR}/../../commands/blender-doctor.md` 收集证据并先给诊断。依据用户请求再进入局部修改。

### 参考图和指定角色

从 `/blender-from-reference` 进入或用户要求按图还原、重建指定形象时，先用 Read 读取 `${KAYINGCODE_SKILL_DIR}/references/from-reference.md`，执行其中的路线选择、剪影检查和相机交付规则。

1. 主参考优先用用户提供的图和项目已有资产。用户允许搜索时，短查询找到可信主参考即推进。只有缺少影响造型的视角时才补搜。连接检查和参考查找可并行。通过实际图片输入确认模型能做视觉核验。只有文本或路径时，先读取图片。无法核验时明确标为未验证。
2. 首次建模前把参考拆成 3–5 个识别特征，优先覆盖轮廓和比例、脸与发型、姿势、服装和主色。给用户一句路线和首个结果，随后开始。
3. 优先复用项目里适合的可编辑资产。需要从参考图建模时，依据 `get_addon_status` 确认生成服务已启用、支持图片且费用与传图已获授权，再用真实参考图的受支持路径或 URL 调用 `generate_3d`。沿用工具的 job handle，核验结果后再决定是否换路线。
4. 缺少已授权的图生 3D 服务时，使用项目现有资产和本地 `bpy` 建模。尽可能完成可逆、可验收的工作，在最终交付写清仍有差距的部分。仅在关键输入无法替代或用户必须解决连接、权限等阻塞时询问。
5. 自行渲染草模，按同向、同取景的参考核对并局部修正，记下 `通过`、`需修正` 或 `未验证`，然后在同一轮继续细化。用户明确要求分阶段验收时才等待其草模反馈。最终交付时提供实拍预览、参考图和文件，并报告视觉与结构检查结果。

### 按需读取上游指南

用 Read 从 `${KAYINGCODE_SKILL_DIR}/../../vendor/mcp-for-blender/src/blender_mcp/guides/` 读取当前工作最相关的一篇。实际插件根也可从 doctor 的 `installation.pluginRoot` 获取。把它作为一个绝对目录处理，路径可能包含空格。纯诊断只用 doctor，跨阶段遇到另一个主题时再读对应文件。文件不可用时继续用现有 Blender 工具，注明本轮缺少的指南。

| 当前任务                         | 指南              |
| -------------------------------- | ----------------- |
| 草模、构图、集合组织             | `scene.md`        |
| 材质、纹理、UV                   | `materials.md`    |
| 三角面数、网格清理、重拓扑、烘焙 | `retopology.md`   |
| 骨架、蒙皮、权重、变形           | `rigging.md`      |
| Action、关键帧、动作交付         | `animation.md`    |
| 玩家尺度、模块拼接、关卡草模     | `level-design.md` |
| 编写或核对 `bpy` 脚本            | `bpy.md`          |

## 2. 小步创作与调度

1. 从用户目标推导交付物（`.blend`、预览、GLB/FBX 等）、尺寸/坐标/单位、风格及输出位置。优先采用用户明确要求，再读工作区的约定和项目资产，沿用单位、命名和导出约定。只询问会阻塞交付的信息，其余作合理假设并说明。
2. 读取现有对象、集合、材质及相机，再决定复用或新增。保留无关场景资产，避免先清空场景。已有项目先保存到新的工作副本。
3. 多阶段任务先用 `TodoWrite` 建立 3–5 项清单，例如「连接及场景检查 → 草模与首张预览 → 材质与局部细化 → 动画与关键帧验证 → 保存交付」，按任务删减；最多一项 `in_progress`。这是会话已有进度来源，不另造队列或百分比。只有工具返回且验收通过才完成对应项。
4. 同一场景的修改按完成顺序串行执行；不要并行调用修改、渲染或导出。上游 socket 锁仅保证单进程内请求/响应匹配，不能代替跨客户端协作。多个客户端/窗口不要同时编辑同一个 Blender 实例。
5. **先渲染草模自检。** 第一段长脚本前简短说明工作路线。先搭轮廓和比例，保存工作副本并用 `look(shading="solid")` 核验。按实际可见问题局部修正、复看，再继续建模或动画。材质检查时按需切换 `material`，复用同一视角。每个脚本只处理一个阶段或局部。
6. **阶段通过后直接继续。** 用局部 `get_scene_info` 或脚本核对事实，按需要用一张低成本预览。长任务可以发一句进度并接着执行。后续细化只写相关对象或集合，复用已核验成果。`look` 已返回可见缩略图时直接使用，只有缺图或确需看原尺寸细节才读取产物。
7. 动画先实现完整的低成本动作，再用 `look(mode="frames")` 或当前 schema 的等价方式检查关键帧拼图和 Action/帧范围；静帧不能证明动画完成。最终高分辨率/高采样放在低成本预览验收之后。外部生成服务先检查能力、密钥和费用意图，按服务返回状态轮询，不重复付费提交。

### 继续细化时

用户说「不够精细」时，先读当前场景及至多一张当前预览，将差距落实为 2–3 个可观察目标，例如「眼睛和口鼻体积、手脚轮廓、服装层次」，说明默认顺序后开始。保留原场景、材质、动画和已保存成果；只调整未完成阶段，不从头重建。

针对本轮目标做局部实现、核验和纠偏，再继续用户要求的后续阶段。对无明确目标的缩放、换灯和重渲染及时收敛。仍有明显缺陷时在实际交付中说明，保留对应未验收项。通常沿用参考、项目风格与现有场景约定自行做可逆的造型决定。

## 3. 异常恢复

- 保存、渲染、修改、生成请求超时或断线：先通过 doctor 核对配对，重新读取活动 `.blend`、目标对象、该步骤的事实及已经落盘的结果。只续做确认尚未完成的步骤，执行结果未确认时暂停依赖它的写入。
- 缺少能力或协议不匹配：使用匹配的随包 add-on 或更新整套内置插件；不要动态拉取上游 HEAD 或向 Python 中临时塞依赖。
- 脚本报错先读取相关对象和 Blender 返回的错误，小范围修正；不能用长等待替代状态核验。
- 保存/导出采用工作区绝对路径。重试前检查目标是否已存在；保留用户文件和场景中的无关改动。
- 模型请求断线/退避等待与 Blender 执行是两类状态。以宿主实际重试状态为准，不把模型等待描述为「Blender 正在建模」，不承诺固定耗时或定时消息；skill 无法在模型完全没有输出时自行发送心跳。

## 4. 交付

先用 `get_scene_info` 读取目标事实。正式交付指定角色或游戏资产前，按实际项目约束用 Read 读取 `${KAYINGCODE_SKILL_DIR}/../../scripts/asset-check.py`，把其源码和一行 `inspect_asset(...)` 调用一起交给已有 `execute_blender_code`。脚本在 Blender 主机检查场景和纹理文件。按准确的对象名或集合名限定范围。格式示例：

```python
inspect_asset("DoorKit", kind="collection", requirements={
    "DoorLeaf": {"dimensions": [1.2, 0.08, 2.1], "origin": [0, 0, 0],
                 "materials": ["DoorPaint"], "action": "Door_Open", "frame_range": [1, 24]},
    "DoorCollision": {},
}, tolerance=0.001)
```

用项目实际给出的单位和要求替换示例值。可检查的约束包括 `max_triangles`、`unit_scale`（函数参数）和示例中的各项。只读输出区分 `pass`、`needs-fix`、`unverified`。工具权限限制时用已有场景查询并记录剩余未验证项。动画代表性姿势通过 `look(mode="frames", shading="solid")` 核对。按请求的对象或集合导出，必要的临时选择操作结束后恢复原选择与活动对象。复用可用的隔离 Blender 或引擎验证入口复读已保存的 `.blend` 和导出内容。远程文件给出实际所在主机和路径。

先确认并给出已保存 `.blend`、所需导出和最终预览，再简短列出实际验证与剩余限制，不在交付前生成长篇总结。没有真实 Blender 或渲染结果时明确说明尚未验证的部分；不要将未完成清单全部置为完成。
