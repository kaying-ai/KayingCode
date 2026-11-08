# 第三方声明维护与显式检查

本目录保存原始材料、来源与校验记录。`THIRD-PARTY-NOTICES.md` 和 `inventory.json` 由根目录的 `node scripts/licenses.mjs notices` 生成。生产图来自当前 pnpm 工作区与 `pnpm-lock.yaml`，但通知只收集生成主机已安装的包；`inventory.json.generatedOn` 记录主机平台，`notInstalled` 列出未装入本机的可选版本。各目标平台须分别核对实际制品和通知；单机清单不是全平台许可证明。

## 当前规则与审阅

工具所有者、生产集合与构建/显式校验边界见 [许可规范](../scripts/spec/license-inventory.md)；用户排查报告的逐项纠正与补充见 [专项核查](../scripts/spec/license-audit-2026-11-06.md)。下方历史轮次的数字仅代表对应快照，当前状态以实际命令结果和 inventory 为准。

2026-11-07 生效的执行尺度见 [SPEC.md](SPEC.md)；上游与本仓情况见 [调查结论](UPSTREAM-INVESTIGATION-2026-11-07.md)。遵循上游：开发、构建、打包、SEA 上传不自动运行许可完整性检查；待办及清单过期不额外阻断。消费入口需要的材料文件和制品缺失时仍报错。显式 check / strict 保留原有判断与失败结果。

许可表达式保留 SPDX 的括号和 AND/OR 优先级。标识缺失和非默认用途复核统一在 license-reviews.json 绑定精确版本、预期字段、发布方材料哈希、安装物证据及允许 owner。开发工具移入生产、原文变动、版本变化或新增本地补丁均需重新复核。该登记不替代 npm-overrides 的完整版权材料，也不豁免最终制品交付义务。

当前 Web 同时交付本仓声明和保留的上游快照声明，manifest 登记两份哈希。材料不随构建自动重生成；基本许可标识/用途边界与 strict 完整性检查分别报告，strict 的未解决项不会为了得到绿色结果而删除。

2026-11-06 继续核查：已取得 boolbase、SWC counter、Hono node-ws、react-remove-scroll-bar 四项适用源码的原始通知并保留身份关联材料；清单剩余 20 项材料/发行验收待办，显式 strict 仍失败。保留现有功能；按 2026-11-07 与上游对齐的规则，这些待办不自动阻断构建、打包或上传。各条目的已查来源、升级限制、原生工具链线索和 Taro 实际构建结果见专项核查；历史轮次的数量不代表当前状态。

## 输入及操作

| 输入                              | 责任                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| `npm-overrides.json`、`upstream/` | npm 包未随包提供完整通知时的版本固定补充材料、来源与字节 hash   |
| `copied-components.json`          | 复制源码、技能及素材的归属、原始许可和本地修改说明              |
| `embedded-components.json`        | Canvas/Skia、QuickJS/WASI 等内嵌组件及构建来源                  |
| `native-search/sources.json`      | 原生搜索工具、归档、依赖组件、原始许可和配置 hash               |
| `runtime/sources.json`            | 随产品分发的 Node 原始许可集合                                  |
| `license-reviews.json`            | 精确版本的标识与用途复核、原文/安装物证据和发行材料边界         |
| `inventory.json`                  | 生成后的精确版本、输入 hash、通知 hash 和 `reviewRequired` 待办 |

修改依赖后先执行 `pnpm install --frozen-lockfile`，再更新精确版本的材料，最后运行：

```sh
node scripts/licenses.mjs notices
node scripts/licenses.mjs check
node scripts/licenses.mjs check --strict
```

`notices` 成功只表示声明已生成。基础 `check` 同时检查许可标识和输入新鲜度；`--strict` 还要求所有材料待办闭合。不要把生成成功、基础检查成功或构建成功写成发行许可验收通过。

进行目标平台的显式许可验收时，在目标平台运行 `notices`、`check`，需要核验材料完整性时运行 `check --strict`；显式校验器会拒绝其他主机平台生成的清单。这些命令不自动成为跨平台构建的前置条件。实际安装包内的依赖和声明另行核对，不能以主机平台一致代替制品检查。

仅核对声明 hash 与输入新鲜度，可从根目录运行下列只读命令；它不替代许可标识门禁：

```sh
node --input-type=module -e "import { readVerifiedNotices } from './scripts/third-party-notices.mjs'; await readVerifiedNotices();"
```

独立核对完整性使用同一接口的 `{ requireComplete: true }`，便于在许可标识门禁先失败时仍盘点材料：

```sh
node --input-type=module -e "import { readVerifiedNotices } from './scripts/third-party-notices.mjs'; await readVerifiedNotices(undefined, { requireComplete: true });"
```

## 材料规则

优先保留安装包内的原始 LICENSE/NOTICE；缺少时查发布者 `gitHead` 或精确 release tag。README 中完整的版权、授权与免责声明可以作为原始材料，但仅有“MIT”标签或链接不能冒充完整通知。不得从作者字段推断版权人，也不得复制标准许可证模板后宣称它是上游原文。

`acceptedMissingNotice` 只用于在声明中保留已获得的发布者 README/元数据并明确暴露缺口，会进入 `reviewRequired` 并使严格检查失败；它不是发行豁免。原有 `evidenceKind` 记录也必须保留其材料限制。清理过期版本记录按精确生产图执行，不删除不相关历史原文。

补齐记录必须给出适用包及版本、原始文件、不可漂移的来源、SHA-256 和核实依据。取得完整证据后才移除对应材料限制。二进制项目的主项目 LICENSE 不能替代其静态链接库、WASM libc、扩展和构建来源的核验。

原生配置 hash 失效时先对比旧版本。2026-10-12 已核实 `872ad960` 至 `a0f13f0`、`33d353e` 的变化仅为 CLI 依赖目录及 Desktop 输出目录迁移；据此刷新 hash，并在 `native-search/sources.json.inputRefreshEvidence` 留证。此方法不适用于工具版本、源代码或归档内容发生变化的情况。

## 历史结果与剩余发行事项（2026-10-16）

以下保留历史检查记录；其中“阻断”指对应显式检查，当前自动执行尺度以顶部 SPEC 为准。

在 macOS arm64 主机上，声明已按当前输入生成：1,622 个已安装 npm 包版本、159 个本机未安装版本、9 项复制组件、18 个原生归档。新补齐的 6 项 Darwin 二进制包通知采用经精确版本和上游修订核对的原文；生成及 hash/输入新鲜度检查通过。此前 52 项新版本通知缺口中，44 项获得完整原始通知；另外 8 项仅保留真实发布者材料并明确标记缺口。22 条旧版本补充记录已从活动清单中清理。

许可标识严格检查仍被本机实装的五项拦截，未扩大 allowlist：`@img/sharp-libvips-darwin-arm64@1.3.4`（LGPL-3.0-or-later）、`lightningcss@1.33.0`、`lightningcss-darwin-arm64@1.33.0`、`mdn-data@1.1.4`、`webpack-chain@6.5.1`（后四项 MPL-2.0）。前者不在当前工作区生产图，其余四项在生产图中；这不等于已证明某个发行包实际包含它们。按已确定的保留方案，需取得目标制品清单、对应原文和源码取得方式，再记录修改/链接义务的履行证据；在此之前保持阻断。

独立完整性检查仍有 26 项 `reviewRequired`：22 项发布者原始通知、1 项复制技能、Skia 与 QuickJS/WASI 两项构建来源、1 项 Rust 标准库原始材料。完整清单由 [inventory.json](inventory.json) 的 `reviewRequired` 维护，不再另建许可事实来源。

其中记录的 Rust 标准库 revision `6a6eaca656978778f7c1c750ee0c3db87f8bffb2` 在上游提交查询中未能解析；需要重新核对相应二进制的编译器来源，不能直接取当前 Rust main 的许可文件充当精确版本材料。复制的 React Best Practices 技能固定来源也未提供已取得的完整版权/许可原文，需取得发布者材料后再关闭该项。

本批新增的 8 个未闭合包如下。已核对精确 npm 发布材料及可用发布提交/tag，未找到完整原文；需要发布者材料或可核实的来源关联，不能猜测补齐。

| 精确包版本                      | 已保留材料与缺口                                      |
| ------------------------------- | ----------------------------------------------------- |
| `@hono/node-ws@1.3.1`           | 精确版本 README；发布提交的该包及根目录无完整许可文件 |
| `acorn-import-assertions@1.9.0` | 精确版本 README；未取得完整原始通知                   |
| `dingtalk-jsapi@2.15.6`         | 精确版本 README；发布元数据未给出可核验的公开源码仓库 |
| `eastasianwidth@0.2.0`          | 精确版本 README；未取得完整原始通知                   |
| `@swc/counter@0.1.3`            | 精确版本 README；发布提交与版本许可关联未闭合         |
| `native-request@1.1.2`          | 精确版本 README；未取得完整原始通知                   |
| `tiny-case@1.0.3`               | 精确版本 README；未取得完整原始通知                   |
| `proxy-agent-negotiate@1.1.0`   | 精确发布元数据；未取得完整原始通知                    |

这些结果表示声明工程与新鲜度修复已落地，严格发行门禁仍未通过。构建脚本目前消费已有声明，不能据此推断 release ready。Windows 安装/升级和 macOS/Linux/手机设备仍需分别验收。

## 2026-11-06：旧 Relay 退役续作

当前工具链以 pnpm 为准。生产图按完整工作区分批读取（每批最多四个），锁文件图与安装图逐精确版本核对，避免 Windows 全仓并发 list 的 EMFILE。旧登记可通过 `node scripts/licenses.mjs notices --prune-stale-overrides` 按实际完整生产集合显式清理；默认生成命令仍拒绝 stale 项。

补充了 18 个现用精确版本的原文来源，并清理 31 条退出生产集合的旧登记。来源证据保存在 npm-overrides.json；没有用标签代替原文，没有增加 acceptedMissingNotice。复制组件的 vendor LICENSE 同样按原字节保存，防止 Windows 自动换行改变材料。

原生配置仅有目录搬迁时，`node scripts/refresh-native-search-notice-inputs.mjs <旧提交>` 必须验证原登记与旧 blob 相符，并拒绝任何超出已审阅路径替换的变化。版本、归档和许可义务的变化不能通过该命令放行。生成器从 pnpm.patchedDependencies 保留每份现用补丁的修改声明。

生成后运行 `node scripts/third-party-inventory.e2e.mjs`，检查平台/输入新鲜度、5 份当前补丁及退役 manifest 不再入表。基础 `licenses check` 本轮仍被 17 个实装包的许可标识/材料门禁拦截，未放宽 allowlist；历史审阅缺口仍以生成后的 inventory.reviewRequired 为准。

最终生成成功：当前主机清单包含 1510 个精确包版本、10 个复制组件与 18 个原生归档；生成后验收确认 5 份 pnpm 补丁完整、旧 Relay manifest 已移除，仍有 23 项 reviewRequired。该结果表示清单新鲜度与完整收集通过，不表示 17 项许可门禁或材料义务已关闭。
