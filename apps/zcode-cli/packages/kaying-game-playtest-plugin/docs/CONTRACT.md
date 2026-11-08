# Playtest Runtime contract

模块属于现有 architecture `plugins` 根，无跨包实现导入。唯一公开执行面是
manifest 声明的 `kaying_game_playtest` stdio MCP，构建产物 `dist/mcp/server.js`
由内置插件宿主重写为受控 Node 入口，兼容 Electron/SEA。参数和运行时校验共享
`runtime/tools.mjs` 的 JSON schema；不暴露设备任意 shell 或文件写入接口。

- 准备：`playtest_prepare`、`playtest_start`。
- 环境：`android_emulator(inspect|start)`，优先复用连接设备；需要启动已有 AVD 时固定
  `-gpu host -no-snapshot-load -no-snapshot-save`，保留数据，启动后确认 bootCompleted/GLES。
  不能把 host 参数当硬件加速证明，软件回退明确告警，不自动重启现有设备。
- 生命周期：`playtest_status`、`playtest_stop(pause?)`、`playtest_resume`。
- 视觉操作：`device_observe`、`device_act`，后者必须携带最新截图 observationId。
  `device_act(observe:true,waitForChangeMs?:number)` 合并后续截图，返回 action、observation、
  artifact、帧变化事实及计时；截图失败时返回 observationError，输入回执不回滚。
  waitFor=stable、settleRegion 提供区域连续帧稳定判断，settled 不是胜利判定。
  previewMaxWidth 可返回缩略 PNG，preview.scaleX/scaleY 映射到原图像素；原图证据保留。
- Web 端口：`playtest_attach`、`playtest_external_action`；Browser Use 是实际设备控制者。
- 记录/媒体：`playtest_record`、`capture_recording`、`capture_highlight`。
- 目标：`playtest_goal`，验收条件和状态位于 session.json；partial/verified 需要证据。
  start 的 reportKind=diagnostic/evaluation 和 goals 决定报告目的与验收范围。
  录制缺省60秒/15fps，上限180秒，自然封装后 finalize；导入视频也经 ffprobe 校验。
- 交付：`report_generate`、`report_compare`。
  review 缺省增量合并，reviewMode=replace 显式替换；relatedSessionIds 只关联同身份历史，
  不合并评分。基础信息/进度/事件/证据自动派生；缺项检查和未归因耗时不伪造评价。
  evaluation 默认呈现《新游戏试玩报告》，以风格/玩法/亮点/成长为正文；
  review.gameName/lede 提供读者标题与导语，sections[].media 提供有图注的精选媒体，
  必须属于同章节的可视证据。评分、计时、环境、日志和完整记录后置折叠附录。
  diagnostic 的诊断结构不变；旧字段与原始数据向后兼容。

所有参数包含绝对 workspacePath、可选 workspaceIdentity；除 emulator/prepare/start 外包含 sessionId。
完整输入 schema 通过 MCP `tools/list` 查询；`tools/call` 返回 JSON 文本，observe 额外返回 PNG
图片块；媒体只返回 artifact 元数据与路径。工具失败为 isError=true，服务继续运行。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "playtest_start",
    "arguments": {
      "workspacePath": "/absolute/workspace",
      "source": { "kind": "web", "url": "https://example.com/game" },
      "depth": "quick",
      "strategy": "objective",
      "objective": "进入第一关并验证失败后重试"
    }
  }
}
```

Runtime 写 session；Skill 只通过工具提交观察、操作回执与评价。HTML 是离线文档，不调用
Host、Service 或 Repo。没有新 remoteSession/attachment/stream/queue；手机通过已有远控
聊天请求所属 Host 的插件，禁止给手机另起试玩进程或复制任务队列。
