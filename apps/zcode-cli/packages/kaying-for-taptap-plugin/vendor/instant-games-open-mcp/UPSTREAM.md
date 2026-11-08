# TapTap upstream runtime

- Repository: https://github.com/taptap/instant-games-open-mcp
- License: MIT; see `LICENSE` in this directory.
- Last synchronized: 2026-09-29.
- Packages: `@taptap/maker@0.0.36` and `@taptap/instant-games-open-mcp@1.24.14`.
- Sync command: `pnpm --filter @kayingcode/kaying-for-taptap-plugin sync:vendor`（或在本包目录执行 `node scripts/sync-vendor.mjs`）.
- Local patches: the synchronized `maker.js` bundle removes the remote fetch/sync preflight
  (including `needs_pull` fast-forward). If TapTap rejects a normal push because remote history
  advanced, it fetches only that history and creates an `ours` merge commit, preserving the
  local file snapshot before retrying the push. Kaying-owned wrappers live under
  `apps/zcode-cli/packages/kaying-for-taptap-plugin/src`.

Pinned packages, tarball URLs, npm integrity values, and per-file SHA-512 digests are recorded in
`upstream-lock.json`. The sync script verifies each tarball with SHA-512 before extracting it,
applies the maker push-policy patch, then rewrites `distSha512` for `verify-assets`.

The generated `dist/` directory is intentionally ignored by Git and must be restored before
packaging via `sync:vendor`. CI and Electron `prebuild` run the sync explicitly.
