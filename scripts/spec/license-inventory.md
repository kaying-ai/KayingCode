# 许可清单生成

当前执行尺度以 [第三方许可材料与交付边界](../../third-party/SPEC.md) 为准（2026-11-07 与官方上游对齐）：下文的失败、阻断指显式生成/检查命令，不自动扩展为构建、打包或上传的前置条件。

生产依赖图由固定 pnpm 的 list 输出拥有，生成器不自行猜测锁文件依赖边。安装图与锁文件图必须逐精确版本一致，平台可安装性过滤及完整许可原文要求不变。

复制组件使用原仓库内 LICENSE 原文时，也须通过 .gitattributes 禁止自动换行转换。Windows 检出必须保持已登记的原始字节哈希，不能把 CRLF 哈希登记成新的上游许可来源。

原生工具配置仅发生仓库目录搬迁时，可运行 `node scripts/refresh-native-search-notice-inputs.mjs <旧配置提交>`：先验证旧提交文件哈希等于现有 sources.json 登记，再确认当前文件仅替换已审阅的 CLI/Desktop 目录路径，最后更新输入哈希。任何版本、归档、校验和或其他源码变化都拒绝；归档和许可记录不重写。

修改依赖的来源统一读取 package.json 的 pnpm.patchedDependencies；生成后的 patches 必须包含每份当前补丁及原始字节哈希，不能沿用旧 Bun 顶层字段而漏记修改义务。生成后运行 `node scripts/third-party-inventory.e2e.mjs`，验证当前平台的新鲜度、补丁完整性与旧 Relay manifest 已移除。

大型 hoisted 工作区的全仓递归 list 会在 Windows 同时打开过多文件。生成器先用 depth=-1 获取相同工作区集合，再按最多四个包的批次依次读取完整生产图，锁文件图与安装图串行读取。每个包必须出现在结果中，任一命令失败即停止，不跳过缺失项，不用部分图生成清单。

验收：真实工作区 notices 能越过 EMFILE；check 验证输入哈希与许可材料。缺原文仍须失败，不伪造文本或手改生成哈希。

`node scripts/licenses.mjs notices --prune-stale-overrides` 可显式清理不属于当前完整生产集合的旧 npm-overrides 记录（包括仍在锁文件、但只用于开发的版本）。清理使用本次实际收集的完整集合，重新读取源文件计算输入哈希后继续生成；默认命令仍拒绝 stale override，不自动修改源材料登记。

## 所有者与边界

| 所有者                                 | 责任                                                         |
| -------------------------------------- | ------------------------------------------------------------ |
| third-party 的 JSON 与原文快照         | 精确版本、来源、哈希、材料缺口的唯一事实登记                 |
| third-party-npm.mjs                    | 锁文件/安装图一致性、平台约束与完整生产集合                  |
| license-identifiers.mjs 与审阅证据     | 标识解析、精确版本和许可类别绑定的判断；开发复核不适用于生产 |
| generate-third-party-notices.mjs       | 生成声明、材料清单、补丁声明；不得手工改生成哈希             |
| licenses.mjs check / --strict          | 显式标识、新鲜度及完整性门禁；strict 永远保留材料缺口阻断    |
| third-party-notices.mjs 与构建 adapter | 读取/分发已有原文；构建不刷新清单、不隐式放宽门禁            |

生产集合涵盖全部工作区的 production 依赖，包括内部开发应用；不等于最终安装包 SBOM。跨平台 os/cpu/libc 依 pnpm 配置决定，不可安装子树整体排除。实际锁文件安装快照必须匹配根锁文件（只归一化 CRLF），并强制 lockfile-only 查询环境，防止环境配置把锁图读成安装图。

恢复标识复核时必须绑定精确包版本、原文/发布元数据及 SHA-256；OFL 标识可识别不代表字体改名/分发义务已履行；Modified MIT 限制仅按当前诊断开发链复核，不得进入生产。sharp 当前经 Wrangler/miniflare 开发链引入，只有不在完整生产图且原文一致时才可作开发依赖复核；不得恢复“仅旧 CUA 使用”的过期断言。内部 elkjs 同样需验证生产 owner 仅限 dev-docs。未知版本/许可/owner 变化必须重新阻断。

Web 导出保留上游声明为单独文件，同时将当前本仓声明放在当前 Web 的 THIRD-PARTY-NOTICES.md 链接目标；不从上游缓存声明推断当前依赖已核验。构建复制与显式校验分别测试，缺原文的 ENOENT 不吞掉。

许可表达式必须按 SPDX AST 的 AND/OR 优先级与括号解析，禁止删除括号后按字符串拆分（如 GPL AND (MIT OR BSD) 不能误判为宽松）。精确版本的非默认判断集中登记在 third-party/license-reviews.json，绑定实际原文/元数据哈希、开发或内部 owner 边界及源码取得方式。原文漂移、生产范围变化、版本变化或新增补丁均重新阻断。基本标识/使用边界通过与严格发行材料通过分开报告。

后补的发布方 LICENSE 只有在固定源码快照明确覆盖所用代码时才能补齐旧包：保留对应原文、精确版本元数据及源码身份关联，不能仅引用当前分支。关联材料登记在 npm-overrides 的 reviewEvidence.files，由生成器读取并校验 SHA-256、纳入 inventory 输入；任一材料缺失或漂移时失败。源码相同但构建配置变化的事实单独记录，不声称重现了原始构建。此规则不补写发布方未给出的版权人。

react-remove-scroll-bar 的 npm gitHead 无法解析时，使用固定的有 LICENSE 源码快照核对已发布代码身份：scripts/check-scroll-bar-license-source.mjs 绑定原文/源码哈希、安装包版本、实际转译器版本和 12 份 JS 输出哈希，重新转译全部实现并比较词法 token（仅忽略空白/注释）。任何实现、版本、原文或工具链漂移必须失败；不能只以相近版本号放行。
