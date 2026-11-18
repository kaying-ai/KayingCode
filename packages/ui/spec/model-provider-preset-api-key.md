# 模型设置：Z.ai / BigModel 预设 API Key 供应商

## 产品规则

- `KayingCode.localrun` 无账号系统，模型设置「智谱」分组只保留两个内置入口：
  - `zai-standard-api`，展示名 **Z.ai**
  - `bigmodel-standard-api`，展示名 **BigModel**
- 两个入口都是按量 API Key Provider，不依赖 OAuth、账号会话、Coding Plan / Start Plan 权益。
- 入口始终存在；未配置 Key 时展示「未就绪」和可编辑的 API Key 输入，不展示「请先完成 OAuth 登录」。
- Key 保存后 Provider 变为「就绪」，其模型进入模型选择器；「测试模型」使用正式 Registry 执行链发起 1-token 探测。

## 状态所有者

- Provider / Model 定义与可执行资格唯一由 Provider Registry 持有：
  - 内置 `providerRules` 来自 `config/provider/kayingcode-builtin.json`。
  - 用户只写入稀疏 Personal Overlay（`access.type/apiKey`），不复制 `api`、`builtinModelIds` 或 `group`。
- Settings View 通过既有 `IProviderSettingsService` 投影；UI 不另存 Provider 配置、不自行判断 Key 是否有效。
- 连接测试只经 `providerSettingsService.testModelConnectivity` → Protocol → Agent Runtime，UI 不构造请求。

## 内置配置契约

两个 `providerRules` 必须满足：

| providerId              | providerName | group             | access                                      | api                                                               |
| ----------------------- | ------------ | ----------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `zai-standard-api`      | Z.ai         | `zai-family`      | `api-key`，无 Key，仅 `apiKeyManagementUrl` | `openai-chat-completions`，`https://api.z.ai/api/paas/v4`         |
| `bigmodel-standard-api` | BigModel     | `bigmodel-family` | `api-key`，无 Key，仅 `apiKeyManagementUrl` | `openai-chat-completions`，`https://open.bigmodel.cn/api/paas/v4` |

- Provider 规则自包含 `access` / `api` / `builtinModelIds`，不声明 `templateId`，避免「添加供应商」目录再创建一份同名 Provider。
- `builtinModelIds` 至少包含 `GLM-5.3`、`GLM-5.3-Flash`；模型推荐配置由既有 `modelRules` / `modelApiRules` 解析。
- 不在 Personal Overlay 中写入 `group: standard-personal`，避免内置入口同时出现在自定义供应商分组。

## 交互与事件顺序

1. 设置页加载 Settings View，按 `PRESET_PROVIDER_SPECS` 的 Provider ID 找到内置 Provider。
2. 用户输入 Key 并失焦/回车，`resolvePendingProviderDraftSave` 只生成 `personalConfig.access` 差量。
3. `savePersonalProviderOverlay` 刷新 Registry；Settings View revision 前进，Provider 状态变为就绪。
4. 用户点击「测试模型」，Service 等待该 Provider 操作队列，确认 Provider / Model 可执行后调用 Runtime。
5. 外部导航到旧 `account:zai-*` / `account:bigmodel-*` 时，仅映射到对应预设节点，不恢复账号 Provider。

## 失败语义

- 内置配置缺失：Provider 保持未就绪并展示配置问题，不伪造默认 Key，不回退 OAuth 文案。
- Key 保存失败：保留用户已输入草稿并展示现有保存失败反馈，不静默写入其他 Provider。
- 连通性测试失败：按现有错误链路展示 Provider/Model 不可用或上游错误信息，UI 不拦截真实请求。
- 旧 Personal Config 中的 `account:` Provider 不被删除或改写；它们不参与预设入口。

## 验收场景

1. 全新数据目录打开模型设置，智谱分组下出现 Z.ai / BigModel；点击后显示 API Key 输入和两个 GLM 模型，不出现 OAuth 文案。
2. 输入任意测试 Key 并失焦，Personal Config 只新增 `access.apiKey`，Provider 变为可执行。
3. 测试模型时请求使用对应 baseUrl、`GLM-5.3` 模型 ID 和 1-token 预算；成功与失败反馈沿用现有 UI。
4. 旧 `account:zai-start-plan` 导航目标落到 Z.ai 预设入口，不创建账号 Provider。
5. 内置 Provider 不出现在「自定义供应商」分组，删除/重命名等自定义操作不可用。
