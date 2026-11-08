# TapTap 发布回执

`TapTapPreviewPublicationV1` 由插件发布工具单点写入，UI 通过文件服务读取，不存储第二份业务状态。

可选 `previewMode` 只接受 `standalone` 与 `transcription-compare`。前者允许独立游戏预览自动打开，后者用于转写，禁止自动创建独立预览，但不影响比较面板读取 URL/revision 并刷新 target。字段由插件根据项目元数据推导，不由 Agent 或当前 UI 焦点决定。字段缺省时兼容已有独立预览行为，未知值必须解析失败。

sessionId、workspaceKey、operationId、revision 和 URL 校验保持原契约；预览模式不改变 owner/lease、Desktop continuous 或手机 replayable 的消息语义。不支持 embedded browser 的壳层仍不创建 guest。

验收：两种模式可严格解析；旧回执可读；未知模式拒绝；转写回执可被比较面板照常消费。
