# GitHub 源码预审快照

此快照用于从 GitHub 验收源码开发入口。Web 开发按根 README 的冻结安装、类型构建和 `pnpm run dev:web` 步骤运行。快照保留上游归属及许可声明，ZCode 固定基线见 `UPSTREAM_BASE.json`。

Windows Desktop 和 CLI 的完整打包需要额外的目标平台资源：

- 本快照未附 Microsoft ripgrep 的两份 Windows 预编译归档。若维护者已批准用于本机构建，从固定的 [Microsoft v14.1.1-1](https://github.com/microsoft/ripgrep-prebuilt/releases/tag/v14.1.1-1) 取得对应 x64 或 arm64 文件，放入 `apps/zcode-cli/packages/cli/dependencies/native-search/ripgrep-v14.1.1-1/`。现有准备脚本会核对归档 SHA-256 和目标架构。
- Windows Computer Use 预编译程序由受控构建单独生成。插件的 `pnpm --dir apps/zcode-cli/packages/kaying-computer-use-plugin run build:native` 入口可使用仓库内的 vendored 源码；完整平台工具链及对应原文仍按制品验收。
- 软件安装包、自动更新及生产 Relay 分别按 [部署入口](../deploy.md) 验收。

仅从此快照引用经过审核的源码分支。上游镜像、产品发布分支及产品标签按仓库分支规范单独管理。
