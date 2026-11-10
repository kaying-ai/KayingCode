# 手机远控自定义 Relay 地址

## 产品规则

桌面端「设置 → 远程设备 → 连接偏好」提供「手机远控 Relay 地址」。留空时使用部署默认 Relay：进程环境优先于本地 `.env` 快照，最后回退生产默认 origin。用户填写的地址优先于部署默认值，用于自托管或私有 Relay。

该地址是手机远控的唯一 Relay origin：左下角手机图标打开的远控弹窗中，复制链接、二维码 base URL、设备注册/账号邀请、V2 HTTP 与 WebSocket 连接必须使用同一个 origin，不能只改二维码而连接仍走官方 Relay。

修改后，下一次开启/刷新手机远控使用新地址；已经建立的远控会话立即挂起（`suspend` 走 endpoint 变更语义），旧二维码不得继续被复制或用于连接。清空输入并保存恢复默认 origin。

## 状态与边界

- 未设置该字段时，行为与改动前完全一致，不需要数据迁移。
- 持久化字段：`AppSettings.mobileRelayOrigin?: string`，只保存规范化后的 https origin；空串在写入时归一为删除。Taro/Flutter 客户端只接受 https 连接串，http Relay 生成的二维码会在手机端被拒绝，因此设置入口不接受 http。
- 该字段属于本机桌面 AppSettings，不随设置页的 Source 切换写入远端 Host；Main 从本机设置读取。
- 校验：用户设置只接受 `https:`；不接受路径、查询或 fragment，保存前规范化为 origin。非法输入由设置页拒绝，不写入设置。
- 凭据：`desktopRemoteAccount` 按 origin 隔离 owner secret（现有 `remote-account:v2:${origin}` key），切换 origin 不删除旧 origin 的本地凭据，也不把它们发送到新 origin。
- 环境变量：`KAYINGCODE_OFFICIAL_CLOUDFLARE_RELAY_ORIGIN` 仍作为部署默认；用户设置覆盖它。`KAYINGCODE_WEB_REMOTE_CONTROL_URL` / `KAYINGCODE_WEB_REMOTE_CONTROL_RELAY_WS_URL` 仍是显式部署覆盖，分别优先于设置页地址生成的对应 URL。
- Main 唯一读取并解析该设置；Renderer 只提交设置 patch，不自行拼接 Relay URL。

## 生效顺序

```
用户设置 mobileRelayOrigin
  → resolveDesktopRemoteOrigin（用户设置 > process env > local .env > 生产默认）
  → buildKayingCodeEndpointUrls(origin)
  → endpoint.remoteUrl / relayWsUrl / apiBaseUrl
  → QR、复制链接、设备注册、push 通知、WebSocket
```

账号注册与邀请使用同一个 origin 的 `desktopRemoteAccount` 实例；切换 origin 后使用新实例，旧会话由 Main 挂起。

## 验收场景

1. 留空保存：使用部署默认 origin，二维码与连接链路保持现状。
2. 填写 `https://relay.example.com/some/path`：保存为 `https://relay.example.com`，二维码 base 为 `https://relay.example.com/remote/v4`，Relay WS 为 `wss://relay.example.com/api/v1/remote/ws2`。
3. 填写非法值（非 URL、`http:`、`ftp:`、仅路径）：设置页提示错误，不写入设置，现有 Relay 不变。
4. 修改地址后重新打开手机远控：复制链接和二维码都指向新 origin；已存在的远控会话被挂起，旧二维码不可复用。
5. 切换到自托管 Relay 后，账号邀请、设备注册与通知请求都发往新 origin，不向官方 Relay 发送 owner secret。
6. 清空并保存：恢复部署默认 origin；旧 origin 凭据保留但不参与新连接。

## 验证记录（2026-11-10）

- `desktopRemoteAccount` 单测通过：用户设置覆盖环境默认，空值回落部署默认。
- 共享设置单测通过：https origin 规范化、http/非法值丢弃、完整设置与 patch 都保留字段。
- 共享链接单测通过：自定义 origin 生成 `/remote/v4` 二维码 base 与 `wss://.../api/v1/remote/ws2`。
- `normalizeSettingsPatch` 单测通过：清空值归一为删除。
- 根 `pnpm run typecheck`、`pnpm run lint`（0 error）、`pnpm run architecture:check --changed` 通过。
- 未执行真实自托管 Relay 的扫码/配对端到端验收；本环境没有可用的第三方 Relay 地址。
