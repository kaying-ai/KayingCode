# KayingForTaptap native core

One Rust crate and one binary: `kaying-for-taptap-core`.
The core provides TapTap Maker project detection, diagnostics, command discovery,
prepared operation execution, project management and official runtime CLI operations.

Build and sync: `bun run build:rust:kaying-for-taptap`.
Validate: `bun run check:kaying-for-taptap-native`.

Public Agent tools are project, doctor, game_command and publish. The desktop keeps
file browsing and TapTap URL preview. Local execution uses the official environment
only on an explicit user request through the quick-command draft and Agent.

The custom runtime, semantic material library, embedded Kenney assets, scene editor,
durable Flow and knowledge plane have been retired. Old project data remains untouched.
