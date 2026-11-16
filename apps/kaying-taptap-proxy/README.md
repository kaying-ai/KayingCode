# kaying-taptap-proxy

Cloudflare Worker that proxies a small allowlist of TapTap public APIs. It exists because the report server's egress IP is blocked by TapTap's WAF (HTTP 405), while Cloudflare Workers can reach the API.

The Worker is a **transport proxy**, not an LLM/subagent. Subagent analysis stays in the KayingCode daily-report workflow.

## Endpoints

```text
GET /health
  -> { "ok": true, "service": "kaying-taptap-proxy" }

GET /fetch?path=<url-encoded TapTap path>
  Authorization: Bearer <PROXY_TOKEN>
  -> upstream response body/status
```

Allowed path prefixes:

- `/webapiv2/app-top/`
- `/webapiv2/calendar/`
- `/webapiv2/top/`

Everything else is rejected. The Worker never accepts an arbitrary absolute URL.

## Deploy

```sh
cd apps/kaying-taptap-proxy
pnpm install

# Generate a token locally and store it as a Worker secret.
openssl rand -hex 32 > /tmp/kaying-taptap-proxy.token
pnpm exec wrangler secret put PROXY_TOKEN < /tmp/kaying-taptap-proxy.token

# Optional defense in depth: only accept the report server's egress IP.
printf '%s' '<report-server-public-ip>' | pnpm exec wrangler secret put ALLOWED_CLIENT_IP

pnpm exec wrangler deploy
```

`wrangler.jsonc` binds the Worker to the custom domain `taptap-proxy.opentaptap.dev`; `workers_dev` is disabled because `*.workers.dev` is not reliably reachable from mainland China.

## Test

```sh
TOKEN="$(cat /tmp/kaying-taptap-proxy.token)"
curl https://taptap-proxy.opentaptap.dev/health

curl --get \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'path=/webapiv2/app-top/v2/hits?type_name=hot&from=0&limit=10&X-UA=...' \
  https://taptap-proxy.opentaptap.dev/fetch
```

Expected: `/health` 200, `/fetch` 200 with the TapTap JSON, missing/wrong token 401, disallowed path 400.

## Security

- `PROXY_TOKEN` is required; it is stored as an encrypted Worker secret and only given to the report server.
- Path allowlist prevents SSRF and arbitrary host access.
- No TapTap cookies, login state, request bodies or user data are forwarded.
- Responses are `cache-control: no-store`; the Worker stores nothing.
- `ALLOWED_CLIENT_IP` is optional but recommended; set it to the report server's public egress IP.

## Notes

- The Worker's egress IP is allowed for the TapTap API endpoints tested on 2026-11-16. TapTap may change its WAF policy; keep the `/health` check and the collector's quality thresholds.
- If TapTap blocks Cloudflare egress later, the collector can fall back to `TAPTAP_DAILY_SOURCE=import` and the local `collect-and-upload.sh` path.
