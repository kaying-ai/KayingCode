# 扩展插槽与 MCP App 页面层（上游 3.18 P4）

## 产品规则

- 恢复上游 `plugin-ui` 页面层：MCP App / Gen UI / 扩展视图共用 `AppBridge`、沙箱传输、hostContext、能力声明与卸载顺序；扩展视图用 `contentKind: "extension"`。
- `extension-slots` 只持三份最近数据：Window Host 静态表（按 rev 整份替换）、扩展进程贡献快照（按 gen/rev 整份替换）、扩展进程状态；每个 `IExtensionsService` 一份 store，第一个使用者订阅、最后一个释放时退订。
- 五插槽：
  - `composer.status` 紧挨用量圆环左侧；只有设置 `text` 时显示，点击执行当前作用域命令。
  - `composer.mention` 只在 `@` 面板；command 条目走扩展命令，tool 条目走 CLI `plugins/mentionItems`。
  - `sidePane.launcher` 在侧栏启动页；无可用行不渲染。
  - `nav.primary` 在左侧导航「插件市场」之后；手机远控与插件市场一同隐藏。
  - `file.viewer` 在 `handleOpenCodeViewer` 内优先于内置代码预览；只有能严格相对化到当前工作区时接管。
- 扩展视图与扩展日志是工作区级侧栏标签：同一视图只开一个；扩展进程换代或作用域切换时按新代际重建/关闭。
- 授权：启动页 needs-consent/activation 行与插件详情「权限」区块共用 `IExtensionGrantsService` 与 ConfirmDialog；授予必须等于清单当前声明，撤销/通知开关走同一门面；Web/手机无授权门面时不渲染。
- 日志：Main 是环形缓冲 owner，Renderer 只投影；按 seq 去重/补齐，最多 2000 条，清空是本地投影水位。

## 状态所有者

- Window Host：扩展静态表、授权、视图/订阅、日志快照。
- Main supervisor：扩展进程状态与日志环形缓冲。
- Renderer store：只持投影与订阅引用计数，不写插件/会话事实。
- App 层：`ExtensionViewsProvider` 统一处理 `views.open`、`workbench.startDraft`、`grants.request`、`notifications.show` 与 env 报告。

## 接口与装配

- `IExtensionsService` / `IExtensionViewsService` / `IExtensionGrantsService` 经桌面 base Host attachment 暴露；`RemoteServiceAccess` 以 `extensionsService: true` 打开，Web/手机保持 undefined。
- `useAppPanels` 新增 `handleOpenExtensionView`、`handleOpenExtensionLogs`、`routeFileViewer`；App 用 `ExtensionViewsProvider` 包裹 Shell。
- `V4ComposerToolbar`、`MentionPlugin`、`ProjectSidebarNavigation`、`PluginStoreDetailView`、`AnimatedSidePanePanel` 分别挂载五个插槽/权限区块/侧栏标签。
- 品牌/目录：扩展图标、视图资源与插件 id 继续使用本产品市场 ID；i18n 新增中英文 `extensions.*` / `pluginUi.*` key。

## 验收

- 根 `pnpm run typecheck`：通过（含 client/ui/desktop）。
- `pnpm run lint`：0 errors（133 条既有 warnings）。
- `source:check`、`architecture:check --changed`：通过。
- `extensionSlotsDomain` **3/3**：本地化标题回退、file viewer 标签稳定 id、日志裁剪与过滤。
- 桌面端真实扩展激活、视图 MCP、授权对话框与崩溃重启需要 Electron E2E 环境，本轮未在 CI 执行。

## 非目标

- 不改变插件市场 ID、内置插件内容或发布流程（P5）。
- 不在 Web/手机远控打开扩展门面；这些环境保持降级。
