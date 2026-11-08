# 应用目录

`apps/` 放可以独立启动、部署或安装的产品入口。包名、命令和制品以当前 package.json 与部署教程为准。

| 目录 | 定位 | 包名或入口 |
| --- | --- | --- |
| [packages/desktop](../packages/desktop/) | Electron 工作台、窗口与 Local Host | @zcode/desktop |
| [packages/web](../packages/web/) | 固定官方源码的 Web 工作台，账号和品牌适配 | @zcode/web |
| [packages/server](../packages/server/) | HTTP/WS Host 与远程运行支持 | @zcode/server |
| [packages/zcode-server-cli](../packages/zcode-server-cli/) | 上游常驻服务 CLI、远程 staging 与代理 | @zcode/server-cli |
| [zcode-cli/packages/cli](zcode-cli/packages/cli/) | Agent CLI/TUI 与 SEA 构建 | @zcode/cli |
| [kayingcode-site](kayingcode-site/) | 独立静态产品站 | kayingcode-product-site |
| [kayingcode-relay-cloudflare](kayingcode-relay-cloudflare/) | 当前 V2 Relay、轻量账号与 Web 同源托管 | @kayingcode/relay-cloudflare |
| [kayingcode-mobile-taro](kayingcode-mobile-taro/) | 微信小程序与 H5 移动壳 | @kayingcode/mobile |
| [kayingcode-mobile-flutter](kayingcode-mobile-flutter/) | Flutter 多端移动壳 | pubspec.yaml |

共享协议、服务和 UI 位于 packages；Agent 运行时与可启停插件位于 apps/zcode-cli/packages。根 plugins 仅保留插件维护文档。完整包名、公开入口和依赖见 [生成包地图](../SOURCE_PACKAGES.md)。

旧 Docker Relay、relay-core、agent-relay 和自有 Node 接入协议已退役。上游 server-cli 与 Desktop SSH/WSL/Docker 开发容器支持仍是当前功能，不能据名称将其视作旧 Docker Bot。远控实现说明见 [Cloudflare README](kayingcode-relay-cloudflare/README.md)，部署见 [部署入口](../docs/deploy.md)。
