# 部署入口

本地 Desktop 运行 Agent，手机通过扫码授权在 Web 中访问同一 Host 和会话。Cloudflare Relay 自动管理设备身份、浏览器授权与消息转发，用户无需注册账号；任务仍在桌面运行。Desktop 支持 SSH、WSL 和 Docker 开发环境。

| 场景                              | 教程                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------ |
| 安装、运行与构建桌面              | [Desktop](deploy/kayingcode-desktop.md)                                        |
| 选择桌面、Ubuntu 与移动端连接方式 | [Agent 连接方式总览](deploy/agent-connection/README.md)                        |
| 自建手机远控与同源 Web            | [Cloudflare Relay 首次部署](../apps/kayingcode-relay-cloudflare/DEPLOYMENT.md) |
| 上游 Web 构建与来源校验           | [Web](deploy/kayingcode-desktop-web.md)                                        |
| Agent CLI/TUI                     | [CLI](deploy/kayingcode-cli.md)                                                |
| 微信小程序与 H5 壳                | [Taro](deploy/kayingcode-mobile-taro.md)                                       |
| Flutter 多端构建                  | [Flutter](deploy/kayingcode-mobile-flutter.md)                                 |

架构、接口和产品规则维护在各应用/包的 README、CONTRACT 和 spec；根 docs 里的部署教程只描述当前可运行命令。远控实现说明见 [Cloudflare README](../apps/kayingcode-relay-cloudflare/README.md) 与 [Web README](../packages/web/README.md)。
