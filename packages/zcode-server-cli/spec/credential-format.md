# 远端 Server 凭据格式与准备

## 规则

- 服务器 release 在 `runtime/package.json` 写 `kayingcodeCredentialFormat: 2`；`SERVER_CREDENTIAL_FORMAT_ENV=KAYINGCODE_SERVER_CREDENTIAL_FORMAT` 由新 Supervisor fork Core 时写入 `2`。
- 新 Supervisor 的 Core 使用 `createServerCredentialCipher`；无 Secret Service 的远端由 `--prepare-credentials` 在启动前生成或校验 `<dataBaseDir>/.kayingcode/v2/credential-secret`（0600、32–4096 字节，原字节）。
- 旧 Supervisor 拉起的候选 Core 看不到 format env，只能使用 `createLegacyServerCredentialCipher`：已有 `enc:v2:` 时拒绝启动，避免旧代码把密文当 token。
- 回滚/恢复 current release 前检查凭据文件：包含 `enc:v2:` 且目标 release 未声明 format 2 时以 `CREDENTIAL_ROLLBACK_INCOMPATIBLE` 拒绝，保留凭据现场。
- 远端 Desktop 连接与 Source Server update/serve 命令都带 `--prepare-credentials`；单文件 `kayingcode-server.cjs` 不携带 keyring node_modules，只使用私有文件/显式环境密钥。
- server-cli staging 只保留目标平台 `@napi-rs/keyring-*`；缺少目标原生包必须由 staging/测试发现。

## 验收

- `prepareServerCredentialStorage` 幂等，已有 secret/source/v2 不改写。
- 新 Core 在无 Secret Service 的 Linux 用文件密钥启动；旧 Core 不能写 v2。
- 回滚到无 format 2 的 release 被拒绝，凭据文件不变。
- 测试：`packages/zcode-server-cli/test/credentialRollbackGuard.test.ts`、`packaging.test.ts`；cipher prepare 测试在 shared。
