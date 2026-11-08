# Server CLI 回归与控制错误关联

## 当前规则

- DataRootLock 唯一拥有 ownerToken；真实已持锁实例阻止第二实例，同 PID 缺失 token 的旧记录可恢复，不把 PID 重用当成存活证明。
- immutable release 的身份和完整性记录一致时，损坏副本可由已校验 incoming 修复；缺失记录或身份冲突必须拒绝，不改写不明来源目录。
- systemd 注册顺序为 daemon-reload → enable → start，注销为 disable --now。非 Windows spawn 的 shell 缺省 undefined 等价于关闭 shell。
- Supervisor 独占 lifecycle gate；更新未结束时 stop 等冲突请求立即拒绝。control restart 已退役，不恢复。
- 非法 control 请求若带合法、长度有界的 id，错误响应必须保留 id，使客户端立即关联 invalid-request；无法识别 id 的帧使用新诊断 id，不执行 handler。

```text
请求(id) → schema 校验 → Supervisor lifecycle gate → handler/状态迁移
              └ invalid-request(id)         └ 冲突响应(id)
apply-update Promise 立即绑定拒绝断言 → 竞争 stop → 回滚完成 → finally stop
```

测试使用真实锁实例、真实制品完整性记录及 IPC 失败语义，不通过增加超时或放宽保护让回归通过。更新失败 Promise 必须在发起时就绑定拒绝处理，测试退出释放 Supervisor。

status 仍由持 data-root lock 的 Supervisor 串行写入；复用 shared/node 的 private 原子写入端口处理 Windows 短暂文件占用，保留 0600、rename 及有界 IO 重试，不增设第二个写入者或延长生命周期超时。
