# TapTap 取数代理（Cloudflare Worker）

## 背景

报告服务器（阿里云中国）直接访问 `www.taptap.cn` 时被 TapTap 的 WAF 返回 405。实测同一请求从当前 Mac 出口返回 200；从阿里云、腾讯云（广州/新加坡）云主机均返回 405。问题定位为服务器出口 IP/网段被 WAF 拦截，不是 Referer、HTTP 头或 TLS 指纹。

Cloudflare Worker 的出口可以访问 TapTap 榜单与日历 API；`taptap-proxy.opentaptap.dev` 从大陆报告服务器可直连。因此用 Worker 作为受控取数代理。

## 契约

```text
GET /health
  -> { ok: true, service: "kaying-taptap-proxy" }

GET /fetch?path=<url-encoded TapTap path>
  Authorization: Bearer <PROXY_TOKEN>
```

`path` 必须指向 `https://www.taptap.cn` 的以下前缀：

- `/webapiv2/app-top/`：下载/热门、预约、热玩三榜。
- `/webapiv2/calendar/`：游戏日历事件。
- `/webapiv2/top/`：榜单定义/题材榜元数据。

拒绝：绝对 URL、`//host`、`..`、反斜杠、NUL、非白名单路径、超长 path。

## 鉴权与安全

- `PROXY_TOKEN` 必须是高熵随机值，存为 Worker secret；只下发给报告服务器。
- `Authorization` 使用恒定时间比较；缺失/错误返回 401。
- 可选 `ALLOWED_CLIENT_IP`：设置后只接受该 `CF-Connecting-IP`，返回 403 其他来源。
- 不转发 Cookie、登录态、请求体或用户凭据；只设置 UA/Accept/Accept-Language/Referer。
- 响应 `cache-control: no-store`；Worker 不持久化任何数据。
- `workers_dev=false`，只暴露自定义域名，避免 `*.workers.dev` 在大陆被 DNS 污染/不可达。

## 失败语义

| 情况                     | 状态 | 说明                         |
| ------------------------ | ---- | ---------------------------- |
| 未配置 PROXY_TOKEN       | 500  | Worker 配置错误              |
| 缺失/错误 token          | 401  | 不暴露上游                   |
| 非白名单 path            | 400  | 防 SSRF                      |
| 客户端 IP 不在 allowlist | 403  | 可选防御                     |
| 上游不可达               | 502  | 返回错误消息，不伪造数据     |
| 上游 4xx/5xx             | 透传 | collector 记录并触发质量降级 |

## 部署

```sh
cd apps/kaying-taptap-proxy
pnpm install
openssl rand -hex 32 > /tmp/kaying-taptap-proxy.token
pnpm exec wrangler secret put PROXY_TOKEN < /tmp/kaying-taptap-proxy.token
pnpm exec wrangler deploy
```

`wrangler.jsonc` 使用自定义域名 `taptap-proxy.opentaptap.dev`。域名、证书和路由由 Cloudflare 管理；`workers_dev` 关闭。

报告服务器配置：

```sh
TAPTAP_DAILY_SOURCE=http
TAPTAP_PROXY_BASE_URL=https://taptap-proxy.opentaptap.dev
TAPTAP_PROXY_TOKEN=<与 Worker secret 一致>
```

collector 会把每个 TapTap API 请求改写成 Worker 的 `/fetch?path=...`，并在 `Authorization` 头携带 token。其余解析、限速、重试和 evidence 逻辑不变。

## 观测与限制

- `/health` 可用于外部监控；返回固定 JSON。
- Cloudflare 控制台的 Worker 指标可观察请求量、错误率和 CPU。
- 日报每天约 45 次请求（三榜 15 次 + 日历 30 次），远低于 Workers 免费额度。
- Worker 不缓存；每次日报都读取 TapTap 当前数据。
- TapTap WAF 策略可能变化；如果 Worker 出口也被拦截，collector 会失败并告警，可切回 `import` 人工兜底。
