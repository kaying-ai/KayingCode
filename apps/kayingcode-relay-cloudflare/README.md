# Cloudflare Relay

**中文（默认）** | [English](README.en.md)

KayingCode 的手机远控接入服务：在同一个 HTTPS 地址提供 Web 工作台、设备授权与消息转发，让手机连接桌面正在使用的 Host 和会话。文档按首次发布组织，核对日期为 2026-11-07。

## 用户如何使用

1. 在 Desktop 打开工作区，开启手机远控。
2. 用手机扫描桌面二维码，浏览器自动完成授权并进入工作台。
3. 在手机中继续操作同一会话；Desktop 保持运行。

**用户不需要注册账号、设置密码或填写 token。** 客户端自动创建桌面身份、签发一次性邀请并保存浏览器凭据。扫码是用户对设备接入的授权动作；内部“账号”用于隔离设备和凭据，不是面向用户的账号产品。授权到期、注销或清除浏览器存储后重新扫码。

邀请链接默认五分钟有效且只能领取一次；已授权浏览器凭据默认 30 天有效。长期凭据和每次连接的短期票据由客户端管理。受控审核/演示部署可用 Worker 变量调整邀请有效期、领取次数和终端凭据有效期，默认值见[协议规范](spec/upstream-v2.md#邀请与凭据有效期配置)。

## 文档导航

| 文档                                                      | 内容                                           |
| --------------------------------------------------------- | ---------------------------------------------- |
| [实现说明](IMPLEMENTATION.md)                             | 模块、身份与状态所有者、HTTP/WS 契约和运行边界 |
| [技术流程](FLOWS.md)                                      | 用户操作与自动授权、配对、转发和重连时序       |
| [首次部署](DEPLOYMENT.md)                                 | Cloudflare 准备、部署命令、Desktop 接入与验收  |
| [模块合同](CONTRACT.md) / [协议规范](spec/upstream-v2.md) | 维护者的实现约束                               |

每页顶部可切换中英文，仅影响文档语言。

## 运行组成

Worker 提供 HTTP 和静态资源入口；WebRemoteRelayObject 管理设备身份、授权凭据与连接。Relay 转发消息，任务、命令队列和业务快照仍由桌面已有 Host/CLI 运行时管理。

| 入口               | 用途                               |
| ------------------ | ---------------------------------- |
| /remote/v4         | 手机工作台，使用桌面生成的完整链接 |
| /api/v1/account/\* | 客户端自动处理设备身份与浏览器授权 |
| /api/v1/remote/\*  | 设备和连接管理                     |
| /healthz / /readyz | 服务存活 / 存储读取检查            |

HTTP 的 /api/v1 路径、Relay V2 协议与 /remote/v4 页面属于不同层次，版本号不要求相同，详见实现说明。

仓库根目录执行（工具版本见 mise.toml）：

```sh
pnpm --dir apps/kayingcode-relay-cloudflare test
pnpm --dir apps/kayingcode-relay-cloudflare test:integration
pnpm --dir apps/kayingcode-relay-cloudflare typecheck
pnpm --dir apps/kayingcode-relay-cloudflare dev
```

test:integration 构建 Web 并启动隔离的本地 Worker；test 单独执行时，依赖 Worker 的场景可能跳过。部署以 [首次部署教程](DEPLOYMENT.md) 为准。
