# ZCode 3.17.2 采纳计划与验收

## 范围与来源

- 产品起点：`74eeae8d`，上次上游基线 `3c5b227649371507ddc4eb46ac5133afe6db1cab`（3.16.2）。
- 官方目标：`https://github.com/zai-org/ZCode` 的 `a9fe401e`（3.17.2）；在 `kaying-code-feature-upstream-3-17-2` 独立工作区适配。
- 按模块三方比较基线、KayingCode 与目标；源文件更名按本地路径适配，不整树覆盖。逐文件结果以合并提交 diff 为准，本文件记录模块采纳、主动保留与验收边界。

## 规则与所有者

- main 只保存官方源码镜像；dev 保存产品集成结果，release 本轮不推进。
- RPC/shared/client 统一承载接口变化；Agent/runtime、Host/service、UI 使用现有公开端口，保留本地工作区身份与 owner/lease。
- Agent 的 CommandInbox 保持已提交输入的唯一 admission；Renderer 只持有草稿与 optimistic overlay。桌面连续流与手机 replayable 链路不互相替换。
- 上游新增文件只有在当前产品模块及其契约成立时引入；已退役模块不恢复。保留 KayingCode 的本地 ApiMock、内置/本地插件、Computer Use 插件、品牌资产、产品版本、发布分支与 CI 规则。
- 保留最近侧栏置顶/拖拽反馈、模式文案、启动 Logo 动画等本地改动；不以采用上游 UI 为由覆盖已验收行为。
- 上游批量删除测试不作为删除 KayingCode 回归测试的理由；测试工具链与平台配置按当前项目约定适配。

```text
官方 fetch → main 快进镜像
                   ↓ 以 3.16.2 为三方比较基线
  运行时与共享协议 → Host/Service → Client/Renderer/UI
                   ↓ 类型、架构、回归与构建验证
          feature 采纳提交 → kaying-code-dev
```

## 验收

- 所有冲突逐项解决，以真实适配树建立合并提交；不以 ours merge 假冒代码采纳。
- 检查新增模块契约、跨包 exports、平台差异、依赖和生成的源码地图。
- 必须执行根 typecheck、lint、source:check、architecture:check；CLI 变更额外执行 CLI typecheck/lint。
- 执行受影响模块可用测试与桌面构建，交互变更验证已有 E2E 场景；明确报告未执行与环境限制。
- 只有审阅完全部差异并验证后推进 `UPSTREAM_BASE.json`；若存在未完成范围则保留旧基线并记录。

## 本轮采纳

| 范围                        | 合入内容                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Agent / adapters / workflow | 模型请求与重试、工具输入与路径处理、工作流运行与恢复、权限与后台任务等兼容增量；Hook 上下文独立结算、读取快照按实际记录顺序编号。 |
| RPC / shared / client       | 消息序列化、取消/关闭处理、协议与 schema 增量；wire 的 `zcode_type` 等兼容字段保持不变，路径映射到本地公开入口。                  |
| Services                    | 配置文件原子写入、目录可用性及存储等独立修复；项目文件 IO 的新实现只经 Node 入口导出。                                            |
| Desktop                     | Electron 44.7.0、updater 6.8.10、builder 26.17.0；文件关联应用、Office 预览链接安全和兼容构建改动。                               |
| UI                          | 文件另存为/打开方式、整张预览卡的单次导航、图片标注与缩放；保存 PNG 复用 Composer 附件队列并拒绝已释放 scope 的迟到结果。         |
| 工具与回归                  | provider-regression 工具、适用测试/fixture；补齐新 core 回归的测试夹具闭包，修正 core 测试入口与 CLI 包内 Lint 入口。             |

Node、pnpm、产品名称/应用 ID 和产品版本来源保留本地约定。Visualize 与 node_repl 插件的已变更内容使用 0.1.1，版本仍由插件 package/manifest 与生成目录统一校验。XLSX 固定 0.16.0 与上游补丁匹配，避免范围依赖升级后丢失链接安全接口。

## 按产品边界明确保留

- KayingCode.localrun 的 ApiMock、模型配置、鉴权与本地默认路径；不接入上游官方订阅/计费/云目录。
- 当前 Host/session/Controller、SSH/Relay、设置 Source authority 与桌面 continuous / 手机 replayable 链路；未接入的新 Host 方法和遥测不宣告能力。
- 当前设置页和配置同步协议；排除上游整套 data-sync/settings-scope 替换，避免同时出现两套配置写入路径。
- 独立 Computer Use 插件；不恢复旧 CUA package、Helper/Broker、旧权限面板与 PiP。上游依赖这些模块的代码和回归不作为本产品能力引入。
- 现有会话/草稿/投影界面、内置/本地插件和游戏入口、置顶拖拽反馈、模式文案、启动 Logo 动画；不恢复已移除的分享、高速卡、旧 Office 插件面板等产品入口。
- 自有品牌/版本、分支规范与发布 CI；不采用上游面向官方服务的配置文件、批量测试删除或根文档布局。main 仍完整保存官方源码，产品差异只存在 dev。

新增源码中可独立编译的协议、纯函数或端口并不等于当前产品已开放对应功能；本轮不为未装配的能力新增可点击入口。上述保留项是审阅后的产品差异，不表示已实现上游全部产品功能。

## 验证记录

- Node 24.14.0 / pnpm 10.31.0；根类型检查、目录/插件/源码地图及架构检查。
- Agent core：25 个测试文件、193 个用例；Shared 的 ApiMock、Gen UI、输入预测契约等 17 个用例；UI 侧栏/模式等 19 个用例。
- 图片 receiver 的 2 个 Node 回归；图片编辑浏览器 22 个场景（含真实 Composer 接入与 scope 切换）；预览卡动作 6 个场景。
- 现有置顶拖拽 E2E（空/折叠目标、取消、重排、Host identity、重载、手机布局）及工作模式菜单中英文 E2E。
- CLI 依赖/产物构建、CLI 类型检查与真实包内 Lint；桌面 Main/Host/Preload/Renderer、常驻 Agent Node 与 node-repl-host 构建；node-repl-host 退役边界回归 2 个用例。
- Office runtime 与 provider-regression 工具类型检查；未执行真实外部模型请求。
- 浏览器与构建验证在 macOS 执行；Windows/Linux 原生系统关联行为、安装包签名/公证与真实远端升级未在本轮执行，不作为已验收结果。
- 合并后补齐 3.17.2 桌面 bundled-npm 依赖的 `scripts/prebuilt-binary-download.mjs`，并将 `prebuilt-binary-extract.mjs` 的 SHA-256 校验作为公开入口导出；`pnpm bootstrap` 在 Node 24.14.0 与 25.2.0 下均通过。
- 补齐 dev Electron 副本的 ad-hoc 签名函数（signApp 默认参数漏定义）与本地 `0006_task_group_admissions` 迁移登记；桌面 dev 启动通过，`task-groups.admit` 在升级库上成功，Services 17 个测试文件 / 44 个用例通过。

为避免给上游差异引入额外重构，保留少量共享单一状态/事务上下文的文件布局，并为这些文件记录定点行数说明；架构策略和 baseline 未放宽。Node 的 `.test.mjs` 采用与 TS 回归一致的测试行数豁免。
