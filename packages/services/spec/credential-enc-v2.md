# 凭据服务 enc:v2 迁移

## 规则

- `createCredentialService` 接受异步 `CredentialCipher`；未注入时继续使用 v1 兼容 cipher，避免独立 Server 在没有 Secret Prepare 的版本提前切 v2。
- Desktop Main 与 Window Host 注入系统 cipher：Main 直接持有 keyring，Host 使用 `createCredentialCipherBridge`。
- 读取时若记录中存在 v1/明文值，在凭据文件锁内执行 `migrateCredentialRecord`，整库原子写回；不可解密的旧值保持原样，不阻塞其他键。
- 写入前先迁移已有记录，再把新值加密为 v2；删除只删目标键，不要求 keyring 可用。
- 损坏 JSON/schema 仍先备份并拒绝覆盖。
- `providerProvisioningSource` 必须接受同一 cipher 并 await decrypt，禁止把 v2 密文当明文导出；未注入时保持 v1 兼容。
- 数据根切换：`settingService.updateDataBaseDir` 在复制完成后、持久化新路径前调用 Host 注入的 key-share；失败中止切换。

## 状态所有者

- Desktop Main：系统密钥与 keyring 条目。
- Window Host：本地凭据文件、迁移锁、桥请求生命周期。
- CLI：同一凭据文件；内置 CLI 只经协议桥，独立 CLI 使用本机 cipher。
- 独立 Server：本阶段继续使用 v1；v2 与 `--prepare-credentials` 见后续阶段。

## 验收

- v1 记录首次读取后整库变 v2，损坏的旧条目字节不变。
- Host 重启后 v2 值仍可读；数据根复制后新路径可读，切回仍可读。
- provisioning 不导出密文；删除在 keyring 不可用时仍可清理目标键。
- 测试：`packages/services/test/credentialServiceEncV2.test.ts`、`settingDataRootKeyShare.test.ts`。
