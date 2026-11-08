# 转写工作目录（workspace）规范

每个游戏一次转写 = 一个独立工作目录。所有取证产物、Maker 工程、阶段状态都收拢在这里，不再散落在各处。

## 目录结构

```text
convert_game_YYYYMMDDHHMMSS/      时间戳为北京时间（UTC+8），精确到秒
├─ project-info.json              项目信息：名称/地址/版本/路径/阶段状态/产物记录
├─ source/                        原版文件（t3m fetch 落这里）
│  └─ game/                       门户地址是外壳时，真正游戏入口的第二跳抓这里（分析以它为准）
├─ dest/                          Maker 游戏工程（源码本地化后立刻在此创建空项目）
└─ verify/                        自检脚本与验证记录（可选：Lua/JS 对拍、绕序检查、像素统计）
```

时间戳精确到秒，同一秒内不会建两个目录（`t3m init` 遇到已存在目录会报错，让调用方等一秒重试）。

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
- 建议的记录点：`fetch` → 取证清单、`analyze` → report.md、`ui` → `ui_inventory`（控件清单）、
  `levels` → 转出的 Lua、`accept` → `maker_url`（`t3m note … maker_url "<url>"`）以及
  `compare_source` / `compare_target` / `compare_diff` / `compare_metrics` / `compare_operation`。
  `mark accept` 会警告这些 compare 证据缺失、文件不存在、verdict 未通过或比目标代码/最新 publication 旧。

## 命令路径对照（新流程）

| 步骤   | 旧写法                                    | 新写法（工作目录内）                                                                          |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| 建目录 | —                                         | `t3m init "<url>"` → `cd convert_game_…`                                                      |
| 取证   | `t3m fetch "<url>" --out sources/`        | `t3m fetch "<url>" --out source/` + `mark … fetch`                                            |
| 分析   | `t3m analyze sources/ --out report.md`    | `t3m analyze source/ --out source/report.md` + `mark`/`note`                                  |
| 关卡   | `t3m levels src/… --out <项目>/scripts/…` | `t3m levels source/… --out dest/scripts/…` + `mark … levels`                                  |
| 建工程 | 在任意目录 `taptap-maker init`            | KayingCode：`kaying-for-taptap_ensure_project`/`init_project`；其他宿主才 `taptap-maker init` |
| 体检   | `t3m lint <项目>`                         | `t3m lint dest` + `mark … accept`                                                             |
