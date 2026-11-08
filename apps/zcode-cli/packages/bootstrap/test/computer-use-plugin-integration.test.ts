import assert from "node:assert/strict";
import test from "node:test";
import { KAYINGCODE_PLUGIN_ID_ENV_KEY } from "@zcode/shared";
import { resolveBuiltInNodeReplMcpServers } from "../src/app/built-in-node-repl.js";
import {
  OFFICIAL_CUA_PLUGIN_ID,
  OFFICIAL_PLUGIN_DEFINITIONS,
} from "../src/app/official-plugin-definitions.js";
import { resolvePluginRuntimeFeatures } from "../src/app/plugin-runtime-features.js";
import { omitMcpServers, resolveTrustedOfficialCuaServerNames } from "../src/mcp-config.js";

const directComputerUseServer = {
  type: "stdio",
  command: "kayingcode",
  args: ["__kayingcode-plugin-host", "dist/mcp/server.js"],
  env: { [KAYINGCODE_PLUGIN_ID_ENV_KEY]: OFFICIAL_CUA_PLUGIN_ID },
};

test("Computer Use uses its direct official MCP and does not enable node_repl", () => {
  const plugins = [
    {
      id: OFFICIAL_CUA_PLUGIN_ID,
      enabled: true,
      rootPath: "C:/apps/zcode-cli/packages/kaying-computer-use-plugin",
    },
  ];
  assert.deepEqual(resolvePluginRuntimeFeatures({ plugins } as never), {});
  assert.deepEqual(
    resolveBuiltInNodeReplMcpServers({
      pluginOutcome: { plugins } as never,
      workingDirectory: "C:/workspace",
    }),
    {},
  );
});

test("trusted direct Computer Use server survives MCP filtering", () => {
  const configured = { "plugin:computer-use:computer-use": directComputerUseServer };
  const trusted = resolveTrustedOfficialCuaServerNames(configured, configured);
  assert.deepEqual([...trusted], ["plugin:computer-use:computer-use"]);
  assert.deepEqual(omitMcpServers(configured, new Set(), trusted), configured);
});

test("legacy user-installed Computer Use MCP remains retired", () => {
  const legacy = {
    "computer-use": {
      type: "stdio",
      command: "npx",
      args: ["@kaying-studio/kaying-computer-use", "mcp"],
    },
  };
  assert.deepEqual(omitMcpServers(legacy as never, new Set()), {});
});

test("official definition requires the embedded runtime entry and upstream lock", () => {
  const definition = OFFICIAL_PLUGIN_DEFINITIONS.find(
    (candidate) => candidate.name === "computer-use",
  );
  assert.ok(definition);
  assert.equal(definition.hostMcpServerNames, undefined);
  assert.ok(definition.requiredSeedPaths?.includes("dist/mcp/server.js"));
  assert.ok(definition.requiredSeedPaths?.includes("upstream-lock.json"));
  assert.ok(definition.runtimeTopLevelPaths?.includes("native"));
  assert.ok(definition.runtimeTopLevelPaths?.includes("vendor"));
});
