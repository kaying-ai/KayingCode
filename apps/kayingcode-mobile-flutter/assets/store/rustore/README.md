# RuStore 上架素材

按商店语言区分目录；当前提供俄语列表使用的 `ru-RU/` 截图集。

| 文件 | 内容 |
| --- | --- |
| `ru-RU/phone-01-agent-chat.png` | Agent 对话：用户提问与智能体俄语回答 |
| `ru-RU/phone-02-appearance.png` | 外观与语言（已选中 Русский） |
| `ru-RU/phone-03-profile.png` | 个人页、官网、隐私政策与客服 |
| `ru-RU/phone-04-connections.png` | 连接与通知：协议日志、后台保活与通知开关 |
| `ru-RU/phone-05-diagnostics.png` | 诊断与关于：诊断日志、协议日志、版本信息 |

- 规格：1080×1920 PNG（9:16），单张约 81–233 KB。
- 采集环境：KayingCode Android v0.1.3，俄语界面，Samsung SM-G9500（Android 9 / API 28）。
- RuStore 要求：每个设备类型至少 3 张；PNG/JPG；手机单张不超过 3 MB；最大 2160×3840；推荐 16:9。
- 采集时临时将设备显示设为 1080×1920 并隐藏系统栏，采集完成后已恢复原显示设置。
- Agent 对话来自真实任务：提问用英文书写以避开测试机无俄语输入法，智能体按要求用俄语回答；网页工作台自身仅内置英文/中文，底部应用导航仍为俄语。
- 重新采集前先在应用内切到目标语言，并确认界面中的版本号与 `pubspec.yaml` 一致。
