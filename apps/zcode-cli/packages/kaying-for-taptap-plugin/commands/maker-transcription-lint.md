---
name: maker-transcription-lint
description: 对转写后的 Maker 项目跑体检（t3m lint）与运行时门禁（t3m rlog），逐条给出根因与修法。
---

在工作目录 `convert_game_YYYYMMDDHHMMSS/` 内执行。下文 `t3m ...` 是可读记法，实际使用内置
`kaying-for-taptap_transcription` 工具，不从 Bash 调旧插件二进制，也不要现场编译：

1. 静态体检：`t3m lint dest`（默认只查用户代码 `scripts/` 与 `assets/**/*.shader`；诊断引擎库时用 `--all`）。
   除引擎坑位与资源缺失，它还会查**界面**这类静默问题：`ui-button-newline`（Button 的 text 里用 `\n` 当换行，
   单行绘制会被裁到半个字；含经由 softButton/bigButton 这类 helper 与刷新路径写入的变体）、
   `ui-text-width-hardcoded`（宽度写死、从不量文字）、`ui-overflow-check-off`（关掉了库自带的布局溢出检查）、
   `self-call-shadows-method`（同名局部函数吃掉控件方法调用，界面数字静默冻结）、`button-addchild`
   （往 Button 里塞子控件——子控件不布局会叠画，组合控件要用 Panel + onClick）、
   `i18n-missing-key`（用了词表里没有的 key——会原样显示 `paints` 这种字样）、
   `hardcoded-ui-text`（可翻译文案写成字面量，多语言失效）、
   `dev-switch-on`（开发自测开关还开着——预览会被自驱流程接管，用户看到的是假画面）。
2. 运行时门禁：先用内置 Maker 工具发布当前 revision，再执行
   `t3m rlog dest --dir dest/.maker/logs/runtime/runtime.log` 读取该 publication 的远端运行日志。它把行分成
   "Lua 报错 / 项目资源缺失 / 引擎包噪声"（`Cube/Day/…`、`themis_x64.dll` 属引擎级噪声，任何工程都有，
   不算失败），并在日志比代码旧时判失败。KayingCode 中不得为了补日志启动本地 runtime；远端发布明确失败且
   publication 诊断不足时，才按 Skill 记录降级原因。
3. 把结果按风险分组回报：**高风险必须全部修掉、`t3m rlog` 必须 PASS**（两者不通过都是退出码 1，当 CI 门禁用）。
4. 每条 finding 都带 `fix:`，按它改；不确定上下文时读对应文件确认（规则有少量启发式，需要人工判断"这是 UI 控件还是场景节点"这类问题）。
   **视觉类 finding 走 source-first**：先用 `source/audit/*` + `source/SOURCE_NOTES.md` 找到源码 owner，写 `source_evidence`（`file:line` + 值/分支/资源）后再改；禁止按截图逐像素调参数。
5. 修完重跑这两条直到都通过，再记录证据收尾：
   `t3m note project-info.json runtime_log <路径>`（另有 `screenshot` / `pixel_stats` / `maker_url`），
   KayingCode 中还要按 `references/visual-compare.md` 更新五个 `compare_*` artifact；最后
   `t3m mark project-info.json accept` —— 缺 `runtime_log` 或 `maker_url` 会被拒绝，compare 缺失/过期会警告。
   accept 前确认：`source/SOURCE_NOTES.md` 存在且关键事实带 `file:line`；`project-info.json` 的
   `visual_fixes` 每条都有 `source_evidence`；至少一张最终 gameplay 截图（不只标题屏）；known gaps 与已完成分开。

参数：工作目录（默认当前 `convert_game_*` 目录，目标固定为其 `dest/`）、`--json`（机器可读，便于自动化）。
