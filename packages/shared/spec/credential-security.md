# 系统凭据加密（enc:v2）

## 产品规则

- 凭据值使用 AES-256-GCM。v2 格式为 `enc:v2:<os|env>:<key-fingerprint>:<iv>.<tag>.<ciphertext>`；密钥指纹是 key 的 SHA-256 前 24 位十六进制。
- 默认密钥由 OS 凭据库保管（`@napi-rs/keyring`，service `KayingCode Credential Encryption`，account 为规范化凭据文件路径的 SHA-256）。密钥不写入日志、RPC 或凭据文件。
- 受管环境可使用 `KAYINGCODE_CREDENTIAL_SECRET` 或 `KAYINGCODE_CREDENTIAL_SECRET_FILE`（32–4096 字节、原字节、不可同时配置）。显式配置优先于系统库。
- v1 只用于读取/迁移：同时尝试原始 secret、trim 后 secret 和本机 fallback；未知 `enc:` 前缀 fail-closed，不能当明文。
- 系统库不可用与密文损坏是不同错误：前者返回 `CREDENTIAL_SECURE_STORAGE_UNAVAILABLE`，不得按登出处理；后者保留 `KAYINGCODE_CREDENTIAL_DECRYPT_FAILED`。

## 状态所有者

- Desktop Main 是 OS 凭据库的唯一访问者；Window Host 与内置 CLI 只通过已建立的私有通道委托单次 encrypt/decrypt。
- 凭据文件、整组更新、文件锁和迁移提交仍由调用方的凭据容器负责；cipher 不缓存凭据内容。
- 同一进程、同一规范化凭据路径共享一次密钥加载结果（含失败）；不同路径隔离。显式注入的 KeyStore 按实例隔离。

## 接口

- `packages/shared/src/credential-security/module.ts`：`CredentialCipher`、`SystemCredentialCipher`、`createSystemCredentialCipher`、`createLegacyCredentialCipher`、`migrateCredentialRecord`、`createCredentialCipherBridge`、`executeCredentialCipherRequest`。
- 桥请求/回复 schema 在 `packages/shared/src/validation.ts`；Host↔Main 消息在 `channels.ts`：`credential-cipher-request/result`、`credential-key-share-request/result`。
- 数据根切换：复制凭据文件后，Host 请求 Main 把源密钥登记到目标路径；失败必须中止切换。
- Linux Desktop Main 在首次凭据访问前启用私有文件密钥回退；独立 CLI/Server 不启用。

## 验收

- v1→v2 迁移保留不可解密的旧条目；空值和 1 MiB 边界可 roundtrip；未知 enc 前缀失败。
- 并发 cipher 共享一次系统库读取；密钥丢失/锁定不生成替代密钥。
- 数据根切换后复制过去的密文可由目标路径读取；目标已绑定其他密钥时拒绝覆盖。
- Host 不直接访问系统库；桥非法回复/断开必须结束等待，不能长期持有文件锁。
- 单元测试：`packages/shared/src/credential-security/*.test.ts`。真实 OS 钥匙串 smoke 需要平台环境。
