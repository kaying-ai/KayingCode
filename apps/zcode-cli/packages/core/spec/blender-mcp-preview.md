# Blender MCP 预览的模型图片预算

Agent runtime 按会话插件目录解析 `blender@kayingcode-plugins-official` 的 `plugin:blender:blender`。对该工具的 `look` 图片复用既有图片处理端口与工具产物存储。200 KiB 以下保持原图，以上保存完整图片并给模型内联有界缩略图。缩略图、原图位置和工具结果走现有会话投影。保留原始尺寸、比例和 MIME 记录。图片压缩不可用时沿用原图产物提示。

Blender 持有场景与原始渲染。原图只写会话已有产物目录，图片处理只影响展示和模型输入，无新的存储或状态。Desktop continuous 与手机 replayable 沿用同一工具结果。图片处理规则只作用于该插件的 `look`，不影响授权、MCP Apps 和其他 MCP 的预算。

同一 Blender 注册路由下，按固定工具返回约定将 `get_addon_status` 的连接错误及 `execute_blender_code` 的执行错误标为 MCP 错误。只处理这些工具的首段文本与已知前缀，成功脚本的打印内容仍按原结果处理。

验收覆盖内联小图、大小超限时保留原图及内联缩略图、无压缩端口时的原有退化，以及第三方同名工具维持原有行为。错误回归区分脚本拒绝、脚本执行异常和成功脚本打印的错误字样。
