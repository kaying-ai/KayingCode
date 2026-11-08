# Third-party notices

This official plugin redistributes the following locked TapTap runtime artifacts:

- `@taptap/maker` 0.0.38 (`vendor/instant-games-open-mcp/dist/maker.js`)
- `@taptap/instant-games-open-mcp` 1.24.14 (`vendor/instant-games-open-mcp/dist/server.js` and `proxy.js`)

The upstream package metadata, source locations, npm integrity values and per-file SHA-512
digests are recorded in `vendor/instant-games-open-mcp/upstream-lock.json`. The upstream MIT
license is included at `vendor/instant-games-open-mcp/LICENSE`.

The Rust runtimes' dependency versions and checksums are pinned by `native/core/Cargo.lock` and
`native/threejs-to-taptapmaker/Cargo.lock`. The transcription runtime uses the MIT-licensed Rust
`image`, `serde` and `serde_json` crates recorded in that lockfile.
