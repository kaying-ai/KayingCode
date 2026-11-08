---
name: diagnosing-plugins
description: Use to diagnose and fix KayingCode plugin and marketplace problems in the KayingCode client. Applies when a plugin is not listed, adding a marketplace or installing a plugin fails, a plugin is enabled but its skills or commands are missing, a built-in plugin still appears after being disabled, a plugin is not enabled as expected, a plugin.json manifest has a parse error, a plugin name is invalid, a dependency is unresolved or blocked across marketplaces, or a sensitive configuration value cannot be entered in the interface. Provides the plugin lifecycle, manifest schema, how to manage plugins in the client, and a step-by-step localization and repair workflow.
---

# Diagnosing Plugin Configuration

Goal: reduce any plugin problem to a single concrete fix.

Plugins are managed in **Settings → Plugins** — use plugin cards in the **公开 / Public** and **个人 / Personal** segments to browse, install, enable, or disable, and use the header's **管理已安装 / Manage Installed** action to configure, uninstall, or restore built-ins. Use the **添加 / Add** menu to create a plugin, install from a local path/ZIP, or add a local source.

> Key facts: enable/disable state is stored under `plugins` in `~/.kayingcode/cli/config.json`; the official marketplace is `kayingcode-plugins-official`; and for cloning marketplace repositories behind a proxy, KayingCode reads the proxy from `KAYINGCODE_HTTP_PROXY` (a bare `http_proxy` is not used).

## 1. Plugin lifecycle and persistence

- **Discovery sources** (first match wins): inline directories, bundled official plugins, the official plugin cache, and marketplace-installed plugins. The entire subsystem is governed by the `plugins.enabled` master switch.
- **Manifest location** (probed in order): `.kayingcode-plugin/plugin.json` (preferred), then `.claude-plugin/plugin.json`, then `.codex-plugin/plugin.json`. A plugin's identity is `<name>@<marketplace>`.
- **Enable/disable resolution**: an explicit enable/disable entry always wins; only when no entry exists does the plugin's default-enabled status apply. A disabled plugin still appears in the list as disabled, but its components resolve to nothing.
- **Persistence** (all under `plugins` in `~/.kayingcode/cli/config.json`): the enable/disable map, per-plugin configuration values, and the list of suppressed (uninstalled) built-in plugins. Because a built-in plugin ships with the application and cannot be deleted, "uninstalling" one records a suppression marker that hides it from discovery.
- **Built-in seeding**: on first launch, bundled official plugins are materialized into the plugin cache and registered in the official marketplace listing. This is idempotent and only re-materializes on a content or version change.

## 2. Manifest schema

- **plugin.json**: requires `name` (matching `^[a-z0-9][a-z0-9._-]{0,127}$`); optional `version` (defaults to `0.0.0`), `description`, `commands`/`skills`/`hooks`/`mcpServers`, and `userConfig`.
- **Recorded and executed**: `agents` contribute subagents; `commands`, `skills`, `hooks`, and `mcpServers` are all live capabilities.
- Component paths are validated: an absolute path or one that escapes the plugin root is rejected as an invalid component path.
- **userConfig**: `type` is one of `string`, `number`, `boolean`, `directory`, or `file`, with `title`, `description`, `default`, `required`, and `sensitive`. A **sensitive value cannot currently be entered in the interface or persisted** to the configuration file.
- **marketplace.json**: `{ name, plugins[], pluginRoot?, allowCrossMarketplaceDependenciesOn? }`. Each `plugins[].source` resolves against the catalog root. KayingCode.localrun keeps distribution **local-only**: local directories, local manifest files, and local ZIPs are the supported sources; remote marketplace catalogs (git/URL) are a product-level no-go, not a parsing detail.

## 3. Managing plugins in the client

- **Install**: in the **公开 / Public** or **个人 / Personal** segment, find the plugin card and click **安装 / Install**; the card and **管理已安装 / Manage Installed** show the result. New plugins follow their default-enabled status.
- **Enable / disable**: toggle the switch on the plugin card or in the manage view. Disabling removes all of its components from the session immediately.
- **Configure**: open the plugin's detail view and expand **Advanced** to fill in its configuration values (required fields are marked; sensitive fields cannot be entered here).
- **Uninstall / restore**: from the detail view or the manage view. Uninstalling a built-in plugin records a suppression marker; **恢复内置 / Restore** clears it and re-seeds.
- **Add a local source**: the **添加 / Add** menu → **添加本地来源 / Add Local Source** accepts a local directory containing `marketplace.json` (or a local manifest/ZIP). Remote catalogs are not supported in this product form.

## 4. Common pitfalls (symptom → cause → fix)

1. **A plugin is not listed at all** — its source was never added, so there is no installation record or cache; or `plugins.enabled` is false. → Add the local source and install it, or set `plugins.enabled: true`.
2. **Adding a source or installing fails** — the path does not contain a readable `marketplace.json` / manifest, the ZIP layout is wrong, or a same-name entry conflicts with an existing source. → Re-check the directory you pasted and the catalog JSON; for a **local source re-snapshot**, bump the entry's `version` (and the plugin manifest's `version`) so the update check can compare to something new. Remote clone errors do not apply: KayingCode.localrun does not fetch remote catalogs.
3. **Enabled but its skills or commands are missing** — a component path escapes the plugin root, the plugin is actually disabled, or it is not being treated as enabled where the session reads it. → Open the plugin's detail view to see the invalid component, and make the manifest path relative and inside the plugin root.
4. **A built-in plugin still appears after being disabled, or returns after uninstalling** — the suppression state was not applied where it was read. → Confirm the plugin id is in the suppressed-built-ins list in `~/.kayingcode/cli/config.json`; restoring it removes that entry and re-seeds.
5. **Not enabled as expected — listed as enabled but a skill reports "not found" in the session** — the default-enabled set was not applied along the session's discovery path even though the listing shows it enabled. → Verify the plugin's skills are actually available in the session (via **Settings → Skills** and the `/` menu), not only that the plugin shows as enabled.
6. **Manifest parse error** — the JSON is invalid, is not an object, or has a missing/invalid `name`. → Fix it into a valid object whose `name` matches the pattern.
7. **Invalid plugin name** — the name violates `^[a-z0-9][a-z0-9._-]{0,127}$`. → Rename.
8. **Unresolved or cross-marketplace dependency** — a dependency lives in another marketplace not listed in `allowCrossMarketplaceDependenciesOn`, is missing, or forms a cycle. → Add the target marketplace to `allowCrossMarketplaceDependenciesOn`, install the missing dependency's marketplace, or break the cycle. Dependencies are written as `name@marketplace`.
9. **Version shows 0.0.0 or updates are not detected** — the manifest lacks a top-level `version`, or a local source was re-read without a version bump. → Carry a semantic `version` in the manifest; after editing a local source, bump the catalog entry and manifest versions, then use the source's **检查更新 / re-snapshot** action.
10. **A sensitive configuration value cannot be set** — the field is disabled with a note that it requires secure storage. There is no secure credential store yet. → Remove `sensitive: true`, or provide the value out of band (for example via an environment variable); it cannot be persisted today.
11. **A `filesystem`/`sea` source reports "unsupported"** — a built-in plugin's cache path is missing or stale. → Re-seed the plugin (clearing its cache entry so it is re-materialized on the next launch).

## 5. Localization workflow (in order)

1. **Is the subsystem on?** Check `plugins.enabled` (false means everything is empty).
2. **Look at the plugin.** On its marketplace card or in the manage view, confirm whether the plugin is present and enabled; open its detail view for its source, components, and any warnings.
3. **Classify by presence.** Entirely absent → a source or installation problem (confirm the local source was added and the plugin installed). Present but disabled → check the enable state against the default. Present and enabled but broken at runtime → a component-path problem (pitfall 3) or a session-versus-listing divergence (pitfall 5).
4. **Built-in issues.** Compare the suppressed-built-ins list against what the official marketplace offers, and confirm the plugin cache is current.
5. **Local sources.** Re-check the pasted directory, catalog JSON, relative source paths, and versions (pitfall 2 and pitfall 9); there is no network step to debug.
6. **Session-versus-listing divergence.** If the plugin shows enabled but its capabilities are absent in the session, treat it as a discovery-path problem: confirm the plugin's skills and commands actually appear in the session (Settings → Skills, the `/` menu), not merely that the plugin is enabled.
