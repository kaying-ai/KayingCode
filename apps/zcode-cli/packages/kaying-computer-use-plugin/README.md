# Computer Use built-in plugin

This package seeds KayingCode's `computer-use` official plugin. It embeds a pinned
snapshot of [`kaying-ai/kaying-computer-use`](https://github.com/kaying-ai/kaying-computer-use)
and launches the matching native MCP runtime directly from the plugin cache.

End users do not install a global CLI or update this package separately. Maintainers use
`pnpm --filter @kayingcode/kayingcode-cua-plugin run sync:upstream --source <checkout> --ref <ref> --plugin-version <version>` and then
run `pnpm --filter @kayingcode/kayingcode-cua-plugin run build:native` on each release platform.

The upstream snapshot and native runtime are covered by the MIT license in `LICENSE` and
recorded in `upstream-lock.json`.

Run these commands from the repository root. The sync command regenerates the catalog projections and source package map from the actual manifests. Release metadata belongs to `config/official-plugins.json`; do not edit generated contracts or patch downstream scripts with version strings. Validate with `pnpm run source:check` and `pnpm run source:plugins:check --runtime --target=<release-target>` after building the native runtime.
