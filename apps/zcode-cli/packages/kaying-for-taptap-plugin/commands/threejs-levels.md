---
name: threejs-levels
description: 把网页游戏的关卡/配置数组转成 Maker 项目可用的 Lua 表（t3m levels），并核对条目数。
---

在工作目录 `convert_game_YYYYMMDDHHMMSS/` 内执行：

下文 `t3m ...` 是可读记法，实际使用内置 `kaying-for-taptap_transcription`，不从 Bash
查找或编译独立 CLI。

1. 在 `source/` 里定位关卡/配置文件（例如 `src/levels/data.js`、`daily-data.js`、世界主题表）。
2. 逐个转换：
   `t3m levels source/.../<file.js> --out dest/scripts/CKData.lua --name CKData.LEVELS`
   （带点号的名字会生成字段赋值 `CKData.LEVELS = {...}`，不带点号则生成 `local X = {...}` + `return X`）
3. **核对条目数与字段**：与原版数据条数一致（例：120 关、48 每日池），字段名逐个对照。
4. 保持原版的索引语义（原版 0 基就继续 0 基），只把字符串切片改 1 基——这样规则与求解器能和原版算法逐行对应。
5. 转完 `t3m mark project-info.json levels`；立刻在本机 runtime 里跑一次，`t3m rlog dest` 确认 Lua 能加载且无报错
   （启动方式见 Skill 的 `references/runtime-loop.md`；没有本机 runtime 就用 `maker_build_current_directory` 的日志代替，但要说明这一点）。

参数：源 JS 文件（必填，`source/` 内相对路径）、输出 Lua 路径（必填，`dest/` 内）、表名（可选）。
