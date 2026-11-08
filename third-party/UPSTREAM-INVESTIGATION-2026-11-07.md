# ZCode 许可事项调查结论

- 调查日期：2026-11-07（Asia/Shanghai）。
- 官方上游：zai-org/ZCode；本次查询 main 为 a9fe401eede6e6e5e01be9048679c206fe6f02d9，版本 3.17.2，提交日期 2026-11-03。
- 当前产品调查基线：410d7e08，kaying-code-feature-license-governance；已采纳的 UPSTREAM_BASE 同为上述官方提交。本次不改变采纳基线。
- 调查范围：官方同一提交的 third-party、许可脚本与 SEA 上传入口，对照本仓源材料及 inventory。本文件记录调查快照；材料事实仍以源 JSON、原文及生成清单为准。

## 调查结论

官方上游已实现原文收集、来源/哈希登记、声明随产物交付和显式检查，但没有将全部材料缺口闭合。没有比本仓采纳基线更新的公开 main 提交可直接合入来解决当前 20 项。

上游实际 inventory 有 19 项待核验，本仓为 20 项，双方精确条目交集为 15 项。上游 README 仍保留“21 个包、25 项待核验”的历史数量，与生成清单不一致；不能用总量差认定某项已修复。

## 上游情况与当前情况

| 范围                     | 上游情况                                                                                                                                                                  | 当前产品情况                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 共同的 11 项 npm 材料    | ARMS browser/core/electron、deferred-promise、ansi-to-react、is-node-process、lazy-val、quickjs-wasi、semaphore、strict-event-emitter、unsafe-pointer 仍在 reviewRequired | 同样保留缺口；未取得适用原文时不宣称闭合                                                                    |
| 共同的 4 项复制/原生材料 | React Best Practices 技能、Skia、QuickJS-NG、未解析 Rust 修订均明确待补                                                                                                   | 同样待补；Skia、QuickJS-NG 已保留通知的哈希集合与上游一致                                                   |
| 本仓额外 5 项            | acorn-import-assertions、dingtalk-jsapi、proxy-agent-negotiate、tiny-case、webpack-chain 不在该上游锁文件及生成生产清单                                                   | 前四项为通知缺口，webpack-chain 为本仓补充的制品/源码验收项；属于依赖与核验范围差异，不是已继承上游修复     |
| 本轮已补的通知           | boolbase、react-remove-scroll-bar 仍待补；Hono 使用旧版本 1.3.0 且待补；SWC counter 不在其当前锁图                                                                        | 已为 boolbase、react-remove-scroll-bar、Hono node-ws 1.3.1、SWC counter 补齐通知与源码身份依据，见 410d7e08 |
| 标识与用途判断           | 保留原发布方 legacy 标识复核、开发用途复核及 sharp/elkjs 生产用途复核                                                                                                     | 保留对应目的，并绑定当前精确版本、证据哈希及 owner；不照搬已不适用的旧 CUA 用途描述                         |

共同的 15 项包括 11 项 npm、1 项技能、3 项原生来源。本仓全部 20 项及其版本以 [inventory](inventory.json) 的 reviewRequired 为准；历史详细取证见 [2026-11-06 专项记录](../scripts/spec/license-audit-2026-11-06.md)。

## 限制尺度：与上游一致

2026-11-07 用户明确选择与上游保持相同限制尺度。当前规则见 [SPEC.md](SPEC.md)。

| 操作                     | 上游尺度                                                | 本仓对齐结论                                                                    |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 开发、构建、打包         | 读取已有声明并复制/嵌入；不自动核验材料待办或清单新鲜度 | 相同；20 项待办不会自动阻断这些操作                                             |
| SEA 上传                 | 不自动运行完整性检查                                    | 移除本仓额外的 requireComplete 调用；原调用还引用未导入函数，会在制品收集前报错 |
| 显式 check               | 核对标识、用途、输入和声明新鲜度                        | 保留；失败就是该显式命令的结果                                                  |
| 显式 check --strict      | 材料缺口存在时退出非零                                  | 保留；本仓 20 项继续产生完整性检查失败，不改写为通过                            |
| 必需声明、原文或制品缺失 | 消费入口依实际需要报错，不合成空材料                    | 相同；不是忽略文件读取错误或缺失制品                                            |

此前“剩余项统一阻断发布”“跨平台构建前必须 strict 通过”的表述范围过宽，不再作为现行自动前置条件。此前的 strict 失败记录仍是真实检查结果，但不等于构建、打包或上传已经接入同一门禁。

能够构建、打包、上传与材料验收完成分别记录；对齐执行尺度不删除许可义务或原文待办，也不新增全仓待办清零后才可整体开源的自动要求。本次不调整根发布分支、版本标签或其他非许可校验。

## 核查依据

- [官方提交](https://github.com/zai-org/ZCode/commit/a9fe401eede6e6e5e01be9048679c206fe6f02d9)。
- [上游 third-party/SPEC.md](https://github.com/zai-org/ZCode/blob/a9fe401eede6e6e5e01be9048679c206fe6f02d9/third-party/SPEC.md)：所有者、交付入口，以及构建不隐式校验、strict 只作显式检查的规则。
- [上游生成清单](https://github.com/zai-org/ZCode/blob/a9fe401eede6e6e5e01be9048679c206fe6f02d9/third-party/inventory.json)、[源材料登记](https://github.com/zai-org/ZCode/blob/a9fe401eede6e6e5e01be9048679c206fe6f02d9/third-party/npm-overrides.json)：逐项比较，不按历史总数推断。
- [上游 README](https://github.com/zai-org/ZCode/blob/a9fe401eede6e6e5e01be9048679c206fe6f02d9/third-party/README.md)、[显式检查脚本](https://github.com/zai-org/ZCode/blob/a9fe401eede6e6e5e01be9048679c206fe6f02d9/scripts/licenses.mjs)。
- [上游 SEA 上传入口](https://github.com/zai-org/ZCode/blob/a9fe401eede6e6e5e01be9048679c206fe6f02d9/apps/zcode-cli/packages/cli/scripts/upload-sea-smb.mjs)。

## 本次验证

- 实际复现原上传入口在制品收集前抛出 readVerifiedNotices 未定义错误；移除额外调用后，3 项隔离上传回归通过。
- 共享声明构建/交付及显式检查回归共 12 项通过；真实 inventory 新鲜度检查通过，20 项待办保持原样，显式完整性接口仍拒绝它们。
- 根 typecheck、verify:pre-push（含目录、lint、架构检查）通过；根 lint 为 126 警告、0 错误，架构为 0 违例。CLI 自身 typecheck、lint 通过。
- 上传回归只操作系统临时目录中的虚构制品；本次没有真实 SMB 上传、部署或全平台安装包发行，也不以测试通过代替许可材料验收。
