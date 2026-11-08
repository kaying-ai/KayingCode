# Cloudflare Relay

[中文（默认）](README.md) | **English**

KayingCode's mobile remote-access service hosts the Web workbench, device authorization and message forwarding on one HTTPS origin. A phone joins the Desktop Host and sessions already in use. This is initial-release documentation, reviewed on 2026-11-07.

## User experience

1. Open a workspace in Desktop and enable mobile remote control.
2. Scan the Desktop QR code. The browser authorizes automatically and opens the workbench.
3. Continue the same session on the phone while Desktop remains running.

**Users do not register accounts, set passwords or enter tokens.** Clients create the Desktop identity, issue an invitation and save browser credentials automatically. Scanning is the user's device-authorization action. Internal accounts isolate devices and credentials rather than provide an account-management product. Scan again after credential expiry, logout or browser-storage clearing.

Invitations last five minutes and are claimed once; authorized browser credentials last 30 days. Clients manage long-lived credentials and fresh per-connection tickets.

## Documentation

| Guide                                                          | Contents                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Implementation](IMPLEMENTATION.en.md)                         | Modules, identities, state ownership, HTTP/WS contracts and boundaries      |
| [Technical flows](FLOWS.en.md)                                 | User actions and automatic authorization, pairing, forwarding and reconnect |
| [First deployment](DEPLOYMENT.en.md)                           | Cloudflare preparation, commands, Desktop onboarding and acceptance         |
| [Contract](CONTRACT.md) / [Protocol spec](spec/upstream-v2.md) | Maintainer constraints, in Chinese                                          |

Each page links to its counterpart. Language links affect documentation only.

## Components

Worker serves HTTP and assets; WebRemoteRelayObject manages device identity, credentials and connections. Relay forwards messages. The existing Desktop Host/CLI runtime owns tasks, command queues and business snapshots.

| Entry              | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| /remote/v4         | Mobile workbench using the complete Desktop-generated link |
| /api/v1/account/\* | Automatic client identity and browser authorization        |
| /api/v1/remote/\*  | Device and connection management                           |
| /healthz / /readyz | Service liveness / storage-read checks                     |

HTTP /api/v1, Relay V2 and the /remote/v4 page version different layers; their numbers need not match. See the implementation guide.

From the repository root, using the versions in mise.toml:

```sh
pnpm --dir apps/kayingcode-relay-cloudflare test
pnpm --dir apps/kayingcode-relay-cloudflare test:integration
pnpm --dir apps/kayingcode-relay-cloudflare typecheck
pnpm --dir apps/kayingcode-relay-cloudflare dev
```

Integration builds Web and starts an isolated local Worker. Worker-dependent cases may be skipped by test alone. Follow the [first-deployment guide](DEPLOYMENT.en.md) to publish.
