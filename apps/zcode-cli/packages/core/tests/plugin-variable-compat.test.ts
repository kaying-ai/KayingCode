import { describe, expect, it } from "vitest";
import type { HookInput, HookPluginContext } from "@zcode/contracts";
import {
  createPluginEnvOverlay,
  expandPluginVariables,
} from "../src/hooks/configured-runner-input.js";

const plugin = {
  dataPath: "/data/demo",
  id: "demo@inline",
  name: "demo",
  rootPath: "/plugins/demo",
} satisfies HookPluginContext;

const input = {
  cwd: "/work",
  hookEventName: "PreToolUse",
  sessionId: "session-1",
} as unknown as HookInput;

describe("plugin variable compatibility", () => {
  it("expands upstream ZCODE_* and local KAYINGCODE_* hook variables", () => {
    expect(
      expandPluginVariables(
        [
          "${ZCODE_PLUGIN_ROOT}/upstream.js",
          "${ZCODE_PLUGIN_DATA}/cache",
          "${ZCODE_PROJECT_DIR}",
          "${ZCODE_SESSION_ID}",
          "${KAYINGCODE_PLUGIN_ROOT}/local.js",
          "${KAYINGCODE_PLUGIN_DATA}/cache",
          "${KAYINGCODE_PROJECT_DIR}",
          "${KAYINGCODE_SESSION_ID}",
        ].join("|"),
        plugin,
        input,
        "/work",
      ),
    ).toBe(
      [
        "/plugins/demo/upstream.js",
        "/data/demo/cache",
        "/work",
        "session-1",
        "/plugins/demo/local.js",
        "/data/demo/cache",
        "/work",
        "session-1",
      ].join("|"),
    );
  });

  it("writes both identity variable families into the hook environment", () => {
    const { set } = createPluginEnvOverlay(plugin, input, "/work");

    expect(set).toMatchObject({
      ZCODE_PLUGIN_DATA: "/data/demo",
      ZCODE_PLUGIN_ID: "demo@inline",
      ZCODE_PLUGIN_NAME: "demo",
      ZCODE_PLUGIN_ROOT: "/plugins/demo",
      KAYINGCODE_PLUGIN_DATA: "/data/demo",
      KAYINGCODE_PLUGIN_ID: "demo@inline",
      KAYINGCODE_PLUGIN_NAME: "demo",
      KAYINGCODE_PLUGIN_ROOT: "/plugins/demo",
    });
  });

  it("rejects a skill directory variable in hook context for both families", () => {
    expect(() => expandPluginVariables("${ZCODE_SKILL_DIR}", plugin, input, "/work")).toThrow(
      "Hook variable requires a skill context: ZCODE_SKILL_DIR",
    );
    expect(() =>
      expandPluginVariables("${KAYINGCODE_SKILL_DIR}", plugin, input, "/work"),
    ).toThrow("Hook variable requires a skill context: KAYINGCODE_SKILL_DIR");
  });
});
