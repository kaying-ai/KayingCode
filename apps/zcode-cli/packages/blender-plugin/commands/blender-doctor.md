---
description: 检查 Blender 环境、连接和 add-on 协议，并根据证据给出建议
---

调用独立 MCP `blender_doctor` 的 `blender_doctor` 工具。该工具无需 Blender MCP 主服务可用。

按阻塞项、未验证项、已通过项整理结果，引用检查证据，给出最短修复步骤。区分已确认的连接/配置错误和未验证的原因，不因端口未监听就断言 Blender 未安装。诊断期间不安装软件、不修改用户配置、不清缓存、不执行 Blender Python。

工具不可用时，通过 shell 运行：

```sh
node "${KAYINGCODE_PLUGIN_ROOT}/scripts/doctor.mjs"
```

若用户继续要求修复，依照 Blender skill 执行对应步骤，再次运行 doctor 验证；不要运行上游 setup 或修改其他 MCP 客户端配置。
