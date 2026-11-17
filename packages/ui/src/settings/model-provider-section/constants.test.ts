import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveLoginApiKeyProviderId } from "@/login/LoginApiKeyForm.helpers.js";
import { PRESET_PROVIDER_IDS, PRESET_PROVIDER_SPECS } from "./constants.js";

test("模型设置预设入口指向 localrun 的 API Key Provider", () => {
  assert.deepEqual(
    PRESET_PROVIDER_SPECS.map((spec) => [spec.id, spec.displayName]),
    [
      [PRESET_PROVIDER_IDS.zai, "Z.ai"],
      [PRESET_PROVIDER_IDS.bigmodel, "BigModel"],
    ],
  );
  assert.equal(resolveLoginApiKeyProviderId("zai"), PRESET_PROVIDER_IDS.zai);
  assert.equal(resolveLoginApiKeyProviderId("bigmodel"), PRESET_PROVIDER_IDS.bigmodel);
});

test("预设 Provider ID 与内置配置约定一致", () => {
  assert.deepEqual(PRESET_PROVIDER_IDS, {
    zai: "zai-standard-api",
    bigmodel: "bigmodel-standard-api",
  });
});
