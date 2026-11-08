# 内置插件技能详情验收

## 实现范围

以 config/official-plugins.json 的 listing.skillDetails 为展示信息唯一来源；真实技能入口、顺序和数量继续由已有组件枚举负责。展示信息仅匹配已存在的技能，不能产生新技能。UI 无新增业务状态或异步事件；数据流与边界见 [行为规范](spec/plugin-skill-details.md)。

覆盖 14 个实际提供技能的内置插件、27 个主技能和 72 项内部能力说明。Blender 保留 1 个主技能并展开 10 项子技能；TapTap Maker 保留 7 个主技能。无 SKILL.md 的 MCP 插件不新增技能。

改动模块：shared（展示数据契约与校验）、agent-contracts（公开类型和生成目录）、agent-adapters（元数据读取）、ui（本地化详情展示），以及官方插件配置。未修改技能执行、工具权限、安装或启停路径。

## 验证结果

- workspace freshness：通过，gameplugin 基线 ahead 1、behind 0。
- source:plugins、source:map、source:check：通过。
- agent-contracts 构建、agent-adapters 类型检查、根 bun run typecheck：通过。
- 根 bun run lint：0 errors、129 条已有 warnings。
- 新增单元测试：6 项通过，覆盖严格协议解析、重复项拒绝、真实目录覆盖、本地化、旧数据和过期元数据回退。
- 详情页 E2E：15 个可见内置插件通过，技能和子技能数量与实际目录及元数据一致。
- Blender 浏览器矩阵：中英文、深浅主题、已安装与未安装详情、1053 × 793 与 390 × 844；无横向溢出，完整说明无截断，最后一项子技能可见，浏览器无页面异常。旧 listing 缺少新增字段时保持原列表。
- E2E 首次运行因 fixture 缺少 StoreProvider 失败；补齐真实 Provider 后重新运行通过。
- architecture:check --changed：0 violations，baseline 0，新增 0；未改变状态所有者或依赖方向。
- 改动文件格式检查及 git diff --check：通过。

验证仅覆盖技能详情数据与界面，未执行 Blender 或其他插件的实际工具操作。

## 视觉记录

参考：用户提供的 TapTap Maker 与 Blender 详情截图。

- 桌面深色：/Users/feng/.codex/visualizations/2026/10/23/01a166ef-a590-7043-9e06-068de67b9047/plugin-skill-details/blender-dark.png
- 手机浅色：/Users/feng/.codex/visualizations/2026/10/23/01a166ef-a590-7043-9e06-068de67b9047/plugin-skill-details/blender-mobile-light.png
- 本地预览：http://127.0.0.1:5188/?plugin=blender

浏览器截图已人工复核：主技能名与真实入口同时显示，子技能按标题和完整说明展开，桌面与手机布局均可阅读。

本次改动行数（含新增文件和自动生成目录）：+3008 / -27，净增 2981 行。
