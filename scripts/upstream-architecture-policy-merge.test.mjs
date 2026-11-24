import assert from "node:assert/strict";
import test from "node:test";
import { mapPolicyPath, mergePolicies } from "./upstream-architecture-policy-merge.mjs";

test("mapPolicyPath 只映射协议目录段，保留 zcode-cli/zcode-cua 路径", () => {
  assert.equal(
    mapPolicyPath("apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts"),
    "apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/server.ts",
  );
  assert.equal(
    mapPolicyPath("apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transport.ts"),
    "apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/transport.ts",
  );
  assert.equal(mapPolicyPath("packages/zcode-cua/src"), "packages/zcode-cua/src");
  assert.equal(mapPolicyPath("packages/zcode-server-cli/src"), "packages/zcode-server-cli/src");
});

test("mergePolicies 纳入完整模块、延后缺失模块、保留产品同 ID 模块", () => {
  const upstreamPolicy = {
    version: 1,
    modules: [
      { id: "shared", roots: ["packages/shared/src"], managed: true },
      {
        id: "new-module",
        roots: ["packages/shared/src/client-public-api"],
        managed: true,
        requires: ["shared", "missing-module"],
        publicEntrypoints: [
          "packages/shared/src/client-public-api/index.ts",
          "packages/missing/src/index.ts",
        ],
      },
      { id: "missing-module", roots: ["packages/missing/src"], managed: true },
    ],
    global: { maxFileLines: 800 },
    exceptions: [{ rule: "x", paths: ["packages/missing/src"] }],
  };
  const productPolicy = {
    version: 1,
    modules: [{ id: "shared", roots: ["packages/shared/src"], managed: false, requires: [] }],
    global: { maxFileLines: 400 },
    exceptions: [],
  };

  const result = mergePolicies({
    upstreamPolicy,
    productPolicy,
    manageAdded: false,
  });

  assert.deepEqual(result.overlap, ["shared"]);
  assert.deepEqual(result.added, ["new-module"]);
  assert.deepEqual(
    result.deferred.map((module) => module.id),
    ["missing-module"],
  );

  const added = result.policy.modules.find((module) => module.id === "new-module");
  assert.equal(added.managed, false);
  assert.deepEqual(added.requires, ["shared"]);
  assert.deepEqual(added.publicEntrypoints, ["packages/shared/src/client-public-api/index.ts"]);
  assert.equal(result.policy.global.maxFileLines, 800);
  assert.deepEqual(result.policy.exceptions, []);
  assert.deepEqual(result.removedRequires, [
    { module: "new-module", dependency: "missing-module" },
  ]);
  assert.deepEqual(result.removedEntrypoints, [
    { module: "new-module", entry: "packages/missing/src/index.ts" },
  ]);
});

test("manageAdded 可生成启用 managed 的候选", () => {
  const upstreamPolicy = {
    version: 1,
    modules: [
      { id: "new-module", roots: ["packages/shared/src/client-public-api"], managed: true },
    ],
    global: {},
  };
  const productPolicy = { version: 1, modules: [], global: {}, exceptions: [] };
  const result = mergePolicies({ upstreamPolicy, productPolicy, manageAdded: true });
  assert.equal(result.policy.modules[0].managed, true);
});
