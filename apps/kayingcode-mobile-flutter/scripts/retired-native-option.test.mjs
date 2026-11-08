import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const [script, args] of [
  ["flutter-target.mjs", ["android", "release"]],
  ["build-android-apk.mjs", ["release"]],
  ["build-ohos.mjs", ["release"]],
]) {
  test(`${script} rejects retired native mode before touching SDK or artifacts`, () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL(script, import.meta.url)), ...args, "--native-kayingcode"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /原生 KayingCode 已退役/);
    assert.doesNotMatch(result.stderr, /ENOENT|SDK.*不存在/);
  });
}
