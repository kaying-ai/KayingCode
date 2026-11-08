import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkSourceLayout } from "./check-source-layout.mjs";

async function workspace(run) {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-layout-"));
  async function json(file, value) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), JSON.stringify(value));
  }
  try {
    for (const directory of ["apps", "packages", "plugins", "tools"])
      await mkdir(join(root, directory));
    await json("package.json", {
      packageManager: "bun@1.3.14",
      workspaces: ["apps/*", "packages/*", "plugins/*", "tools/*"],
    });
    await writeFile(join(root, "bun.lock"), "{}");
    await run(root, json);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts shared packages, resource plugins, vendor and non-TS Flutter", async () => {
  await workspace(async (root, json) => {
    await json("packages/core/package.json", { name: "core" });
    await json("apps/cli/package.json", {
      name: "cli",
      dependencies: { core: "workspace:*" },
      scripts: { build: "node scripts/build.mjs" },
    });
    await json("apps/zcode-cli/packages/pdf-plugin/package.json", { name: "pdf" });
    await json("apps/zcode-cli/packages/pdf-plugin/vendor/library/package.json", {
      name: "core",
      packageManager: "npm@10",
    });
    await mkdir(join(root, "apps/flutter"));
    assert.deepEqual(await checkSourceLayout(root), { errors: [], packages: 3 });
  });
});

test("rejects missing registration, legacy commands and split workspace configuration", async () => {
  await workspace(async (root, json) => {
    await json("package.json", { packageManager: "bun@1.3.14", workspaces: ["apps/*"] });
    await json("apps/cli/package.json", {
      name: "cli",
      packageManager: "pnpm@10",
      workspaces: ["packages/*"],
      scripts: { build: "pnpm build" },
    });
    const { errors } = await checkSourceLayout(root);
    assert.ok(errors.some((error) => error.includes("root workspaces")));
    assert.ok(errors.some((error) => error.includes("only the root")));
    assert.ok(errors.some((error) => error.includes("nested workspaces")));
    assert.ok(errors.some((error) => error.includes("scripts.build")));
  });
});

test("rejects duplicate names and unresolved workspace dependency", async () => {
  await workspace(async (root, json) => {
    await json("packages/core/package.json", { name: "core" });
    await json("apps/cli/package.json", { name: "core", dependencies: { absent: "workspace:*" } });
    const { errors } = await checkSourceLayout(root);
    assert.ok(errors.some((error) => error.includes("duplicate package name")));
    assert.ok(errors.some((error) => error.includes("unknown workspace dependency absent")));
  });
});

test("rejects restored source roots and obsolete build cache inputs", async () => {
  await workspace(async (root, json) => {
    await json("packages/desktop/package.json", { name: "desktop" });
    await json("turbo.json", { tasks: { build: { inputs: ["$TURBO_ROOT$/pnpm-lock.yaml"] } } });
    const { errors } = await checkSourceLayout(root);
    assert.ok(errors.some((error) => error.includes("obsolete source/workspace entry")));
    assert.ok(errors.some((error) => error.includes("stale lockfile input")));
  });
});

test("rejects the retired legacy CUA package even when registered", async () => {
  await workspace(async (root, json) => {
    await json("packages/kayingcode-cua/package.json", { name: "@kayingcode/cua" });
    const { errors } = await checkSourceLayout(root);
    assert.ok(errors.some((error) => error.includes("obsolete source/workspace entry")));
  });
});

test("rejects renamed legacy CUA packages and non-workspace dependencies", async () => {
  await workspace(async (root, json) => {
    await json("packages/legacy-cua/package.json", { name: "@kayingcode/cua" });
    await json("apps/cli/package.json", {
      name: "cli",
      dependencies: { "@kayingcode/cua": "0.6.3" },
    });
    const { errors } = await checkSourceLayout(root);
    assert.ok(errors.some((error) => error.includes("retired package")));
    assert.ok(errors.some((error) => error.includes("retired dependency")));
  });
});
