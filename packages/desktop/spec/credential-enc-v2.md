# Desktop 凭据 cipher 所有权与打包

## 规则

- Electron Main 独占 `createSystemCredentialCipher`；Window Host 只创建 `createCredentialCipherBridge` 并把 `.cipher` 注入 `createLocalServices`，不得直接 import `@napi-rs/keyring`。
- Host 的 cipher 请求经 `parentPort` 发送 `credential-cipher-request`；Main 用当前数据根的 cipher 执行 `executeCredentialCipherRequest`，只回传受控结果，不回传密钥。
- Host 数据根切换时发送 `credential-key-share-request`；Main 将源路径 keyring 条目登记到 `<target>/.kayingcode/v2/credentials.json`，失败只返回 `CREDENTIAL_SECURE_STORAGE_UNAVAILABLE`。
- 内置 CLI 通过 `interaction/requestCredentialCipher` 协议方法委托 Host；Host 在 `kayingcodeAgentService` 用注入 cipher 应答。独立 CLI 才直接使用本机系统存储。
- Linux Main 在首次凭据访问前启用私有文件 key fallback。

## 打包

- `@napi-rs/keyring` 保留为 Desktop main/host 与 CLI bundle 的运行时外部依赖，不能内联 `.node`。
- Desktop `asarUnpack` 解包 `node_modules/@napi-rs/keyring-*/**/*.node`；native policy 只保留目标平台变体，并对漏网变体 fail-closed。
- 独立 SEA 不内置 keyring：需要 `KAYINGCODE_CREDENTIAL_SECRET` 或凭据目录的私有 `credential-secret`。内置桌面 agent 走 Host 桥，不触发该限制。
- 第三方清单由 `node scripts/licenses.mjs notices` 生成。

## 验收

- Host 进程没有 keyring 访问路径；Main 并发 cipher 请求只产生一次系统库读取。
- 数据根切换后冷启动仍能解密；切换失败不持久化新路径。
- 打包测试：`packages/desktop/test/credential-keyring-assets.test.ts`、`desktopNativePackagePolicyKeyring.test.ts`。
