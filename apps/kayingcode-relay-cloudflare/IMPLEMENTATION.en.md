# Relay implementation

[中文（默认）](IMPLEMENTATION.md) | **English** · [Overview](README.en.md) · [Flows](FLOWS.en.md) · [Deployment](DEPLOYMENT.en.md)

Reviewed: 2026-11-07. This describes the current implementation.

## 1. Modules

| Source                                                                    | Responsibility                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [index.ts](src/index.ts) / [contract.ts](src/contract.ts)                 | Worker/DO exports and WEB_REMOTE / ASSETS ports                                         |
| [worker.ts](src/worker.ts)                                                | Routes APIs and readyz to idFromName("upstream-v2"); delegates assets                   |
| [webRemoteRelayObject.ts](src/webRemoteRelayObject.ts)                    | HTTP authorization, devices, tickets, WS pairing, forwarding, logout and alarms         |
| [remoteAccounts.ts](src/remoteAccounts.ts)                                | Random credentials, SHA-256 digests, idempotent owner registration and invitation claim |
| [mobileWebAssets.ts](src/mobileWebAssets.ts)                              | Allowed paths, GET/HEAD and SPA fallback                                                |
| [Shared protocol](../../packages/shared/src/web-remote-relay/contract.ts) | Strict request schemas, messages and HTTP operations                                    |

The production dependency is @zcode/shared. Wrangler, workers-types and ws are development/validation tools. The DO uses the key-value API of SQLite-backed storage, without a separate D1 database, KV namespace, SQL initialization step or external database.

All accounts share one named DO and are isolated by userId. There is no per-account DO sharding. Critical fetch and webSocketMessage paths use blockConcurrencyWhile. RemoteAccounts relies on caller serialization; it is not an independent concurrent transaction service.

## 2. Identity and ownership

For users, this is a scan-to-connect flow: no registration form, password or token entry. Desktop automatically maintains an owner identity; scanning grants the browser a terminal credential for that identity. The identities below describe internal authorization. Explicit authorization is still required, and expiry/logout/storage clearing can require another scan.

### Internal owners

| State                                                 | Sole owner                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Raw owner secret                                      | Desktop secure credential service; registration retries reuse it             |
| Raw terminal token                                    | Web adapter memory and localStorage; memory only when storage is unavailable |
| Accounts, digests, invitations, devices and tickets   | WebRemoteRelayObject storage                                                 |
| Role, SID, terminalSid, lease and initialized flag    | Hibernation WebSocket attachment                                             |
| Tasks, CommandInbox, runs and snapshots               | Existing CLI/runtime                                                         |
| Attachments, cross-Host routing and business recovery | Existing Desktop window Host                                                 |

owner/terminal are account authorities; device/terminal are WS roles. Owners obtain device tickets; terminal credentials obtain terminal tickets. device_sid, device_mid and terminal_sid are not task/workspace identities. The business path carries workspaceIdentity and remoteSessionId; Relay does not recreate them from filesystem paths.

## 3. Storage and lifetimes

| Key / attachment       | Value                                                           | Current lifetime                                              |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `credential:<SHA-256>` | userId, owner/terminal, expiresAt                               | Far-future owner expiry; terminal 30 days by default          |
| `invitation:<SHA-256>` | userId, expiresAt, remainingClaims                              | Five minutes by default; decremented or deleted on claim      |
| `device:<device_sid>`  | SID, MID, userId, created_at, meta                              | Until owner deletion                                          |
| `token:<SHA-256>`      | Authority, WS role, credentialDigest, expiresAt                 | 60 seconds; consumed before upgrade, even if validation fails |
| Socket attachment      | Ticket fields plus lease, SID, terminalSid, initialized and mid | One pairing-eligible connection per SID/role                  |

Invitation lifetime, claim count and terminal-credential lifetime are controlled by `KAYINGCODE_REMOTE_INVITE_TTL_DAYS`, `KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS` and `KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS`. Durations use days and accept fractions; defaults and ranges are in the [protocol spec](spec/upstream-v2.md#邀请与凭据有效期配置). Legacy invitations without `remainingClaims` remain one-time.

Account credentials and invitations are 32 random bytes encoded as unpadded Base64URL, 43 characters. Connection tickets use 16 bytes, 22 characters. Storage does not retain raw bearer credentials, invitations or tickets. Reads check expiry; an approximately one-minute alarm scans expired records and closes expired or initialization-timed-out sockets. The alarm is not a business heartbeat or replay mechanism.

Online state is derived from initialized OPEN device sockets, not the persisted online field. Logout deletes the credential digest and closes matching sockets. Device deletion checks ownership and closes matching SID connections.

## 4. Protocol version layers

| Layer          | Current identifier                     | Meaning                                           |
| -------------- | -------------------------------------- | ------------------------------------------------- |
| HTTP API       | /api/v1/account/_ and /api/v1/remote/_ | Paths used by this implementation                 |
| Relay messages | V2, ws2                                | Socket handshake, pairing and forwarding protocol |
| Web workbench  | /remote/v4                             | Page and business-session entry                   |

These are independent identifiers. Keep the paths expected by clients; differing numbers do not indicate conflicting implementations.

### HTTP contract

API JSON responses use Cache-Control: no-store. Successful account endpoints return direct objects; successful remote endpoints use `{code:0,msg:"ok",data:...}`. Errors generally combine the HTTP status with `{code,msg,data:null}`. Do not parse account success as a remote envelope.

| Method and path                        | Authority                | Input / output                                                         |
| -------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| POST `/api/v1/account/register`        | No bearer                | `{ownerSecret}` → `{userId}`; idempotent for the same secret           |
| POST `/api/v1/account/invite`          | Owner Bearer             | `{}` → `{invitation,expiresAt}`                                        |
| POST `/api/v1/account/claim`           | No bearer                | `{invitation}` → `{token,userId,expiresAt}`                            |
| POST `/api/v1/account/logout`          | Terminal Bearer          | Revokes the current credential; remote-style success envelope          |
| POST `/api/v1/remote/device`           | Owner Bearer             | `{device_mid}` → device; creates a new SID each time, not a MID upsert |
| GET `/api/v1/remote/device`            | Owner or terminal Bearer | Devices belonging to the account                                       |
| POST `/api/v1/remote/device/delete`    | Owner Bearer             | `{device_sid}`; rejects cross-account deletion                         |
| POST `/api/v1/remote/token`            | Bearer matching the role | `{role:"device"}` or `{role:"terminal"}` → `{token,expires_in:60}`     |
| GET `/api/v1/remote/ws2?token=…&mid=…` | One-time ticket          | WebSocket Upgrade; device mid must match the registered MID            |
| GET `/healthz`                         | None                     | `{ok:true}` without accessing the DO                                   |
| GET `/readyz`                          | None                     | DO read probe; 503 on failure                                          |

Remote inputs use strict shared schemas; extra fields may cause 400. A content-length over 4096 or POST text length over 4096 causes 413. Invalid JSON is 400, missing authority 401, role/ownership violations 403, and missing WS upgrade 426.

## 5. WebSockets

Client messages are auth_init, pair_status_query and data. Server messages are auth_ack, pair_status_ack, data and error, with server_ts in seconds. The first frame must be auth_init with device_sid and optional meta/client_ts. The server checks account, SID and device MID. Terminal initialization generates terminal_sid and returns waiting or matched.

Each upgrade gets a lease. When the same SID/role initializes again, the old attachment first loses its initialized eligibility, then receives KICKED and closes. Its late close cannot invalidate the replacement pairing. One device pairs with one terminal; same-SID mobile broadcasting is not implemented.

payload must be JSON. Relay does not interpret business RPC. With no opposite peer it returns DEVICE_OFFLINE without queuing. Binary frames or frames exceeding shared WEB_REMOTE_CONTROL_RPC_TRANSPORT_LIMITS.maxPhysicalFrameBytes close with 1009; authorization problems use 1008, send failures 1011. Shared protocol definitions are authoritative.

Clients use pair_status_query/ack for liveness. Shared defaults are a five-second interval, one-second jitter and a 15-second acknowledgement timeout. Clients retry with fresh tickets. Host owns snapshot/incremental recovery; Relay does not.

## 6. Web assets and build

Only /remote, /remote/_, /material-icons/_ and /pdfjs/\* are served, using GET/HEAD. /remote redirects to /remote/ with 308. Extensionless remote pages fall back to /remote/ on an asset 404 while retaining the browser route. Missing file paths with extensions do not fall back to HTML.

The [Web builder](../../packages/web/scripts/build-upstream.mjs) exports the official Git commit pinned by upstream-web.json, fetching that object from the official repository when necessary. It uses this repository's locked dependencies. Adaptations are limited to two account adapters, bootstrap and audited branding; key workbench source hashes are verified. packages/web/dist is copied to public/remote after clearing this application's public directory, excluding .map files. Do not place handwritten configuration or documentation in generated public.

The manifest records source, relayOrigin and audit hashes. Product THIRD-PARTY-NOTICES.md and preserved UPSTREAM-THIRD-PARTY-NOTICES.md are both shipped and linked from HTML. Build consumes existing notices without automatically running repository-wide strict verification; see the [license policy](../../third-party/SPEC.md).

## 7. Operational boundaries and validation

Account sharding, dedicated administration, password recovery, business queues and a separate push service are not implemented. Other shared schema types do not imply Worker support. Evaluate single-DO capacity, device listing and alarm scans against actual load.

TLS/WSS protects transport; application payload end-to-end encryption is not implemented here. Terminal tokens reside in browser storage. Do not log complete invitation URLs, bearers or ticket query strings. Hibernation preserves connection attachments but does not guarantee uninterrupted deployments/networking or business exactly-once delivery.

Unit tests cover account idempotency/expiry, assets and routes. Local integration covers actual HTTP/WS, token replay, SID/lease, forwarding, logout and notice hashes. Real-device acceptance is separate.

Cloudflare references: [Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [attachments](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/). Use the DO configuration shipped in wrangler.jsonc for the initial deployment.
