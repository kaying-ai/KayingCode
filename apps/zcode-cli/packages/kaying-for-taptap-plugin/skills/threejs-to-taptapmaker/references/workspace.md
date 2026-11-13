# 转写工作目录（workspace）规范

每个游戏一次转写 = 一个独立工作目录。所有取证产物、Maker 工程、阶段状态都收拢在这里，不再散落在各处。

## 目录结构

```text
convert_game_YYYYMMDDHHMMSS/      时间戳为北京时间（UTC+8），精确到秒
├─ project-info.json              项目信息：名称/地址/版本/路径/阶段状态/产物记录
├─ source/                        原版文件（t3m fetch 落这里）
│  ├─ game/                       门户地址是外壳时，真正游戏入口的第二跳抓这里（分析以它为准）
│  ├─ SOURCE_NOTES.md             已确认源码事实台账（file:line + 值/分支/资源）
│  └─ audit/                      control-flow/shaders/materials/models/animations/lighting/ui 审计
├─ dest/                          Maker 游戏工程（源码本地化后立刻在此创建空项目）
└─ verify/                        自检脚本与验证记录（可选：Lua/JS 对拍、绕序检查、像素统计）
```

时间戳精确到秒，同一秒内不会建两个目录（`t3m init` 遇到已存在目录会报错，让调用方等一秒重试）。

`t3m init` 会自动生成 `source/SOURCE_NOTES.md` 模板和 `source/audit/README.md`；`mark accept` 会对
缺失/空模板/没有 `file:line` 的 `SOURCE_NOTES.md`、缺失 `visual_fixes`、缺失 `gameplay_screenshot`
给出警告（Phase 2 为 warning，不阻断 accept）。

## 建目录

```bash
t3m init "<游戏地址>" [--name <项目名>] [--dir <父目录>]
```

- `--name` 不给时按 URL 尾段自动推导（小写、非字母数字转 `-`，如 `…/crate-keeper/` → `crate-keeper`）。
- 建好后：`source/` 跑 `t3m fetch`；**源码本地化一完成**就在 `dest/` 创建 TapTap
  空项目（不要等 analyze/九步铺完），KayingCode 中随后判定屏幕方向并打开右侧对比面板。
- **建工程入口（避免双 home）**：KayingCode 用内置 `kaying-for-taptap_ensure_project` / `kaying-for-taptap_init_project`
  创建或确保 `dest/.maker-mcp/config.json`；不要在 KayingCode 里调用系统 `taptap-maker init`/`login` 写入
  `~/.taptap-maker`。无官方插件的宿主才用 `taptap-maker init`。已绑定则只确认绑定文件存在。
- **原版参考源码只进 `source/`，不进 `dest/`，不提交进仓库**（替代旧的"放在项目目录之外"做法：现在统一放在工作目录的 `source/` 里）。

## 屏幕方向记录

方向由分析自动判定（竖屏可正常运行和交互时优先竖屏），不问用户；已写入 Maker 项目配置后不可改：

```bash
t3m note project-info.json orientation portrait   # 或 landscape
t3m note project-info.json orientation_reason "竖屏 viewport 下玩法完整、交互可达、HUD 不重叠"
```

## project-info.json

```jsonc
{
  "name": "crate-keeper", // 项目名（--name 或 URL 推导）
  "source_url": "https://…", // 原版游戏地址
  "work_dir": "convert_game_20260925213913",
  "created_at": "20260925213913", // = 目录时间戳
  "t3m_version": "0.2.6", // 建目录时的 t3m 版本
  "paths": { "info": "project-info.json", "source": "source", "dest": "dest" },
  "stages": {
    // 每完成一步就 mark
    "fetch": "pending",
    "analyze": "pending",
    "levels": "pending",
    "rules": "pending",
    "board": "pending",
    "character": "pending",
    "decoration": "pending",
    "ui": "pending",
    "audio": "pending",
    "accept": "pending",
  },
  "artifacts": {
    "source_preview_url": "https://…", // init 先记录输入；fetch 发现最终 game entry 后更新
  }, // 其他产物：key → 相对路径或稳定标识
  "notes": "",
}
```

## 源码证据台账（SOURCE_NOTES.md）

转写的“源码是规格，截图是线索”靠这个文件落地；不要只把结论留在对话或压缩摘要里。

```markdown
# SOURCE_NOTES

## 已确认事实

| 主题          | 证据                             | 结论                                                       | 验证方式                              |
| ------------- | -------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| 模型主路径    | `game.pretty.js:39186`, `:39514` | 默认走 `kart_<id>_r13a`；`?char=old` 才走 generic + driver | 读 `rb()`/`ab()` + 运行时 `__G.karts` |
| 标题相机      | `game.pretty.js:46513`           | 6.3 m、smoothstep 9 s、fov 40 + 竖屏修正                   | 运行时相机坐标/截图同相位             |
| 自定义 shader | `game.pretty.js:39238`, `:39329` | `m_()` face decal、`g_()` neck                             | 材质源码 + 目标实现状态               |
| 材质          | `asset_kart.glb` material JSON   | Paint clearcoat 1.0、Accent 0.6、EmissiveStrength 3        | GLB JSON vs 目标 XML                  |

## 未确认/待验证

- …（每条写为什么未确认、下一步怎么验证）
```

配套审计文件：

- `source/audit/control-flow.md`：URL 参数/feature flag/主备分支/模型选择/每角色覆盖。
- `source/audit/shaders.md`：`onBeforeCompile`/`ShaderMaterial`/`customProgramCacheKey` 清单。
- `source/audit/materials.md`：GLB 材质 vs 目标 XML 的 parity 表。
- `source/audit/models.md`：id/显示名/模型/图集/颜色映射。
- `source/audit/animations.md`：动画/程序化动画与目标实现状态。
- `source/audit/ui.md`：UI 控件与骨架件对照。

## 视觉修复台账（visual_fixes）

每个视觉修复在 `project-info.json` 记录同一份台账（`t3m note project-info.json visual_fixes source/audit/visual-fixes.md`），
内容至少包含：

```markdown
| 症状         | 区域     | source_evidence                                   | root_cause                          | fix                              | confidence | 复验                         |
| ------------ | -------- | ------------------------------------------------- | ----------------------------------- | -------------------------------- | ---------- | ---------------------------- |
| 车手眼睛发黑 | 标题车头 | `game.pretty.js:45463`, `:46582`; `Build.lua:759` | 标题太阳/阴影未按源码；normal green | 标题太阳 + shadow bias + N green | high       | compare metrics + 同相位截图 |
```

没有 `source_evidence` 的视觉修改不算完成；只有截图、没有源码证据的修改，下一轮很可能回归。

## 阶段状态维护

每完成一步就更新状态、记录产物（agent 按流程执行，不 reliance 记忆）：

```bash
t3m mark convert_game_…/project-info.json fetch
t3m note convert_game_…/project-info.json fetch_manifest source/FETCH_MANIFEST.txt
t3m note convert_game_…/project-info.json report source/report.md
```

- `mark <info> <stage> [status]`：默认 `done`；阶段名必须是 stages 里已有的十个之一，写错会报错。
  两道阶段门禁：`ui` 必须先有 `ui_inventory`（`t3m ui` 出的控件清单，见 [ui-parity.md](ui-parity.md)）、
  `accept` 必须先有 `runtime_log` + `maker_url`（有意设计，要跳过时用 `--force` 并写明原因）。
- `note <info> <key> <value>`：往 `artifacts` 里记产物相对路径（相对工作目录）。
- 建议的记录点：`fetch` → 取证清单、`analyze` → report.md、`audit` → `source/audit`、`ui` → `ui_inventory`（控件清单）、
  `levels` → 转出的 Lua、`accept` → `maker_url`（`t3m note … maker_url "<url>"`）以及
  `compare_source` / `compare_target` / `compare_diff` / `compare_metrics` / `compare_operation`。
  另外记录 `visual_fixes`（`source/audit/visual-fixes.md`）和 `gameplay_screenshot`（最终比赛截图）。
  `mark accept` 会警告这些证据缺失、文件不存在、verdict 未通过或比目标代码/最新 publication 旧；
  `visual_review_mode=kayingcode-side-pane` 时，compare 缺失/未通过/过期会拒绝 accept（`--force` 例外）。
- 检查点/压缩前更新 `source/SOURCE_NOTES.md`；视觉修复记录 `visual_fixes`（`source/audit/visual-fixes.md`）。
  `mark accept` 前确认关键事实有 `file:line`、每条视觉修复有 `source_evidence`。

## 命令路径对照（新流程）

| 步骤   | 旧写法                                    | 新写法（工作目录内）                                                                          |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| 建目录 | —                                         | `t3m init "<url>"` → `cd convert_game_…`                                                      |
| 取证   | `t3m fetch "<url>" --out sources/`        | `t3m fetch "<url>" --out source/` + `mark … fetch`                                            |
| 分析   | `t3m analyze sources/ --out report.md`    | `t3m analyze source/ --out source/report.md` + `mark`/`note`                                  |
| 关卡   | `t3m levels src/… --out <项目>/scripts/…` | `t3m levels source/… --out dest/scripts/…` + `mark … levels`                                  |
| 建工程 | 在任意目录 `taptap-maker init`            | KayingCode：`kaying-for-taptap_ensure_project`/`init_project`；其他宿主才 `taptap-maker init` |
| 体检   | `t3m lint <项目>`                         | `t3m lint dest` + `mark … accept`                                                             |
