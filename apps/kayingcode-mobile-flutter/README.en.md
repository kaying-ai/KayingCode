# KayingCode Flutter mobile shell

Self-hosted KayingCode links open the workbench inside the platform WebView. The mobile shell manages saved connections and recent projects. The Web client manages authorization and conversations. See [NOTICE](../../NOTICE.md) for open-source licenses and attribution.

Read [AGENTS.md](AGENTS.md) before switching SDK targets. In this application directory, run `node scripts/flutter-target.mjs android check`, then use the same wrapper for `analyze`, `test` and `release`. Android and iOS use the pinned Flutter 3.35.5. HarmonyOS uses its own CPF SDK. Keep the global PATH, .fvmrc and root lockfile intact when switching targets.

See the [current implementation and platform guides](README.md), [V2 boundary spec](spec/legacy-relay-retirement.md) and [Cloudflare deployment guide](../../docs/deploy/kayingcode-relay-cloudflare.md). Widget tests do not certify physical-device WebView or release signing.
