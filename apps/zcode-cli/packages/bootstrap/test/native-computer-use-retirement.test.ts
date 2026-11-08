import assert from "node:assert/strict";
import test from "node:test";
import { omitMcpServers, resolveTrustedOfficialCuaServerNames } from "../src/mcp-config.js";
import {
  KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID,
  KAYINGCODE_PLUGIN_ID_ENV_KEY,
  buildKayingCodeToolEnvPassthroughEnv,
  readKayingCodeToolEnvPassthroughEnv,
  sanitizeKayingCodeRuntimeEnv,
} from "@zcode/shared";

test("retired Helper credentials cannot be restored through tool environment passthrough", () => {
  const retiredKeys = [
    "KAYINGCODE_CUA_PERMISSION_BROKER_SOCKET",
    "KAYINGCODE_CUA_PERMISSION_BROKER_TOKEN",
    "KAYINGCODE_CUA_PERMISSION_BROKER_REFRESH_MARKER",
    "KAYINGCODE_CUA_PLUGIN_AUTHORITY",
  ];
  const env = Object.fromEntries(retiredKeys.map((key) => [key, "retired-test-value"]));
  const sanitized = sanitizeKayingCodeRuntimeEnv(env);
  const passthrough = readKayingCodeToolEnvPassthroughEnv(
    buildKayingCodeToolEnvPassthroughEnv(env),
  );
  for (const key of retiredKeys) {
    assert.equal(sanitized[key], undefined);
    assert.equal(passthrough[key], undefined);
  }
});

test("native permission authority requires trusted in-memory registration", () => {
  const server = {
    type: "stdio" as const,
    command: "native-server",
    env: { [KAYINGCODE_PLUGIN_ID_ENV_KEY]: KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID },
  };
  assert.deepEqual([...resolveTrustedOfficialCuaServerNames({ native: server }, {})], []);
  assert.deepEqual(
    [...resolveTrustedOfficialCuaServerNames({ native: server }, { native: server })],
    ["native"],
  );
  assert.deepEqual(
    [...resolveTrustedOfficialCuaServerNames({ native: { ...server } }, { native: server })],
    [],
  );
});

test("MCP filtering preserves the native plugin and never injects old broker credentials", () => {
  const native = {
    type: "stdio" as const,
    command: "native-server",
    env: { [KAYINGCODE_PLUGIN_ID_ENV_KEY]: KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID },
  };
  const js = { type: "stdio" as const, command: "node", args: ["server.js"] };
  const kept = omitMcpServers(
    { native, node_repl: js, old: { type: "stdio", command: "kayingcode-cua" } },
    new Set(),
    new Set(["native"]),
  );
  assert.equal(kept.native, native);
  assert.equal(kept.node_repl, js);
  assert.equal(kept.old, undefined);
  assert.equal(kept.node_repl?.type === "stdio" ? kept.node_repl.env : undefined, undefined);
});
