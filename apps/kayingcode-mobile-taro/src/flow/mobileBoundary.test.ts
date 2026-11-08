import assert from "node:assert/strict";
import test from "node:test";
import { getZcodeWebUrl } from "./zcodeWeb";
import { addAccountFromInput, forceAddAccountFromInput } from "./session";
const url = "https://example.test/remote/v4?sid=test&app_version=3.17.2";
test("移动壳拒绝 ZCode 链接与旧档案，不能回退原生连接", () => {
  assert.deepEqual(addAccountFromInput(url), { status: "invalid" });
  assert.equal(forceAddAccountFromInput(url), null);
  assert.equal(
    getZcodeWebUrl({
      id: "old",
      label: "old",
      backendType: "zcode",
      url,
      addedAt: 0,
      lastUsedAt: null,
    }),
    null,
  );
});
