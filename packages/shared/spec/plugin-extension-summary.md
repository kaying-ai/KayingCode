# 插件扩展摘要（extensionSummary）协议

适配上游 ZCode 4.0.0 的插件扩展摘要能力（`docs/plugins/plugin-publishing.md` §4.2–§4.3）。
扩展摘要描述「带扩展的插件」要求的插件 API 版本范围与申请的权限档位，是**目录条目**的元数据，
不参与插件身份、安装来源与执行权限判定；CLI 只透传，不做兼容判断（由 App 判断）。

## 协议面（唯一所有者：`packages/shared/src/kayingcode-protocol/index.ts`）

| 位置                                                            | 定义                                                                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `kayingcodeRuntimeCapabilitiesSchema.pluginExtensionSummary`    | `z.boolean().optional()`：CLI 认识 `plugins/overview` 的 `includeExtensionSummary` 参数，并只在被要求时返回摘要。                              |
| `kayingcodePluginExtensionSummarySchema`                        | `{ engines: { zcode: string.min(1) }, grants: string[] }`，对象 **strict**。`grants` 是开放字符串数组：以后新增档位不能让旧 App 整页解析失败。 |
| `kayingcodePluginStoreListingSchema.extensionSummary`           | `kayingcodePluginExtensionSummarySchema.optional()`；listing 与 overview 结果对象仍为 strict。                                                 |
| `kayingcodePluginsOverviewParamsSchema.includeExtensionSummary` | `z.boolean().optional()`；params 对象 strict。                                                                                                 |

## 兼容契约（双向）

- **旧 CLI**：`plugins/overview` 参数 schema 是 strict，多一个键整条拒绝 → services 不得无条件发送
  `includeExtensionSummary`，必须先读 `pluginExtensionSummary` 能力位。
- **旧 services**：`plugins/overview` 结果 schema 是 strict，没有 `extensionSummary` 键，多一个键整页解析失败
  → CLI 只在请求带 `includeExtensionSummary === true` 时才在 `listing` 上写该字段。
- 缺省（旧目录条目、旧缓存、内置 seed）自然不带摘要；旧 payload 继续可解析。

## 允许携带摘要的响应

| 响应                                                                                                            | 是否可带 `listing.extensionSummary`    |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `plugins/overview` 且请求 `includeExtensionSummary: true`                                                       | 是（available / installed 的 listing） |
| `plugins/overview` 未要求                                                                                       | 否                                     |
| `plugins/install`、`plugins/update`、`plugins/list`、`plugins/describe`、`plugins/resolveSuggestedReference` 等 | 否                                     |

安装/更新结果与 legacy 响应一律不带摘要：它们的结果 schema 与版本无关，带上等于对旧 services 破坏兼容，
也把目录层展示元数据混进安装事实。

## 失败降级

- 目录条目摘要非法（非对象、`engines.zcode` 缺失/空白/非字符串）⇒ 视为没有摘要，listing 照常返回其余字段。
- `grants` 非数组或缺省 ⇒ `[]`；数组内非字符串项丢弃。
- 月份未知键（`engines.node`、`main` 等）⇒ 丢弃，不能进 strict 协议。
- 任何一层缺失摘要都只是「没有摘要」，不是错误：overview 不得因摘要失败而失败。

## 数据流

适配器 `parseEntryExtensionSummary` 从目录条目 `entry.raw` 解析（旧缓存无需迁移）→ bootstrap 的
overview 数据把摘要作为独立字段挂在 available / installed 上 → 协议投影按请求参数并入
`listing.extensionSummary` → services 按能力位决定是否请求 → App 用 `isExtensionEngineCompatible` 判断。

CLI 侧投影细节见 `apps/zcode-cli/packages/bootstrap/spec/plugin-extension-summary.md`；
services 能力门禁见 `packages/services/spec/plugin-extension-summary.md`。

## 验收

- `kayingcodePluginExtensionSummarySchema` 拒绝 `engines` 缺省、`zcode` 空白、未知键。
- `kayingcodePluginsOverviewParamsSchema` 接受 `includeExtensionSummary: true`，拒绝未知键。
- 旧结果（无 `extensionSummary`）继续通过 `kayingcodePluginsOverviewResultSchema` 解析。
