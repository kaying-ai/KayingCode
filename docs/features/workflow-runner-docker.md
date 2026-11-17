# Docker 多 workflow 运行平台 MVP（workflow-runner）开发计划

> 说明：按仓库约定，根 `docs/` 主要存放部署文档，行为规范应落在所属应用或包的 `spec/`。本文是用户要求保存的 feature 计划；进入实现阶段后，权威规范以 `apps/kayingcode-workflow-runner/spec/` 为准。

| 项目 | 内容 |
| --- | --- |
| 状态 | Draft |
| 创建日期 | 2026-11-17 |
| 目标分支 | `feat/workflow-runner-docker` |
| 关联模块 | `apps/zcode-cli/packages/kaying-taptap-daily-plugin` |
| 关联部署 | `docs/deploy/kayingcode-taptap-daily.md` |
| 首个 job | `taptap-daily` |

---

## 1. 摘要

本 feature 把 Docker 从一个“单任务报告容器”升级为**多 workflow 运行平台**：

> 一个通用 `workflow-runner` 镜像 + `job.yaml` 作业注册表 + 宿主机调度器，支持多个 `.dwf.ts` workflow 按计划运行；新增 workflow 只加定义，不改镜像。

`taptap-daily` 是这个平台的**第一个 job**，不是部署架构本身。

核心原则：

1. **一个 runner 镜像，多个 job**：新增 workflow 主要是加定义，不是加镜像。
2. **一次运行一个 one-shot 容器**：隔离靠“每次运行一个容器”，不是“每个 workflow 一个长期容器”。
3. **调度留在宿主机**：不要在一个 runner 容器里塞 cron，否则要重新实现 `Persistent`、并发、重试、日志和资源控制。

---

## 2. 背景与问题

### 2.1 当前实现

现有 `taptap-daily` 是 Linux headless 单任务链路：

```text
systemd timer
  └─ kaying-bot-taptap-daily.service
       └─ run-report.sh
            └─ kayingcode --workflow-mode alwaysOn --mode build -p "..."
                 └─ CreateWorkflow(saved: taptap-daily)
                      ├─ collector
                      ├─ metrics
                      ├─ subagents / verifiers / writer
                      └─ renderer
            └─ validate-run.mjs
            └─ publish-report.mjs
```

问题：

- 只服务一个 workflow；
- 新增 workflow 需要复制 systemd unit、脚本、目录和监控；
- Docker 化如果按“每个 workflow 一个容器/镜像”组织，版本、配置和升级会迅速失控；
- Desktop 自动化不能承担无人值守：`CreateWorkflow` 必须人工确认，且定时器依赖窗口 Host。

### 2.2 目标平台形态

```text
宿主机调度器（systemd / launchd）
  └─ docker compose run --rm runner --job <name>
       └─ workflow-runner
            ├─ 读取 jobs/<name>/job.yaml
            ├─ 准备 workspace / 插件 / 密钥
            ├─ 执行 kayingcode -p
            ├─ 执行 postRun hooks
            └─ 写 run.json / status.json
```

Docker 的定位是**运行时和隔离边界**，不是调度器。

---

## 3. 目标与非目标

### 3.1 目标

| 编号 | 目标 | 验收方式 |
| --- | --- | --- |
| G1 | 一个镜像运行多个 workflow | 同时注册并运行 `taptap-daily` 和第二个示例 job |
| G2 | 新增 workflow 不改镜像 | 只加 `jobs/<name>/` 和 schedule，容器直接运行 |
| G3 | 每个 job 独立 workspace / 插件 / secret / 超时 / 重试 | 两个 job 并行运行互不覆盖 |
| G4 | 统一的运行记录、健康检查和告警 | `run.json`、`status.json`、失败告警 |
| G5 | Linux systemd 和 mac mini launchd 都能触发 | 同一 job 定义生成两种调度单元 |
| G6 | 保留 headless CLI 语义 | `CreateWorkflow` 自动放行，其余工具 deny |
| G7 | 首个真实 job 是 `taptap-daily` | 生成完整日报并通过现有 validate/publish |

### 3.2 非目标（MVP 不做）

- Desktop UI / 手机端管理界面；
- workflow 之间的 DAG 依赖（A 完成再跑 B）；
- 多机调度、Kubernetes、自动扩缩容；
- Ofelia / 中央 scheduler 容器；
- 每个 workflow 独立镜像；
- 重写 dynamic workflow 引擎；
- 自动插件市场安装；
- 跨 workflow 的共享上下文或缓存。

### 3.3 MVP 切分

MVP 必须包含：

- 通用 runner；
- `job.yaml` 契约；
- `taptap-daily` 第一个 job；
- Linux systemd 调度；
- Docker 镜像与 Compose；
- 运行记录与健康检查；
- 第二个示例 job（证明扩展性）。

MVP 可以延后：

- macOS launchd 生成器（若目标环境优先 Linux）；
- `runner prune` 自动保留；
- 内容型插件热挂载；
- 全局并发信号量；
- Web 状态面板。

---

## 4. 关键设计决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 部署单元 | 一个通用 runner 镜像 | 避免每加 workflow 加镜像/服务 |
| 运行单元 | 每次运行一个 one-shot 容器 | 隔离、资源释放、失败不互相影响 |
| 调度 | 宿主机 systemd / launchd | 保留 `Persistent`、补跑、日志、cgroup |
| 作业定义 | 只读挂载 `jobs/<name>/job.yaml` | 加 workflow 不改镜像 |
| 状态 | `/srv/kaying-workflows/<name>/` bind mount | 数据/报告/历史持久化 |
| CLI 存储 | per-job named volume `HOME` | SQLite 不放 macOS bind mount |
| CLI 产物 | Node bundle `kayingcode.cjs`，不用 SEA | SEA 资产白名单会裁掉 `workflows/` |
| 插件 | 镜像内置 plugin pack，job 按需启用 | 避免全局插件污染 |
| 安全 | 非 root、只读根文件系统、无 Docker socket | headless 自动批准工作流，需要容器边界 |
| 工作流完整性 | `workflow.sha256` 可选校验 | 工作流是受信任代码 |
| 失败处理 | 退出码 + `run.json` + health 聚合 | 调度层和告警可区分处理 |
| 幂等 | 按 job 定义 key + 成功状态 | 同日重跑默认跳过，`--force` 覆盖 |
| 代码结构 | 功能目录 + 窄合同，不套 `domain/app/adapters` 四层 | 与 `zcode-server-cli` / `kaying-taptap-daily-plugin` 风格一致 |

---

## 5. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│ 调度层：宿主机 systemd / launchd                            │
│ 每个 job 一条 schedule，负责触发一次 one-shot 运行           │
└───────────────────────────┬─────────────────────────────────┘
                            │ docker compose run --rm runner --job <name>
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 执行层：一个通用 workflow-runner 镜像                        │
│ Node 24 + kayingcode CLI + bundled-skills + plugin pack      │
│ runner：读 job.yaml、准备 workspace、跑 CLI、执行 hooks      │
└───────────────────────────┬─────────────────────────────────┘
                            │ 读取定义
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ /opt/kaying-workflows/jobs/<name>/          （定义，只读）   │
│   job.yaml                                                   │
│   workflow.dwf.ts                                            │
│   tools/  hooks/  prompts/                                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ 挂载状态
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ /srv/kaying-workflows/<name>/               （状态，持久化） │
│   data/  reports/  runs/  .kayingcode/                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ web 容器：统一报告站，只暴露各 job 的 reports                │
│ health 聚合：扫描所有 run.json，做跨 job 告警                │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 仓库落点与包结构

新增可部署应用：

```text
apps/kayingcode-workflow-runner/
  package.json
  tsconfig.json
  README.md
  CONTRACT.md
  Dockerfile
  compose.yaml

  src/
    main.ts                     # bin 入口：解析 argv、设置退出码
    cli.ts                      # 子命令分发
    commands/
      run.ts
      doctor.ts
      health.ts
      schedule.ts
      prune.ts
      listJobs.ts

    job/
      jobSchema.ts              # Zod 作业契约 + 解析类型
      jobLoader.ts              # YAML → JobDefinition
      jobContext.ts             # 日期/时区/模板变量
      promptBuilder.ts          # 默认 prompt / job 覆盖

    runner/
      runJob.ts                 # 单次运行编排
      doctor.ts                 # 环境/契约诊断
      workspaceSeeder.ts        # workflow/tools 种子
      cliConfig.ts              # per-job CLI 配置与插件启用
      processRunner.ts          # kayingcode 子进程、超时、重试
      hookRunner.ts             # postRun hook
      runRecord.ts              # run.json / status.json
      idempotency.ts            # 幂等判定
      fileLock.ts               # per-job 锁
      outputChecker.ts          # outputs.require 校验

    schedule/
      cron.ts                   # 5 段 cron 校验
      systemdRenderer.ts
      launchdRenderer.ts
      syncSchedules.ts

    health/
      healthReport.ts           # 跨 job 健康扫描
      pruneRuns.ts              # 保留清理

    lib/
      args.ts
      clock.ts
      date.ts
      env.ts
      errors.ts                 # RunnerError + 退出码
      logger.ts
      paths.ts

    types.ts                    # 内部共享类型
    contract.ts                 # 唯一公开入口：类型/端口/错误码
    contract.example.ts
    module.ts
    index.ts                    # re-export contract

  test/
    jobSchema.test.ts
    jobLoader.test.ts
    runJob.test.ts
    processRunner.test.ts
    schedule.test.ts
    health.test.ts
    fixtures/

  scripts/
    build.mjs                   # esbuild → dist/main.mjs

  spec/
    product.md
    job-schema.md
    operations.md
    security.md

  deploy/
    systemd/
      workflow-runner@.service
      workflow-runner@.timer.example
    launchd/
      com.kayingcode.workflow.plist.example
    caddy/
      Caddyfile.example

  jobs/
    taptap-daily/
      job.yaml
      hooks/
        validate-and-publish.mjs
    example-daily/
      job.yaml
      workflow.dwf.ts

  schemas/
    job.schema.json             # 由 jobSchema 生成
```

包名：`@kayingcode/workflow-runner`（private）。

文件命名沿用最接近的两个应用：

- `packages/zcode-server-cli`：多词文件名用 camelCase，目录用 lowercase 单词；
- `apps/zcode-cli/packages/kaying-taptap-daily-plugin`：按流水线阶段分目录（`collector` / `metrics` / `renderer`），公共小工具放 `lib/`，共享类型放 `types.ts`。

因此 runner 不采用 `domain/app/adapters` 的 DDD 分层，而采用：

```text
commands → runner/job/schedule/health → lib
```

`job/` 负责“作业定义怎么读”，`runner/` 负责“一次运行怎么做”，`schedule/` 负责“怎么生成调度”，`health/` 负责“怎么观测和清理”。这与项目的功能目录风格一致。

### 6.1 需要同步的仓库登记

- `architecture-policy.yaml` 注册 `workflow-runner` 模块；
- `apps/README.md` 增加条目；
- `pnpm run source:map` 更新 `SOURCE_PACKAGES.md`；
- 根 `typecheck` 脚本加入：
  ```sh
  pnpm --filter @kayingcode/workflow-runner run typecheck
  ```
- `docs/deploy/kayingcode-workflow-runner.md`；
- `docs/deploy/kayingcode-taptap-daily.md` 增加 Docker 多 workflow 入口；
- CI 增加 runner 单测 + Docker smoke；
- `pnpm-lock.yaml` 更新。

### 6.2 架构模块登记示例

```yaml
- id: workflow-runner
  roots: [apps/kayingcode-workflow-runner/src]
  managed: true
  requires: []
  publicEntrypoints: [apps/kayingcode-workflow-runner/src/contract.ts]
  owner: workflow-automation
```

这里刻意**不声明 `layers`**。原因是：

- `domain/app/adapters` 是 `packages/services/storage`、`packages/services/gen-ui` 这类“有状态、多个外部适配器”的 managed module 形态；
- runner 是独立可部署应用，结构更接近 `packages/zcode-server-cli`（`runtime/`、`platform/`、`server-core/`）和 `kaying-taptap-daily-plugin`（`collector/`、`metrics/`、`renderer/`）；
- `contract.ts` / `module.ts` / `contract.example.ts` / `CONTRACT.md` 保留为治理入口，但实现按功能目录组织，不强行套四层。

依赖方向仍然明确：

```text
commands → runner/job/schedule/health → lib
```

禁止反向导入；跨模块只允许 import `contract.ts`；`typecheck`、`architecture:check`、`max-lines` 仍然生效。

### 6.3 代码结构维护规则

#### 文件职责

| 目录/文件 | 单一职责 |
| --- | --- |
| `commands/*` | 解析子命令参数，调用对应用例，格式化输出 |
| `job/jobSchema.ts` | 作业契约与校验 |
| `job/jobLoader.ts` | YAML 读取、路径校验、schema 解析 |
| `job/jobContext.ts` | 日期、时区、模板变量 |
| `job/promptBuilder.ts` | 生成 `CreateWorkflow` prompt |
| `runner/runJob.ts` | 单次运行编排，不直接做 IO |
| `runner/doctor.ts` | 环境、插件、provider、路径、workflow hash 诊断 |
| `runner/workspaceSeeder.ts` | 唯一写 workspace 种子文件的地方 |
| `runner/cliConfig.ts` | 唯一写 per-job CLI 配置的地方 |
| `runner/processRunner.ts` | 唯一 spawn `kayingcode` 的地方 |
| `runner/hookRunner.ts` | 唯一执行 postRun hook 的地方 |
| `runner/runRecord.ts` | 唯一写 `run.json` / `status.json` 的地方 |
| `runner/fileLock.ts` | 唯一写锁的地方 |
| `schedule/*Renderer.ts` | 纯渲染 systemd/launchd 文本 |
| `health/healthReport.ts` | 只读 `run.json` 聚合健康状态 |
| `lib/*` | 无业务状态的小工具 |

#### 状态所有权

| 状态 | 所有者 | 写入路径 |
| --- | --- | --- |
| `job.yaml` / workflow / tools | job 定义（只读） | runner 只读 |
| workspace 种子文件 | runner | `workspaceSeeder` |
| per-job CLI config | runner | `cliConfig` |
| per-job 锁 | runner | `fileLock` |
| `run.json` / `status.json` | runner | `runRecord` |
| CLI session / workflow journal | `kayingcode` | runner 不写，只读 `stream-json` 和产物 |
| 调度状态 | systemd / launchd | runner 只生成配置 |
| 模型/密钥 | 镜像 + secret 挂载 | runner 只读取并组装 |

#### 扩展点

| 变更 | 落点 | 是否改 runner 代码 |
| --- | --- | --- |
| 新增 workflow | `jobs/<name>/job.yaml` + workflow 文件 | 否 |
| 新增确定性脚本 | `jobs/<name>/tools/` | 否 |
| 新增校验/发布 | `jobs/<name>/hooks/` | 否 |
| 新增输出要求 | `job.yaml` 的 `outputs.require` | 否 |
| 新增内容型插件 | plugin pack / 只读挂载 + `plugins` 列表 | 通常否 |
| 新增原生/MCP 插件 | plugin pack + 镜像 | 是（镜像） |
| 新增调度后端 | `schedule/*Renderer.ts` | 是，局限在 renderer |
| 新增命令/参数 | `commands/*` + 对应用例 | 是，局限在入口 |
| 修改 job schema | `job/jobSchema.ts` + spec + fixtures | 是，版本化管理 |

#### 防止腐化的硬规则

1. runner 不感知具体 workflow 名称，只看 `job.yaml`；
2. workflow 专属逻辑只能放 `jobs/<name>/hooks` 或 `tools`；
3. 不内建 cron；调度永远是宿主机 systemd/launchd；
4. 不维护第二份运行状态；`run.json` 是唯一运行事实；
5. 不把 CLI journal 复制进 runner，只解析需要的字段；
6. 不共享 job workspace，每个 job 独立目录；
7. 默认 `mode=build`，`yolo` 必须由 job 显式声明并评审；
8. secret 不进镜像、不进 `job.yaml`、不进 `run.json`、不进日志；
9. 新增 job 不需要改 runner 代码；做不到先修抽象；
10. 单文件超过 400 行先拆分，不用 lint disable 绕过。

#### 健康指标

- 新增 job 的代码改动 = 0；
- `architecture:check --changed` 新增违规 = 0；
- 单文件 >400 行 = 0；
- `contract.ts` >300 行 = 0；
- 循环依赖 = 0；
- 每个 job 的 `run.json` 成功率、最近成功年龄、平均耗时可由 `health` 聚合。

---

## 7. 作业契约：`job.yaml`

MVP 只支持 `kind: WorkflowJob`。

```yaml
apiVersion: kayingcode.workflow/v1
kind: WorkflowJob

metadata:
  name: taptap-daily

spec:
  schedule:
    cron: "0 9 * * *"
    timezone: Asia/Shanghai
    catchUp: true
    jitterSeconds: 0

  workflow:
    source: plugin            # plugin | file
    plugin: kaying-taptap-daily
    name: taptap-daily
    # source: file 时改用：
    # file: ./workflow.dwf.ts
    sha256: "<可选>"
    args:
      date: "${REPORT_DATE}"
      source: http
      calendarDays: 30
      maxNewGames: 6
      maxTracks: 8
    maxConcurrency: 5
    subagentModel: opencode-go-chat/deepseek-v4.1-flash

  runtime:
    mode: build
    timeoutMinutes: 60
    retries: 1
    retryDelaySeconds: 30

  workspace:
    path: /srv/kaying-workflows/taptap-daily
    seed:
      # workflow 由 workflow.source 自动种入，这里只放额外工具。
      # fromPlugin 从镜像内插件包读取，避免与插件源重复维护。
      - fromPlugin: kaying-taptap-daily
        source: dist
        to: tools/taptap-daily

  plugins:
    - kaying-taptap-daily@kayingcode-plugins-official

  env:
    file: /srv/kaying-secrets/taptap-daily.env

  hooks:
    postRun: ./hooks/validate-and-publish.mjs

  outputs:
    require:
      - reports/${REPORT_DATE}/report.json
      - reports/${REPORT_DATE}/report.html
      - reports/${REPORT_DATE}/report.md
      - reports/index.html
    reportsRoot: /srv/kaying-workflows/taptap-daily/reports
    publicBaseUrl: https://reports.example.com/taptap-daily
```

### 7.1 关键约束

- 未知字段拒绝（Zod `.strict()`），避免拼写错误静默生效；
- `metadata.name` 必须与目录名一致；
- `workflow.source` 只能是 `plugin` 或 `file`：
  - `plugin`：从镜像内插件的 `workflows/` 读取，插件是 workflow 的唯一来源；
  - `file`：从 job 目录读取，job 目录是 workflow 的唯一来源；
  - 两者只能选一个，避免同一 workflow 出现两份定义；
- `workspace.seed` 支持 `from`（job 目录）和 `fromPlugin`（镜像内插件包）；
  - 插件自带的 workflow/tools 用 `fromPlugin`，不要在 job 目录再放一份；
  - 独立 workflow 的 tools 用 `from`，由 job 目录负责版本；
- 路径必须限制在 `jobDir` / `workspace` 内，禁止 `../` 穿越；
- `args` 值支持 `${REPORT_DATE}`、`${RUN_DATE}`、`${JOB_NAME}` 等有限变量；
- 不允许在 `job.yaml` 里写 secret；
- `workflow.sha256` 如果提供，runner 启动前校验；
- `plugins` 只允许启用镜像/挂载插件包中存在的插件；
- `runtime.mode` 默认 `build`，可选 `build` / `edit` / `plan` / `yolo`，但默认值必须是 `build`；
- `outputs.require` 支持有限变量，不支持通配符递归扫描。

### 7.2 模板变量

| 变量 | 含义 |
| --- | --- |
| `${JOB_NAME}` | job 名称 |
| `${REPORT_DATE}` | 报告日期，Asia/Shanghai |
| `${RUN_DATE}` | 运行日期 |
| `${RUN_ID}` | 本次运行 ID |
| `${WORKSPACE}` | job workspace 绝对路径 |
| `${RUN_DIR}` | 本次运行日志目录 |
| `${MAX_CONCURRENCY}` | workflow 并发上限 |
| `${SUBAGENT_MODEL}` | 子代理模型 |

变量只做字符串替换，不做 shell 求值。

---

## 8. Runner 执行流程

```text
runner run --job taptap-daily [--date YYYY-MM-DD] [--force]
  │
  ├─ 1. 加载并校验 job.yaml
  ├─ 2. 计算上下文：REPORT_DATE / RUN_ID / WORKSPACE / RUN_DIR
  ├─ 3. 获取 per-job 锁（flock），重入则 skipped
  ├─ 4. 幂等检查：同日成功记录存在且未 --force → skipped
  ├─ 5. 种子工作区：
  │      workflow → .kayingcode/workflows/
  │      tools/   → tools/taptap-daily/
  │      校验 sha256、记录 seed 哈希
  ├─ 6. 生成 per-job CLI 配置：
  │      HOME=/data/jobs/<job>
  │      plugins.enabledPlugins = job.plugins
  │      provider config 从 env 注入
  ├─ 7. 构建 prompt（默认模板 / job 覆盖）
  ├─ 8. 执行 kayingcode：
  │      --workflow-mode alwaysOn
  │      --mode build
  │      --output-format stream-json
  │      -p "<prompt>"
  │      cwd = workspace
  │      timeout + retry
  ├─ 9. 保存 stream.jsonl / stderr.log
  ├─ 10. 执行 postRun hook（validate/publish）
  ├─ 11. 校验 outputs.require
  ├─ 12. 写 runs/<runId>/run.json + status.json
  └─ 13. 退出码
```

### 8.1 命令面

```text
runner run --job <name> [--date YYYY-MM-DD] [--force] [--dry-run] [--json]
runner list-jobs [--json]
runner doctor [--job <name>] [--json]
runner health [--state-dir <path>] [--max-age-hours 26] [--json]
runner prune [--state-dir <path>] [--raw-days 90] [--report-days 365] [--run-days 90]
runner sync-schedules --platform systemd|launchd [--job <name>] [--dry-run]
```

### 8.2 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功，或被幂等/锁跳过 |
| 2 | 配置/契约错误 |
| 3 | 锁被占用（skipped） |
| 4 | workflow 执行失败 |
| 5 | 产物校验失败 |
| 6 | 超时 |
| 7 | postRun hook 失败 |
| 8 | 内部错误 |

### 8.3 运行记录

`runs/<runId>/run.json`：

```json
{
  "schemaVersion": 1,
  "job": "taptap-daily",
  "workflow": "taptap-daily",
  "runId": "2026-11-17T01-00-00-abc123",
  "reportDate": "2026-11-17",
  "startedAt": "2026-11-17T01:00:00.000Z",
  "finishedAt": "2026-11-17T01:18:20.000Z",
  "durationMs": 1100000,
  "status": "success",
  "exitCode": 0,
  "attempts": 1,
  "workflowRunId": "dwfrun-...",
  "warnings": [],
  "artifacts": {},
  "error": null
}
```

同时写：

- `runs/<runId>/stream.jsonl`；
- `runs/<runId>/stderr.log`；
- `<workspace>/status.json`（该 job 最近一次运行摘要）。

### 8.4 幂等语义

- `spec.idempotency.key` 默认 `reportDate`；
- `spec.idempotency.successStatuses` 默认 `["success", "degraded"]`；
- 同一 key 已有成功记录且未 `--force` → 退出 0，状态 `skipped`；
- 状态写入 `run.json`，不能只靠产物文件存在判断；
- `--force` 覆盖，但仍受 per-job 锁保护。

### 8.5 清理与失败

- 每次运行使用独立 `runId` 目录；
- 失败不删除旧的成功产物；
- 重试默认在同一 workspace 重跑，要求 workflow 幂等；
- 对非幂等 workflow，`job.yaml` 可设置 `workflow.staging: true`，runner 在临时目录运行，成功后 promote；
- 超时后先 SIGTERM，宽限期后 SIGKILL 整个进程组。

---

## 9. 调度层设计

### 9.1 Linux：systemd 模板 unit

```ini
# /etc/systemd/system/workflow-runner@.service
[Unit]
Description=KayingCode workflow %i
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/kaying-workflows
ExecStart=/usr/bin/docker compose run --rm runner --job %i
TimeoutStartSec=2h
```

```ini
# /etc/systemd/system/workflow-runner@taptap-daily.timer
[Unit]
Description=Run taptap-daily

[Timer]
OnCalendar=*-*-* 09:00:00 Asia/Shanghai
Persistent=true

[Install]
WantedBy=timers.target
```

生成：

```sh
runner sync-schedules --platform systemd --jobs-dir /opt/kaying-workflows/jobs
systemctl daemon-reload
systemctl enable --now workflow-runner@taptap-daily.timer
```

新增 job：

```sh
runner sync-schedules --platform systemd --job <name>
systemctl daemon-reload
systemctl enable --now workflow-runner@<name>.timer
```

### 9.2 macOS：launchd

同一套 `job.yaml` 生成 LaunchAgent：

```text
~/Library/LaunchAgents/com.kayingcode.workflow.<job>.plist
  ProgramArguments: docker compose run --rm runner --job <job>
  StartCalendarInterval: Hour / Minute
  StandardOutPath / StandardErrorPath
```

mac mini 额外要求：

- Docker Desktop / Colima / OrbStack 开机自启；
- `pmset` 禁止空闲休眠；
- 自动登录；
- `HOME`/SQLite 使用 named volume，不放 bind mount；
- 验证 launchd 在睡眠唤醒后是否补跑；如果不补，增加每小时 reconcile job。

### 9.3 是否需要 Ofelia

MVP 不用。Ofelia 适合“一个 compose 自包含”的场景，但：

- 需要 `/var/run/docker.sock`，等于把宿主机 root 权限交给调度容器；
- 补跑语义弱于 systemd `Persistent=true`；
- 多一层需要维护的组件。

如果目标主机是专用 bot 机器，可以接受；共享机器建议宿主机 systemd/launchd。

### 9.4 调度策略

- 默认每个 job 一条 schedule；
- 同一时刻多个 job 时，用 `jitterSeconds` 或错开分钟，避免模型 provider 限流；
- `catchUp: true` 时，宿主机调度负责补跑；runner 不自己判断错过窗口；
- 每 job 一份 per-job 锁，避免补跑与下一次调度重叠；
- 全局并发上限后续再加信号量；MVP 依赖错峰和容器资源限制。

---

## 10. Docker 镜像与 Compose

### 10.1 镜像内容

```text
/opt/kayingcode/
  kayingcode.cjs
  provider/kayingcode-builtin.json
  packages/
    bundled-skills/
    kaying-taptap-daily-plugin/     # 完整插件树，含 workflows/spec
    <future-plugin>/
/usr/local/bin/runner
/opt/kaying-workflows/jobs/         # 只读挂载
```

### 10.2 为什么不用 SEA

SEA 的官方插件资产白名单不含 `workflows/`，而多 workflow 平台依赖 `workflows/` 目录。Node bundle + 文件系统插件目录可以直接读取完整插件树，包括 `workflows/`、`skills/`、`commands/`、`spec/`。

### 10.3 Dockerfile 策略

- Builder 阶段：安装 pnpm、构建 runner；
- CLI 产物：CI 下载/固定 `kayingcode` CLI release，或从仓库构建 `kayingcode.cjs` + `bundled-skills`；
- 插件包：CI 构建 `kaying-taptap-daily` 的 `dist-deploy`，复制完整 `plugin/` + `workflows/`；
- Runtime：`node:24.14-bookworm-slim` + `bash`、`ca-certificates`、`tzdata`、`util-linux`、`tini`；
- 非 root 用户 `runner`；
- `ENTRYPOINT ["/sbin/tini","--","/usr/local/bin/runner"]`；
- 多架构构建：`linux/amd64,linux/arm64`。

### 10.4 Compose 示例

```yaml
services:
  runner:
    image: ghcr.io/.../workflow-runner:0.1.0
    init: true
    user: "10001:10001"
    environment:
      TZ: Asia/Shanghai
      HOME: /data
    volumes:
      - ./jobs:/opt/kaying-workflows/jobs:ro
      - /srv/kaying-workflows:/srv/kaying-workflows
      - /srv/kaying-secrets:/srv/kaying-secrets:ro
      - runner-home:/data
    tmpfs: ["/tmp"]
    read_only: true
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
    restart: "no"

  web:
    image: caddy:2-alpine
    volumes:
      - /srv/kaying-workflows:/srv/kaying-workflows:ro
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    ports: ["127.0.0.1:8080:80"]
    restart: unless-stopped

volumes:
  runner-home:
```

### 10.5 镜像构建与发布

- 固定 base image digest；
- 固定 CLI release 版本和 SHA；
- 固定插件版本；
- 镜像 label 包含 `org.opencontainers.image.version`、`revision`；
- CI 构建并推送 GHCR（如果团队同意）；否则产出 artifact；
- 目标机只 pull，不在 mac mini 上从源码构建。

---

## 11. 插件、配置与密钥

### 11.1 Per-job CLI 配置

```yaml
environment:
  HOME: /data/jobs/<job>
  KAYINGCODE_PERSONAL_PROVIDER_CONFIG_FILE: /run/secrets/provider.json
```

`/data/jobs/<job>/.kayingcode/cli/config.json`：

```json
{
  "plugins": {
    "enabledPlugins": {
      "kaying-taptap-daily@kayingcode-plugins-official": true
    }
  }
}
```

- 每个 job 只启用自己需要的插件；
- 避免插件技能/命令互相污染；
- 初期插件少时可以共享 `HOME` + 超集插件，但要记录技术债。

### 11.2 插件包

- 内容型插件（skills/commands/workflows/dist JS）可以打进共享 plugin pack；
- 原生/MCP 插件需要对应二进制/依赖，建议打进镜像或单独 job 镜像；
- 后续可支持只读挂载 `/opt/kaying-workflows/plugins`，实现内容型插件不重建镜像。

### 11.3 密钥

- 共享：provider 配置、模型 key（只读挂载）；
- 每 job：TapTap 代理 token、飞书 webhook、业务 token（`/srv/kaying-secrets/<job>.env`，只读挂载）；
- 不要把 secret 写进 `job.yaml` 或镜像；
- `.env` 文件用严格 `KEY=VALUE` 解析，不执行 shell；
- 日志中不输出 secret。

### 11.4 模型配置

- `spec.workflow.subagentModel` 传给 `CreateWorkflow` 的 `subagent_model`；
- `spec.runtime.model` 可选，runner 写入 per-job CLI 配置的 `model.main`；
- 未设置时使用 provider 默认；
- `runner doctor` 检查 provider 配置和模型可用性。

---

## 12. 健康检查、运行记录与保留

### 12.1 聚合健康检查

```sh
runner health --state-dir /srv/kaying-workflows --max-age-hours 26 --json
```

扫描：

```text
/srv/kaying-workflows/<job>/runs/*/run.json
```

检查：

- 每个 job 最近一次运行状态/时间；
- 失败、超时、超过 26h 未成功；
- 报告文件缺失；
- 生成 `/srv/kaying-workflows/status.json`；
- 可选发送飞书/企业微信告警。

由宿主机 timer 每小时运行，或由 `health` 容器执行。

### 12.2 运行记录

- 每个 job 的 `runs/<runId>/run.json`；
- `stream.jsonl` / `stderr.log`；
- `status.json` 最近一次摘要；
- `run.json` 包含 `workflowRunId`，可与 `ListWorkflowRuns` 对齐。

### 12.3 保留

新增：

```sh
runner prune --state-dir /srv/kaying-workflows --raw-days 90 --report-days 365 --run-days 90
```

由宿主机每天/每周运行。当前 taptap 脚本没有实现保留，多 workflow 后必须补。

### 12.4 报告站

一个 `web` 容器（Caddy/nginx）服务所有 job 的 reports：

```text
/srv/kaying-workflows/taptap-daily/reports/...
/srv/kaying-workflows/another-workflow/reports/...
```

对外：

```text
https://reports.example.com/taptap-daily/
https://reports.example.com/another-workflow/
```

注意只暴露 `reports/`，不要暴露 `data/`、`raw/`、`runs/`。

---

## 13. 测试策略

| 类型 | 内容 |
| --- | --- |
| 单元 | schema、context、prompt、seed、config、lock、idempotency、run record、schedule 生成、health |
| 集成 | fake `kayingcode`：成功、非零退出、超时、重试、缺失产物、hook 失败 |
| Docker smoke | 构建镜像、`list-jobs`、`doctor`、`run --dry-run`、mock job |
| 契约 | `job.yaml` fixtures、JSON schema、退出码 |
| 真实 E2E | staging 环境跑 `taptap-daily`，验证报告、validate、publish |
| Soak | 7 天，覆盖调度/网络/模型/磁盘/重启 |
| 静态 | `pnpm run typecheck`、`pnpm run lint`、`pnpm run architecture:check --changed`、`pnpm run source:check` |

### 13.1 必测场景

1. 合法/非法 `job.yaml`；
2. 同日重复运行跳过；
3. `--force` 覆盖；
4. 两个并发运行只允许一个；
5. `kayingcode` 非零退出 → 重试；
6. 超时 → SIGTERM/SIGKILL → 状态 `timeout`；
7. 产物缺失 → `failed`；
8. postRun hook 失败 → 状态/hook 错误；
9. 插件未启用 → `doctor` 报错；
10. provider 配置缺失 → `doctor` 报错；
11. 路径穿越 → 拒绝；
12. 工作流 hash 不匹配 → 拒绝；
13. 新增 job 不改镜像；
14. health 能发现 stale/failed；
15. 报告站只暴露 reports。

---

## 14. 分阶段开发计划

| 阶段 | 内容 | 人日 | 产出/验收 |
| --- | --- | --- | --- |
| P0 | Spec + 包骨架 + 架构登记 | 2 | spec 可评审；`typecheck`/`source:check` 通过 |
| P1 | Job schema + 注册表 + fixtures | 2 | 合法/非法 `job.yaml` 全部覆盖；错误信息带路径 |
| P2 | Runner core：锁/幂等/seed/config/prompt/执行/run record | 4 | fake CLI 集成测试通过；超时/重试/失败路径覆盖 |
| P3 | Dockerfile + compose + CLI/plugin 打包 | 4 | 镜像可构建；`runner doctor` 通过；容器内可跑 dry-run |
| P4 | systemd/launchd 生成 + web + health | 3 | 两个 job 的调度单元生成并通过 `systemd-analyze verify` |
| P5 | 第二个示例 workflow + 隔离/并发/安全加固 | 3 | 不改镜像新增 job 并成功运行 |
| P6 | 7 天 soak + 文档 + 回滚手册 | 1 周观察 | 验收清单全绿；可回滚 |

总计约 **18–20 人日 + 1 周观察**。

### P0：Spec 与骨架

- 从 `origin/main` 开分支 `feat/workflow-runner-docker`；
- 写 `spec/product.md`、`job-schema.md`、`operations.md`、`security.md`；
- 创建 package、tsconfig、测试入口；
- 注册 `architecture-policy.yaml`；
- 更新 `apps/README.md`、`SOURCE_PACKAGES.md`、根 `typecheck`；
- 验收：`pnpm run source:check && pnpm --filter @kayingcode/workflow-runner run typecheck`。

### P1：Job schema

- Zod schema + YAML loader；
- `runner list-jobs --json`；
- fixtures：合法、缺字段、未知字段、路径穿越、非法 cron、非法插件名；
- 生成 `schemas/job.schema.json`；
- 验收：错误信息包含文件名和字段路径；未知字段拒绝。

### P2：Runner core

- 上下文/日期/时区/模板变量；
- per-job lock；
- 幂等检查；
- workspace seed（哈希标记、原子写、路径校验）；
- per-job CLI config/插件启用；
- prompt builder；
- 子进程执行、超时、重试、日志、stream-json 解析；
- postRun hooks；
- `run.json`/`status.json`；
- `runner doctor`；
- 验收：fake `kayingcode` 集成测试覆盖成功/失败/超时/重试/锁/幂等。

### P3：Docker

- Dockerfile + entrypoint + tini；
- CLI bundle + bundled-skills + plugin pack；
- compose + volumes + secrets；
- `runner doctor` 在容器内通过；
- Docker smoke test；
- 验收：`docker compose run --rm runner list-jobs`、`run --dry-run`、staging 真实跑一次。

### P4：调度与运维

- systemd 模板 unit + timer 生成；
- launchd plist 生成；
- Caddyfile 生成；
- `runner health` + `runner prune`；
- 验收：两个 job 的 timer 触发；health 能发现 stale/failed；报告站可访问。

### P5：第二个 workflow

- 选一个轻量 workflow（单 subagent 或纯确定性），放 `jobs/example-daily/`；
- 验证不改镜像新增 job；
- 验证 per-job 插件隔离、并发、jitter；
- 验收：两个 job 同一天运行互不覆盖。

### P6：Soak

- 7 天连续运行；
- 模拟睡眠/重启、错过窗口、网络/WAF、模型 429、超时、容器 kill、磁盘满；
- 验证告警、补跑、幂等、日志、回滚；
- 输出 runbook。

---

## 15. 迁移与上线

### 15.1 从现有 Linux systemd 迁移

1. 保留现有目录作为对照；
2. 新建 `/srv/kaying-workflows/taptap-daily`；
3. 复制 `data/`、`reports/`、`runs/` 历史；
4. 用 runner 跑一次补跑验证：
   ```sh
   docker compose run --rm runner run --job taptap-daily --date 2026-11-16 --force
   ```
5. 对比新旧报告的数字和结构；
6. 停用旧 systemd timer；
7. 启用新 systemd timer；
8. 保留 3 天回滚窗口：重新启用旧 timer 即可。

### 15.2 回滚

- 镜像回滚：切回上一个 image digest；
- 调度回滚：启用旧 systemd timer；
- 数据不动；`run-report.sh` 的产物格式与 runner 一致。

### 15.3 数据备份

- `/srv/kaying-workflows`：数据、报告、运行记录；
- `/data`（named volume）：per-job HOME、SQLite、缓存；
- `/srv/kaying-secrets`：密钥；
- 恢复后先跑 `runner doctor`，再补跑最近一天。

---

## 16. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| CLI 产物/资产不完整 | 用 Node bundle；`runner doctor` 检查 `bundled-skills`、插件、workflow、provider |
| 插件/workflow 打包缺失 | job registry 自带 workflow；镜像内置完整插件树；不依赖 SEA 白名单 |
| 多 job 插件冲突 | per-job `HOME` + `plugins.enabledPlugins` |
| macOS SQLite 放 bind mount | `HOME` 用 named volume；workspace 用 bind mount |
| 自动批准工作流的安全风险 | 工作流只读、sha256 校验、容器隔离、无 Docker socket |
| 多 job 同时打模型限流 | `jitterSeconds`、错开分钟、`maxConcurrency` |
| systemd/launchd 补跑语义差异 | systemd `Persistent=true`；launchd 验证唤醒行为，必要时加 reconcile job |
| Docker Desktop 24/7 不稳定 | mac mini 优先 Colima/OrbStack；或 native launchd + CLI |
| 镜像构建慢 | CI 构建，目标机只 pull；固定 CLI/plugin 版本 |
| 磁盘增长 | `runner prune` + 中央清理 timer |
| secret 泄漏 | 只读挂载、strict `.env` 解析、不写日志、不写镜像 |
| 现有分支改动混入 | 新分支从 `origin/main` 开；taptap-daily 合并后再接入 |

---

## 17. PR 拆分

建议拆成 5 个 PR，避免一次评审过大：

1. **PR1**：spec + 包骨架 + 架构登记 + job schema + tests；
2. **PR2**：runner core + fake CLI 集成测试；
3. **PR3**：Dockerfile/compose + 镜像 smoke + taptap-daily job；
4. **PR4**：systemd/launchd 生成 + web + health/prune + 部署文档；
5. **PR5**：第二个示例 workflow + 硬化 + soak 结果。

每个 PR 都要：

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run architecture:check --changed`
- `pnpm run source:check`
- 对应测试

---

## 18. Definition of Done

- [ ] Spec 和部署文档合并；
- [ ] `docker compose run --rm runner run --job taptap-daily` 生成完整日报；
- [ ] 新增 `example-daily` job 不需要改镜像即可运行；
- [ ] 锁、幂等、超时、重试、失败退出码全部有测试；
- [ ] `run.json`/`status.json`/health 告警可用；
- [ ] systemd 和 launchd 都能从 `job.yaml` 生成；
- [ ] 非 root、只读根文件系统、无 Docker socket、secret 不落镜像；
- [ ] 7 天 soak 通过；
- [ ] 回滚手册验证过；
- [ ] `pnpm run typecheck`、`pnpm run lint`、`pnpm run verify:pre-push` 真实通过。

---

## 19. 待确认问题

1. **MVP 是否必须同时支持 mac mini launchd？**
   建议：systemd + launchd 都做，但 soak 只在 Linux；mac mini 做一次冒烟。
2. **CLI 产物来源**
   建议：固定 release 产物，避免镜像构建依赖整个仓库。
3. **镜像仓库**
   是否允许发布到 GHCR？如果不允许，先产出 CI artifact，由运维导入。
4. **第二个示例 workflow**
   选一个低成本、单 subagent 的 workflow 即可；不建议一开始接复杂业务。
5. **是否保留现有 `run-report.sh`**
   建议保留，作为 taptap-daily 的 hook 参考；通用部分迁到 runner。
6. **是否要把 `taptap-daily` 的部署 spec 改为“Docker runner 优先”**
   建议先并存，稳定后再改默认。

---

## 20. 参考

- `apps/zcode-cli/packages/kaying-taptap-daily-plugin/spec/daily-report.md`
- `apps/zcode-cli/packages/kaying-taptap-daily-plugin/spec/deployment.md`
- `apps/zcode-cli/packages/kaying-taptap-daily-plugin/deploy/run-report.sh`
- `apps/zcode-cli/packages/kaying-taptap-daily-plugin/deploy/validate-run.mjs`
- `apps/zcode-cli/packages/kaying-taptap-daily-plugin/deploy/publish-report.mjs`
- `apps/zcode-cli/packages/kaying-taptap-daily-plugin/deploy/healthcheck.sh`
- `docs/deploy/kayingcode-taptap-daily.md`
- `docs/deploy/kayingcode-cli.md`
- `apps/zcode-cli/packages/cli/src/headless-workflow.ts`
- `apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs`
- `architecture-policy.yaml`
