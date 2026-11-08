import assert from "node:assert/strict";
import { test } from "vitest";
import {
  LOCALRUN_FEATURES,
  isLocalrunFeatureEnabled,
  localrunFeatureUnavailableError,
} from "../src/localrun.js";

test("localrun 默认关闭全部官方能力", () => {
  for (const feature of Object.keys(LOCALRUN_FEATURES) as Array<keyof typeof LOCALRUN_FEATURES>) {
    assert.equal(isLocalrunFeatureEnabled(feature), false, feature);
  }
});

test("关闭的官方能力返回统一的 feature_disabled 错误", () => {
  const error = localrunFeatureUnavailableError("oauthLogin") as Error & { kind?: string };
  assert.equal(error.kind, "feature_disabled");
  assert.match(error.message, /oauthLogin/u);
});
