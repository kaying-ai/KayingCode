# 预装文档工具（preinstalled tools）

产品维护一组可选的本地文档工具（Python、LibreOffice、Pandoc、Poppler、QPDF），由 Desktop
Main 按构建内 catalog 下载、校验、解压并发布到固定入口目录，Agent 命令通过 PATH 使用它们。
本 spec 覆盖共享契约（`packages/shared/src/preinstalled-tools/`）与 Desktop 安装进程的边界；
设置页 UI 属于后续波次，本波次只交付后端。

## 产品规则

- 工具目录是**随构建发布的 catalog**，不是运行时远端清单：`packages/desktop/src/preinstalled-tools/catalog.json`。
  catalog 顺序同时决定状态顺序与自动准备顺序；UI 不维护第二份工具列表。
- 每个工具可有多个平台资源；Main 按 `process.platform` + `process.arch` 选择一个资源，其余资源对当前机器不可见。
  - 没有匹配资源时该工具仍保留描述，`target` 为 `null`（界面只能显示不可安装，不能隐藏工具）。
- 资源身份由 `toolId + resourceId + version` 组成；安装记录保存发布时的资源身份、必需文件与入口定义。
  入口是安装记录的派生结果，不按当前 catalog 旧字段重建。
- 下载基址与 catalog 分离：catalog 只保存 `archive.path` 相对路径，Main 把路径拼到有序去重的下载候选列表。
  - 覆盖变量 `KAYINGCODE_PREINSTALLED_TOOLS_CDN_BASE_URL`（逗号分隔，按书写顺序）优先。
  - 未配置覆盖变量时，本产品**没有官方预装工具 CDN**：候选列表为空，所有工具 `target` 为 `null`，
    不发起任何下载。产品发布自己的资源后再配置该变量（或后续把资源 CDN 注入 main 构建）。
  - 基址非法（不是 http/https）时仍保留全部工具描述但 `target` 为 `null`，并返回基址错误供 Main 记录；
    不回退到其他基址。只有 catalog 本身非法才整体失败。
- 发布身份 `release` 为 `production | preview | development`：`runtimeEnv === "development"` 时为
  `development`，否则跟随安装包身份。不同发布身份的安装根互不复用。
- 本波次不改变产品既有下载/安装逻辑；预装工具是附加能力。

## 安装根与状态所有者

- 数据根 `dataRoot`（Desktop 为 `{dataBaseDir}/.kayingcode`）固定安装根：

```text
dataRoot/preinstalled-tools/<release>/
  bin/                     所有工具的公开入口（Agent PATH 唯一注入点）
  tools/<toolId>/
    installation.json      唯一发布点（schemaVersion 1）
    versions/<resourceId>/ 已发布资源目录
    staging/<operationId>/ 单次准备的临时下载/解压/检查目录
```

- **唯一 owner**：
  - Desktop Main 拥有 catalog 装配、utilityProcess 生命周期与 IPC；不保存工具状态。
  - `PreinstalledToolsCoordinator`（utilityProcess 内）拥有全局偏好（自动预装、禁用工具集合）与
    唯一的串行准备队列。
  - 每个工具的 `PreinstalledToolOwner` 拥有该工具的安装记录、状态、准备/删除归属和入口写队列。
  - 安装记录原子 rename 是唯一发布点；`bin/` 内容只是记录派生文件。
- 偏好落盘复用设置服务（`preinstalledToolsAutoInstall`、`preinstalledToolsAgentDisabled`），
  预装进程是这两个字段的唯一写入者；缺省自动预装开启、全部工具启用。

## 下载 / 校验 / 解压语义

1. 准备前检查磁盘：需要同时容纳归档与展开体积（`statfs` 的 `bavail * bsize`）。
2. 每个下载候选从头下载，`accept-encoding: identity`；响应体流式写入 staging 并同时计算 SHA-256。
   - 超过清单 `archive.sizeBytes` 立即按完整性错误（checksum）终止。
   - 候选失败按 `checksum > interrupted > network` 保留最深错误；`ENOSPC` 始终优先为 `disk-space`。
3. 解压前先流式遍历归档条目：拒绝越界路径、反斜杠/盘符/NUL、未支持条目类型、越界链接，
   并限制展开总字节不超过 `installedSizeBytes`。随后用严格 tar 解压（保留执行权限与合法链接）。
4. 必需文件核对使用 `realpath` + 相对路径检查，必须位于解压目录内且是普通文件；只核对 catalog
   声明的必需文件。
5. 可选 `rewrite` 在必需文件核对后、发布前对 staging 执行：
   - `text`：纯文本替换；`binary`：NUL 结尾的字符串槽补零保持总字节数；
   - `binary-dir-prefix`：保持目录槽字节宽度，用 `/` 补满，逐处拒绝后继不是 `/`、NUL 或 EOF 的占位符；
     Windows 资源禁止声明该模式；
   - 安装路径按 UTF-8 字节比较，超长返回 `unsupported`；改写过的 Mach-O 在 macOS 上重新 ad-hoc 签名。
   - 共用纯字节算法在 `packages/shared/src/preinstalled-tools/rewrite-bytes.ts`，不读文件、不发布状态。
6. 先把解压结果移到 `versions/<resourceId>`，再用同一入口在**私有临时目录**运行 `runtimeChecks`
   （stdout+stderr 需包含 `expectedOutput`）；检查入口不进入公开 `bin/`。
7. 检查通过后写临时安装记录并原子 rename 发布；发布后再同步 `bin/` 入口。

## 入口与 PATH

- POSIX 入口是 `bin/<name>` 的 sh 脚本（`exec` 目标并转发参数）；Windows 入口是
  `bin/<name>.exe`（随包 shim 的副本）+ 同名 `.shim` JSON 配置。
- Windows shim 是 `packages/desktop/native/windows-preinstalled-entry-shim/` 的原生源码，
  由 `packages/desktop/scripts/build-windows-preinstalled-entry-shim.mjs` 构建为
  `kayingcode-preinstalled-entry-shim.exe`（开发态缓存在 `bundled-tools/<platform>/preinstalled-entry-shim/`，
  打包态解析 `resources/preinstalled-entry-shim/`）；本轮未接入 electron-builder 资源与签名流程。
- 入口配置先写 `.shim` 再放 `.exe`；Windows 上运行中的 `.exe` 通过改名移到 `.retired/` 撤下。
- **PATH 注入点是 Desktop Local Host**：`resolvePreinstalledToolsBinDir({ dataRoot, release })` 是唯一
  固定目录。Host 只按数据根与发布身份计算并透传给 `createLocalServices({ preinstalledToolsBinDir })`；
  Host 不读安装记录、不等待准备，也不接收 catalog。
- **注入判定属于 services 的 Agent spawn 边界**
  （`packages/services/src/runtime-tools/preinstalledToolsAgentEnv.ts`）：
  - 只有 `bin/` 目录存在且至少含一个非隐藏入口（忽略 Windows 撤下用的 `.retired/`）时，才把该目录
    放到子进程 PATH 最前并注入 `KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE=1`。
  - 目录缺失或为空时不写任何键：产品没有默认资源 CDN，未准备工具时不能让 AVAILABLE 或空 PATH 项
    改变 Agent 的 PATH 语义（否则文档插件会永久提示“预装未就绪”，且用户无法通过该提示完成准备）。
    这是产品相对上游（本机桌面无条件注入）的有意收紧，由 PATH/env 单测固定。
  - 每次 spawn 重新判定，工具准备完成后下一次启动 Agent 即生效；不缓存、不等待准备。
  - PATH 只做“目录 + 原 PATH”，去重保序；不做 shell 解析，路径含空格也不需要引号。
  - 不携带任何凭据、token 或 catalog 内容，只有路径与 AVAILABLE 标记。
- **spawn 边界只采用执行端 Host 的值**：`KayingCodeAgentProcessManager` 在组装子进程 env 时显式覆盖
  `KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE`，且仅当该值为真才采用 spawn env 的 `PATH`；继承自
  shell/部署命令的同名变量不能泄漏给 Agent，更不能下发给远端。
- desktop-attached remote、Web、独立 CLI 与远端 Agent/Server 不注入该 PATH，也不注入 AVAILABLE。
- 渲染进程不可见：该路径只进入 Agent 子进程 env，不进入 `IPlatformService`、会话快照或日志。

## 失败 / 回滚

- 准备失败或取消：撤销本工具入口、清理 staging；若已移到版本目录，按占用检查回收。
  旧版本与公开入口保持不变，直到新记录原子发布。
- 取消：排队项直接出队；活动项中止下载/解压/检查；已准入的原子发布不响应取消，必须先结算。
- 删除：先撤入口，再做进程占用检查（macOS lsof、Linux `/proc`、Windows 进程表），
  然后删记录与全部版本。有占用或无法确认时恢复入口，状态 `deletionBlocked=true`。
- 入口同步失败不撤销有效记录或设置：`entryOutOfSync=true`，由后续 sync/启动重建。
- utilityProcess 在报告 initialized 前退出视为启动失败，Main 不自动重拉（避免 fork 循环），
  等待中的查询以错误结束；报告后意外退出才重拉，且不自动下载。
- catalog 不可用（`tools: null`）与合法空列表不同：没有 owner，也不按 catalog 归属回收任何入口或目录。

## 渲染进程可见契约

- `IPlatformService`（`packages/shared/src/platform.ts`）新增三项可选能力，只有 Desktop 实现：
  - `getPreinstalledToolsState(): Promise<PreinstalledToolsState>`
  - `executePreinstalledToolsCommand(command): Promise<void>`（命令回执不代表第二份 UI 状态）
  - `onPreinstalledToolsState(callback): () => void`
- Electron IPC 频道（`PlatformChannels`，preload ↔ main）：
  - `kayingcode:preinstalled-tools:command`、`kayingcode:preinstalled-tools:get-state`、
    `kayingcode:preinstalled-tools:state`。
- 快照结构 `{ autoInstallEnabled, tools[] }`；每工具含 `agentEnabled`、`entryOutOfSync`、`toolId`、
  `displayName`、`status`、`target`、`installed`，准备中附 `phase`/`downloadedBytes`，失败附
  `error`（`network|interrupted|disk-space|checksum|extract|runtime|unsupported`），删除受阻附
  `deletionBlocked`。
- 命令：`set-auto-install`、`set-agent-enabled`、`sync-entries`、`prepare`、`cancel`、`delete`。
- 只有主应用窗口的 webContents 可以调用命令/查询；其他 renderer 拒绝。

## 设置字段

- `preinstalledToolsAutoInstall?: boolean`：自动预装开关；缺省 `true`。
- `preinstalledToolsAgentDisabled?: string[]`：禁用工具 ID 列表；缺省空数组（全部启用）。
- 两字段同时出现在完整设置 schema 与 patch schema；UI 只通过设置服务 patch。

## 品牌与数据兼容

- 环境变量、频道、数据目录、进程标签、shim 文件名、发布身份均使用 KayingCode 命名。
- catalog 中 `resourceId`、`archive.path`、归档内必需文件（含 `zcode-tool-resource.json`）、
  入口名（如 `zcode-python`）是**已发布归档的内容事实**，本仓保留原值；它们不是产品品牌面，
  也不能与现有资源字节不一致。产品自建资源时应整体替换 catalog 与归档。
- 包作用域保持 `@zcode/*`。

## 验收

- catalog 拒绝：重复工具、同平台重叠资源、不同工具共用入口、必需文件缺少入口目标、外部运行检查、
  完整下载地址（catalog 只接受相对路径）。
- 合法 catalog + 平台/arch 选择：匹配资源生成 `downloadUrls`（按段编码），无匹配资源 `target=null`；
  基址非法时全部 `target=null` 且返回基址错误。
- 入口名在工具内不区分大小写唯一；Windows 资源不得声明 `binary-dir-prefix`。
- 安装根 `<dataRoot>/preinstalled-tools/<release>/{bin,tools}` 稳定，与 catalog 无关。
- 纯字节改写：text 替换、binary 补零保持长度、dir-prefix 以 `/` 填满且拒绝非法边界、超长报 `unsupported`。
- 下载失败分类保持 `checksum > interrupted > network`，ENOSPC 优先。
- 状态投影：`installed` 是记录投影，独立于 `target`；target 为空但 installed 存在时仍为 ready。
- 单元测试：
  - `packages/shared/test/preinstalledToolsContract.test.ts`
  - `packages/desktop/test/preinstalledToolsInstaller.test.ts`
  - `packages/services/test/preinstalledToolsAgentEnv.test.ts`：bin 存在且有入口时 AVAILABLE=1 且
    PATH 前置该目录；目录缺失/为空/仅 `.retired` 时返回空 env；PATH 保序去重。

## 设备/平台边界

- Desktop Main 是唯一 native 安装操作执行者；renderer 不得直接调用 `window.kayingcode` 之外的安装路径，
  也不得自行下载或写数据目录。
- Web/手机端没有该能力：`IPlatformService` 三项均缺席。

## 遗留（本波次明确不做）

- `packages/ui` 的设置对话框、菜单入口、状态订阅与国际化文案。
- `packages/shared/src/storage.ts` 的 `preinstalledTools` 存储分类（需要 services storageCatalog 与
  resource-manager UI 同一次变更落地，避免穷举 `Record<StorageCategoryId, ...>` 断裂；规则与待补
  清单见 `packages/services/spec/storage-categories.md`）。
- Windows shim 的 electron-builder `extraResources`、签名/验签断言与 `prepare-runtime-assets` 接线。
- 官方资源发布链路（`scripts/preinstalled-tools/` 制作/发布工具）与默认资源 CDN。
- `packages/desktop/src/preinstalled-tools/CONTRACT.md` 中“本波次未接线 services spawn 注入”的
  表述需随本轮接线同步删除（该目录不在本轮修改范围）。
