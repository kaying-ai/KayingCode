import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { discoverNodePluginsSync } from "@zcode/adapters/plugins";
import { KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE } from "@zcode/contracts";
import { KAYINGCODE_PLUGIN_ID_ENV_KEY } from "@zcode/shared";
import { resolveTapMakerManagementServer } from "../src/kayingcode-protocol/tapmaker-projects.js";

const pluginId = `kaying-for-taptap@${KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE}`;
const pluginRoot = resolve(import.meta.dirname, "../../../apps/zcode-cli/packages/kaying-for-taptap-plugin");

test("actual builtin Maker stdio has no official auth and remains selectable", async () => {
  const root = await mkdtemp(join(tmpdir(), "tapmaker-discovery-"));
  try {
    const request = {
      config: {
        dirs: [],
        enabled: true,
        enabledPlugins: {},
        options: {},
        suppressedBuiltins: [],
        extraKnownMarketplaces: {},
      },
      officialPluginRoots: [pluginRoot],
      officialPluginsEnabledByDefault: new Set([pluginId]),
      storageRoot: root,
      workingDirectory: root,
      env: {},
    };
    const outcome = discoverNodePluginsSync(request);
    const entry = resolveTapMakerManagementServer(outcome.mcpServers);
    assert.ok(entry);
    const [name, config] = entry;
    assert.equal(name, "plugin:kaying-for-taptap:kaying_for_taptap");
    assert.equal(config.official, undefined);
    assert.equal(config.env?.[KAYINGCODE_PLUGIN_ID_ENV_KEY], pluginId);
    assert.equal(config.source?.kind, "builtin");

    const disabled = discoverNodePluginsSync({
      ...request,
      config: { ...request.config, enabledPlugins: { [pluginId]: false } },
    });
    assert.equal(resolveTapMakerManagementServer(disabled.mcpServers), undefined);
    const suppressed = discoverNodePluginsSync({
      ...request,
      config: { ...request.config, suppressedBuiltins: [pluginId] },
    });
    assert.equal(resolveTapMakerManagementServer(suppressed.mcpServers), undefined);

    assert.equal(
      resolveTapMakerManagementServer({ [name]: { ...config, source: { kind: "plugin" } } }),
      undefined,
    );
    assert.equal(
      resolveTapMakerManagementServer({ [name]: { ...config, enabled: false } }),
      undefined,
    );
    assert.equal(resolveTapMakerManagementServer({ [name]: { ...config, env: {} } }), undefined);
    assert.equal(resolveTapMakerManagementServer({ impostor: config }), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
