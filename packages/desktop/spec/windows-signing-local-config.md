# Windows 本机签名配置

## 产品规则与所有者

- `packages/desktop/scripts/desktop-code-signing.mjs` 是桌面打包签名输入的唯一解析点。`bundle.mjs` 在准备资源和构建之前调用它，再将解析出的环境补丁传给 electron-builder。
- Windows 本机配置固定为 `packages/desktop/build/cert/windows-signing.local.json`，由用户自行创建。配置包含 `certificateFile`（绝对 PFX/P12 文件路径）和 `certificatePassword`（导出时设置的口令）。Git 忽略所有同名配置，公开快照检查拒绝已暂存的同名配置。
- 显式环境证书 `WIN_CSC_LINK` 或 `CSC_LINK` 优先于本机配置；这种情况下不读取配置文件，避免 CI 被本机残留配置影响。无环境证书且无配置文件时保持 `windows-unsigned` 开发构建。存在配置文件但 JSON 错误、字段缺失或证书文件不可访问时，构建在准备阶段前失败，不回退为未签名。
- 本机配置只用于 Windows 目标。macOS/Linux 现有签名规则不变。日志只报告来源和可操作错误，不输出证书口令。PFX 口令以明文保存在本机 JSON 中，用户须限制文件访问权限；公开发布仍须验证最终签名。

## 事件顺序与接口

```text
bun run package → bundle.mjs → desktop-code-signing.mjs
                            → 环境证书 / 本机配置 / unsigned
                            → buildEnv → electron-builder
```

没有运行时状态或跨进程持久化。解析仅发生于每次打包进程启动时；修改配置后下一次打包读取新值。

## 验收场景

1. 仅存在有效本机配置时，Windows 预演显示本机配置签名来源，实际构建接收 `CSC_LINK` 和 `CSC_KEY_PASSWORD`。
2. 显式设置环境证书时，即使本机配置损坏也不读取它；现有环境值不被覆盖。
3. 文件不存在时，Windows 仍显示 `windows-unsigned`；损坏 JSON、空口令、相对证书路径或不存在的证书文件均在准备前失败。
4. macOS/Linux 目标不读取 Windows 本机配置。
5. Git 默认忽略本机 JSON，示例文件和说明可提交。强制暂存任意目录下的同名本机 JSON 时，公开快照检查失败且只报告文件路径。错误信息和构建日志不含口令。
