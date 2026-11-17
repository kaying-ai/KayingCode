# TapTap Daily 独立分支维护说明

| 项目 | 内容 |
| --- | --- |
| 状态 | 独立分支维护，短期不合并 main |
| 分支 | `feat/taptap-daily-report` |
| 更新日期 | 2026-11-17 |
| 首个合并目标 | 暂不合并；先补齐发布打包、CI 覆盖和真实 E2E |

---

## 1. 决策

- 当前日报模块保持现状，作为独立分支继续维护；
- 相关文档（`spec/`、`docs/deploy/kayingcode-taptap-daily.md`、`docs/features/`）都保留在本分支，不迁移到 main；
- 不从本分支创建正式发布标签，也不把本分支的官方插件注册带入发布构建；
- 待发布打包和 Desktop/CI 能力补齐后，再评估合并回 main。

---

## 2. 当前分支包含

- `apps/zcode-cli/packages/kaying-taptap-daily-plugin`：collector、metrics、renderer、dynamic workflow、skill、command、测试、spec；
- `apps/kaying-taptap-daily-plugin/deploy`：Linux systemd/nginx/healthcheck/publish/import 部署包；
- `apps/kaying-taptap-proxy`：TapTap WAF 出口代理（Cloudflare Worker）；
- `docs/deploy/kayingcode-taptap-daily.md`：Linux 部署文档；
- `docs/features/workflow-runner-docker.md`：后续 Docker 多 workflow 运行平台计划。

---

## 3. 已验证

| 检查 | 结果 |
| --- | --- |
| plugin `typecheck` / `lint` / `test` | 通过，28/28 测试 |
| proxy `typecheck` / `lint` / `test` | 通过，9/9 测试 |
| 根 `typecheck` | 通过 |
| 根 `lint` | 0 error，存量 warning 与新增模块无关 |
| `source:check` | 通过 |
| `architecture:check --changed` | 0 violations |
| `public:snapshot:check` | 通过 |

---

## 4. 已知限制

### 4.1 官方插件注册会阻断 Desktop/远端发布打包

- `config/official-plugins.json` 的 `requiredSeedPaths` 包含 `workflows/taptap-daily.dwf.ts`；
- Desktop 的 `prepare-agent-node-bundle.mjs` staging 白名单不含 `workflows`，复制后会因 requiredSeedPaths 缺失抛错；
- 远端 `prepare-prebuilds.mjs` 白名单同样不含 `workflows`，会静默缺失。

**因此：不要从本分支构建或发布 Desktop/远端发行包。**

### 4.2 Desktop 市场 listing 与实际能力不匹配

插件注册了官方市场 listing，但 Desktop 没有 seed `workflows/` 和 `tools/taptap-daily/` 的机制。用户在 Desktop 启用插件后，skill 调用的 `CreateWorkflow(saved: taptap-daily)` 会找不到 workflow。

### 4.3 CI 未覆盖新增包

根 `typecheck` 不包含 plugin/proxy；根 `lint` 忽略 `apps/zcode-cli/packages/*-plugin`；`source-checks` 不运行这两个包的测试、typecheck、lint。

### 4.4 缺少完整 E2E 记录

单元测试覆盖了 collector/metrics/renderer，但还没有一次带真实 TapTap、真实模型、完整 workflow、validate/publish 的运行记录。

### 4.5 与 main 的差异

本分支基于较早的 main；`origin/main` 已包含 0.2.1 发布提交。合并模拟只出现 `SOURCE_PACKAGES.md` 一个生成文件冲突，重新执行 `pnpm run source:map` 即可。

---

## 5. 分支维护约定

1. 定期同步 main：
   ```sh
   git fetch origin
   git rebase origin/main
   pnpm run source:map
   ```
2. 文档变更只在本分支提交，不同步到 main；
3. 不在本分支打 `kaying-code-v*` 标签；
4. 新增 workflow/插件能力时，同步更新：
   - `apps/zcode-cli/packages/kaying-taptap-daily-plugin/spec/`
   - `docs/deploy/kayingcode-taptap-daily.md`
   - `docs/features/`
5. 保持工作区干净；临时构建产物（`dist/`、`dist-deploy/`、`bundled-agents/`）不入库。

---

## 6. 合并回 main 的前置条件

满足以下条件后，再开合并 PR：

- [ ] 移除官方插件注册，或补齐 Desktop/远端 `workflows`、`spec` 白名单与复制后校验；
- [ ] 若保留官方市场 listing，为 Desktop 实现 workflow/tools seed，或在 listing 中明确 server-only；
- [ ] 在 CI 中增加 plugin/proxy 的 typecheck、lint、test；
- [ ] 在 staging 完成一次真实日报 E2E，记录 `run.json`、报告路径和 publish 结果；
- [ ] rebase `origin/main`，重新生成 `SOURCE_PACKAGES.md`；
- [ ] 重新执行 `pnpm run verify:pre-push`；
- [ ] 确认本分支文档已同步到合并 PR。

---

## 7. 后续方向

- 短期：本分支继续维护日报插件和 Linux 服务；
- 中期：按 `docs/features/workflow-runner-docker.md` 评估 Docker 多 workflow 运行平台；
- 长期：若 Docker 平台落地，Linux systemd/nginx 包装层可作为过渡方案保留或替换，不重复建设。
