# 内置插件总览与协议评估

> 文档性质：调查报告，不是行为规范，也不是发行许可验收结论。
> 评估基准：2026-11-08 当前检出源码；实测命令与输出见第 5 节。
> 事实来源：`config/official-plugins.json`（唯一发行登记）、各插件 `.kayingcode-plugin/plugin.json` 与 `package.json`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`upstream-lock.json`、`third-party/inventory.json`。本文不另建版本清单；版本与 npm 包名以发行登记及生成的 `SOURCE_PACKAGES.md` 为准。

## 1. 维护位置

| 层次             | 路径                                                                                                                                                                            | 职责                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发行登记         | `config/official-plugins.json`                                                                                                                                                  | 16 个发行项 + 1 个兼容占位；定义 `name`、`sourceRoot`、`stagedPath`、`deliveryKind`、`defaultEnabled`、`rootCandidates`、`requiredSeedPaths`、展示用 `listing` |
| 插件源码         | `apps/zcode-cli/packages/*-plugin/`、`apps/zcode-cli/packages/node-repl-host/`                                                                                                  | `.kayingcode-plugin/plugin.json`（插件 ID/版本/许可）、`package.json`（npm 名/版本/许可）、`skills/`、`commands/`、`src/`、`spec/`、`scripts/`                 |
| 生成物（勿手改） | `apps/zcode-cli/packages/contracts/src/plugins/official-plugin-catalog.generated.ts`、`packages/shared/src/official-plugin-defaults.generated.ts`、`SOURCE_PACKAGES.md`         | 运行时 Contracts、默认启用 ID、发行映射表                                                                                                                      |
| 生成与校验       | `scripts/generate-official-plugin-catalog.mjs`、`scripts/official-plugin-catalog.mjs`、`scripts/generate-source-map.mjs`                                                        | 校验 manifest 身份/版本一致、路径约束、build 脚本、native 资产，并写出生成物                                                                                   |
| 运行时           | `apps/zcode-cli/packages/bootstrap/src/plugins.ts`、`src/app/bundled-plugins.ts`、`src/app/official-plugin-source-paths.ts`；`packages/zcode-server-cli/src/packaging/stage.ts` | 启动时播种、开发态源码发现、制品 staging                                                                                                                       |
| 用户态状态       | `~/.kayingcode/cli/config.json` 的 `plugins` 字段                                                                                                                               | 启停与内置插件抑制（「卸载」）标记，不在仓库维护                                                                                                               |
| 维护文档         | `plugins/UPDATE_GUIDE.md`、`plugins/upstream-audit-2026-10-23.md`、`CONTEXT.md`、`apps/zcode-cli/packages/bootstrap/specs/builtin-plugin-distribution.md`                       | 上游检查流程、历次核验记录、领域词汇、发行边界                                                                                                                 |

根 `AGENTS.md` 与 `README.md` 仍把 `plugins/` 描述为内置插件目录，`build:cli-assets` 也保留 `./plugins/*` 过滤，且发行校验允许 `plugins/xxx` 作为 `sourceRoot`。但当前检出的 `plugins/` 只有两份 Markdown 文档，插件源码已全部位于本目录；这类描述属于历史残留，不应据此到 `plugins/` 找插件代码。

本目录共 34 个子目录：16 个为发行插件，3 个含 `plugin.json` 但未进入发行集合（`restore-legacy-sessions-plugin` 为兼容占位，`superpowers-plugin`、`visualize-plugin` 未登记），其余为 CLI 运行时与共享包（`adapters`、`bootstrap`、`cli`、`contracts`、`core`、`office-runtime` 等）及 `bundled-skills/`。

## 2. 当前内置插件清单（16 项）

许可列格式为 `package.json / plugin.json`；加粗表示两者冲突或字段缺失。

| 插件 ID                | 源码目录                       | npm 包名                                  | 版本  | 交付形态 | 默认启用 | 声明许可（pkg / manifest） | LICENSE 文件                     |
| ---------------------- | ------------------------------ | ----------------------------------------- | ----- | -------- | -------- | -------------------------- | -------------------------------- |
| `node-repl-host`       | `node-repl-host/`              | `@zcode/node-repl-host`                   | 0.1.1 | build    | 是       | **（无） / MIT**           | **无**                           |
| `android-emulator`     | `android-emulator-plugin/`     | `@zcode/android-emulator-plugin`          | 0.1.0 | resource | 否       | MIT / MIT                  | 有                               |
| `browser-use`          | `browser-use-plugin/`          | `@zcode/browser-use-plugin`               | 0.1.0 | build    | 是       | **Apache-2.0 / MIT**       | **无**                           |
| `kaying-for-taptap`    | `kaying-for-taptap-plugin/`    | `@kayingcode/kaying-for-taptap-plugin`    | 0.1.1 | native   | 是       | MIT / MIT                  | **无**（仅 vendor 上游 LICENSE） |
| `documents`            | `documents-plugin/`            | `@zcode/documents-plugin`                 | 0.1.0 | resource | 是       | MIT / MIT                  | 有                               |
| `pdf`                  | `pdf-plugin/`                  | `@zcode/pdf-plugin`                       | 0.1.0 | resource | 是       | MIT / MIT                  | 有                               |
| `presentations`        | `presentations-plugin/`        | `@zcode/presentations-plugin`             | 0.1.0 | resource | 是       | MIT / MIT                  | 有                               |
| `spreadsheets`         | `spreadsheets-plugin/`         | `@zcode/spreadsheets-plugin`              | 0.1.0 | resource | 是       | MIT / MIT                  | 有                               |
| `image-search`         | `image-search-plugin/`         | `@zcode/image-search-plugin`              | 0.1.0 | script   | 是       | MIT / MIT                  | 有                               |
| `ios-simulator`        | `ios-simulator-plugin/`        | `@zcode/ios-simulator-plugin`             | 0.1.0 | resource | 否       | MIT / MIT                  | 有                               |
| `plugin-creator`       | `plugin-creator-plugin/`       | `@zcode/plugin-creator-plugin`            | 0.1.0 | resource | 是       | MIT / MIT                  | 有                               |
| `skill-creator`        | `skill-creator-plugin/`        | `@zcode/skill-creator-plugin`             | 0.1.0 | resource | 是       | MIT / MIT                  | 有                               |
| `kayingcode-guide`     | `zcode-guide-plugin/`          | `@kayingcode/kayingcode-guide-plugin`     | 0.1.0 | resource | 是       | MIT / MIT                  | 有                               |
| `computer-use`         | `kaying-computer-use-plugin/`  | `@kayingcode/kayingcode-cua-plugin`       | 0.1.0 | native   | 否       | MIT / MIT                  | 有                               |
| `blender`              | `blender-plugin/`              | `@kayingcode/blender-plugin`              | 0.1.0 | script   | 否       | MIT / MIT                  | **无**（仅 vendor 上游 LICENSE） |
| `kaying-game-playtest` | `kaying-game-playtest-plugin/` | `@kayingcode/kaying-game-playtest-plugin` | 0.1.0 | build    | 是       | Apache-2.0 / Apache-2.0    | 有                               |

根 `LICENSE` 为 Apache-2.0（`Z.AI Co., Ltd` / `KayingCode contributors`），与插件各自声明的 MIT / Apache-2.0 分属不同层次，不构成冲突；但插件随制品分发时仍需各自附许可文本（见 4.3）。

## 3. 来源与上游情况

依据 `plugins/upstream-audit-2026-10-23.md`（16 项为范围）及插件内 `THIRD_PARTY_NOTICES.md`、`upstream-lock.json`：

| 分类                       | 插件                                                                                                         | 上游与锁                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定 Git 源码快照          | `blender`                                                                                                    | `ahujasid/mcp-for-blender` 2.2.2 / `5a3618fccb2d982d0dd61e7a1879912c3100073b`，MIT，31 个文件 SHA-256 与 add-on protocol 校验通过                         |
| 固定 npm 分发包            | `kaying-for-taptap`                                                                                          | `@taptap/maker` 0.0.38、`@taptap/instant-games-open-mcp` 1.24.14，MIT，保留 integrity 与逐文件 SHA-512                                                    |
| 本地移植的上游快照         | `computer-use`                                                                                               | `kaying-ai/kaying-computer-use` 0.2.4 / `984ad2f406e8f83abaf7d91599c4d7cd325f362b`，MIT；仓库迁移后公开 HEAD 的祖先关系无法证明，未覆盖 vendor 或原生制品 |
| ZCode MIT 内容移植         | `plugin-creator`、`skill-creator`、`kayingcode-guide`                                                        | README 记录为本地移植，未记录原始导入 commit；不能声明与公开 HEAD 同步                                                                                    |
| 原创实现（基于 Python 库） | `documents`、`pdf`、`presentations`、`spreadsheets`                                                          | 无 ZCode 专有源码副本，本轮不覆盖技能或浮动升级环境依赖                                                                                                   |
| 无可同步第三方快照锁       | `android-emulator`、`ios-simulator`、`browser-use`、`image-search`、`kaying-game-playtest`、`node-repl-host` | 系统 SDK、Openverse API、内部服务依赖不构成插件整体上游                                                                                                   |

`computer-use` 的上游可追溯性风险和 ZCode 移植三件套缺少导入基线，属于来源证据缺口，不等于已完成许可违规认定；记录在此供后续上游检查闭环。

## 4. 协议评估

### 4.1 发行 / 清单契约：全部通过

`pnpm run source:plugins:check` 返回 `official plugin catalog: OK (16 release entries, 1 compatibility-only)`；`pnpm run source:map:check` 返回 `source package map: OK (61 packages)`。

`scripts/official-plugin-catalog.mjs` 的校验覆盖：插件 ID 命名与 `sourceRoot`/`stagedPath` 路径约束、目录去重、`plugin.json` 与 `package.json` 的 name/version 一致、`stagedPath` 与 npm 包名一致、`deliveryKind` 合法、`rootCandidates` 含源码与制品根、`build`/`native` 需有构建脚本且脚本存在于 `package.json`、`requiredSeedPaths` 与 native 平台资产存在。16 项均通过，说明所有内置插件满足当前仓库的插件清单与发行契约。

### 4.2 开源许可义务：部分未满足

按各插件自身声明的许可证核对「随副本保留版权与许可文本」及 Apache-2.0 §4 的附带义务：

| 类别                                                                                                | 插件                                                                                                     | 状态                                                       |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 自有 MIT，附 MIT 全文与 `Copyright (c) 2026 kayingai.com`                                           | `android-emulator`、`documents`、`pdf`、`presentations`、`spreadsheets`、`image-search`、`ios-simulator` | 满足                                                       |
| ZCode MIT 内容移植，保留 `Copyright (c) 2026 Z.ai` 与 `kayingai.com (KayingCode adaptations)`       | `plugin-creator`、`skill-creator`、`kayingcode-guide`                                                    | 满足署名保留义务                                           |
| 上游 MIT 本地适配，保留 `Copyright (c) 2026 Leo`、上游仓库链接与版本锁                              | `computer-use`                                                                                           | 满足上游 MIT 附带义务                                      |
| Apache-2.0 衍生，LICENSE 含全文及附录 `Z.AI Co., Ltd` / `KayingCode contributors (derivative work)` | `kaying-game-playtest`                                                                                   | 满足 §4 主要附带义务；未见上游 NOTICE 文件，若实际存在需补 |
| 上游 MIT 快照 / npm 包，`vendor/*/LICENSE` + `THIRD_PARTY_NOTICES.md` + `upstream-lock.json`        | `blender`、`kaying-for-taptap`                                                                           | 上游部分义务闭合；插件自身声明 MIT 却无插件级 LICENSE      |
| 许可标识冲突且无许可文件                                                                            | `browser-use`                                                                                            | 未满足                                                     |
| 许可标识缺失且无许可文件                                                                            | `node-repl-host`                                                                                         | 未满足                                                     |

四个待修缺口：

| 插件                | 现象                                                                                                                       | 影响                                                                                                 | 建议                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `browser-use`       | `package.json` = Apache-2.0，`.kayingcode-plugin/plugin.json` = MIT；无 LICENSE / NOTICE；`requiredSeedPaths` 不含许可文件 | 若代码派生自 Apache-2.0 上游，MIT 声明与缺少许可副本、NOTICE 均不符合 §4；对外展示的许可信息也不一致 | 先确认真实派生来源，统一两个 manifest，补 LICENSE（必要时补 NOTICE）       |
| `node-repl-host`    | `package.json` 无 `license` 字段，`plugin.json` = MIT，无 LICENSE 文件                                                     | MIT 要求随副本附版权与许可声明，当前未附                                                             | 补 `license` 字段与 LICENSE 文件；若属纯内部宿主包，明确其许可归属         |
| `kaying-for-taptap` | 声明 MIT，插件根目录无 LICENSE，只有 `vendor/instant-games-open-mcp/LICENSE`                                               | 上游 npm 包义务已闭合，插件自身代码的 MIT 文本未随插件分发                                           | 补插件级 LICENSE，或明确由根 Apache-2.0 LICENSE 覆盖并在制品中附根 LICENSE |
| `blender`           | 同上，只有 `vendor/mcp-for-blender/LICENSE`                                                                                | 同上                                                                                                 | 同上                                                                       |

### 4.3 发行制品中的许可文本覆盖

- `packages/zcode-server-cli/src/packaging/stage.ts` 只为 `official-plugins` 组件写入 `runtime/licenses/official-plugins/THIRD-PARTY-NOTICES.md`，内容是根声明的副本；根声明（2.59 MB）覆盖 npm 生产依赖与 `copied-components.json` 中登记的组件（含 `mcp-for-blender` 的 MIT 原文），但不含各插件自身的 MIT 文本。
- CLI SEA 资产采集（`apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs`）的 `includedTopLevelPaths` 包含 `LICENSE`、`README.md`、`THIRD_PARTY_NOTICES.md`、`vendor`、`upstream-lock.json`，即「目录里有的会被带出，没有的不会被带出」。因此 4.2 中四个无 LICENSE 的插件没有许可文本随行。
- 目前只有 `computer-use` 把 `LICENSE`、`THIRD_PARTY_NOTICES.md` 显式列入 `requiredSeedPaths`；`blender`、`kaying-for-taptap` 列入的是 vendor 上游 LICENSE 与声明文件。建议把插件级 LICENSE 纳入全部相关项的 `requiredSeedPaths`，让生成校验与 SEA 资产校验成为强制门禁。

### 4.4 整包发行许可验收：未通过

`third-party/inventory.json` 当前有 19 项 `reviewRequired`：16 个 npm 精确版本的发布方原始版权/许可材料不完整（`acorn-import-assertions`、`ansi-to-react`、`quickjs-wasi`、`semaphore`、`tiny-case` 等）、`webpack-chain@6.5.1` 制品与对应源码验收、Skia 各平台链接库溯源、QuickJS-NG 的 WASI libc 溯源、Rust 标准库原始通知快照。

按 `third-party/SPEC.md`（2026-11-07 与官方上游对齐）的尺度：开发、构建、打包、SEA 上传不自动运行许可完整性检查，这些待办不额外阻断构建；显式 `check --strict` 仍保留材料缺口阻断。基础检查通过、生成成功或构建成功都不等于发行许可验收通过，实际安装包内的依赖与声明还须在目标平台单独核对。

## 5. 实测命令与结果

| 命令                                                        | 实测输出 / 结论                                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run source:plugins:check`                             | `official plugin catalog: OK (16 release entries, 1 compatibility-only)`，退出 0                                                                                  |
| `pnpm run source:map:check`                                 | `source package map: OK (61 packages)`，退出 0                                                                                                                    |
| `node scripts/licenses.mjs check`                           | `✓ 许可标识与声明新鲜度检查通过：2789 个实装包（精确版本证据与用途复核 38 项）`，退出 0                                                                           |
| `node scripts/licenses.mjs check --strict`                  | 输出「待补齐/核验材料 19 项；发布前运行 check --strict，不得将基础检查通过视为合规完成。」进程随后挂住并被终止，未取得退出码；结论与 inventory 及下述只读接口一致 |
| `readVerifiedNotices()`                                     | 通过：声明 hash 与输入新鲜度一致                                                                                                                                  |
| `readVerifiedNotices(undefined, { requireComplete: true })` | 逐项报 19 项材料缺口，完整性未闭合                                                                                                                                |

环境：Windows x64，Node v22.22.2（仓库要求 `>=24`，仅有 engine 警告）。本次未联网复核上游最新状态，来源信息沿用 `plugins/upstream-audit-2026-10-23.md`。

## 6. 结论与待办

**结论**：内置插件的清单/发行契约全部满足；开源许可义务不能判定为「全部满足」——12 项已满足各自声明的随附义务，4 项存在许可文本或标识缺口，整包严格许可验收另有 19 项材料待办。本文为调查记录，不构成法律意见，也不替代按 `third-party/README.md` 在目标平台做的实际制品验收。

建议顺序：

1. 确认 `browser-use` 派生来源，统一许可标识并补 LICENSE / NOTICE。
2. 为 `node-repl-host`、`kaying-for-taptap`、`blender` 补插件级 LICENSE，或明确由根 LICENSE 覆盖并把根 LICENSE 带入 runtime 制品。
3. 把插件级 LICENSE 加入相关插件的 `requiredSeedPaths`，再运行 `pnpm run source:plugins` 与 `pnpm run source:check` 更新生成物。
4. 按 `third-party/README.md` 补齐 19 项材料，运行 `node scripts/licenses.mjs notices`、`check`、`check --strict`，并在各目标平台核对实际制品。
5. 需要行为或目录改动时，先按 `AGENTS.md` 在所属包内更新 spec，再执行 `pnpm run typecheck`、`pnpm run lint`、`pnpm run architecture:check --changed`。

复核对本报告的清单数据：从仓库根目录运行 `pnpm run source:plugins:check`、`pnpm run source:map:check`，并阅读 `SOURCE_PACKAGES.md` 的「插件发行映射」表。
