# 贡献指南

欢迎通过 [GitHub Issues](https://github.com/kaying-ai/KayingCode/issues) 报告可公开的问题，或通过 Pull Request 向 `main` 提交改进。安全漏洞请走 [SECURITY.md](SECURITY.md) 指定的私密渠道，不要附上密钥、用户数据或内部地址。

从 GitHub 的 `main` 或其 fork 创建工作分支。Gitee 克隆用于加速时，按[仓库同步指南](docs/deploy/github-gitee-repository.md)设置 GitHub 远端后再提交 PR。

开发环境的 Node.js 与 pnpm 版本以 [mise.toml](mise.toml) 为准。在仓库根目录运行 `pnpm install`，再按 [README.md](README.md) 的开发命令启动所需入口。修改行为前先更新对应 spec；提交代码前运行目标包测试、`pnpm run typecheck`、`pnpm run lint`、`pnpm run source:check` 和 `pnpm run architecture:check --changed`。涉及版本或插件 manifest 时，先执行 `pnpm run source:plugins`、`pnpm run source:map`。

PR 请说明产品规则、改动范围、实际验证结果及未验证的平台。保留第三方版权声明与上游来源，不提交证书、真实 `.env`、抓包或会话数据。

## 许可

向本仓库提交的贡献按 [AGPL-3.0-only](LICENSE) 授权。提交 PR 即表示你有权提供该贡献，并同意其按本项目许可分发。上游 ZCode 派生部分继续适用 Apache-2.0；第三方组件和各插件保留其各自声明的许可，贡献时不要移除相关版权与许可声明。
