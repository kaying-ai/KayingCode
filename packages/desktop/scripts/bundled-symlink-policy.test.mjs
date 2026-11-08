import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertNoInvalidBundledSymlinks,
  findInvalidBundledSymlinks,
} from "./bundled-symlink-policy.mjs";

async function createAppBundle() {
  const appRoot = await mkdtemp(join(tmpdir(), "kayingcode-symlink-policy-"));
  await mkdir(join(appRoot, "Contents", "MacOS"), { recursive: true });
  await mkdir(join(appRoot, "Contents", "Resources", "vendor", "inner"), { recursive: true });
  await writeFile(join(appRoot, "Contents", "MacOS", "KayingCode"), "binary");
  await writeFile(join(appRoot, "Contents", "Resources", "vendor", "inner", "tool"), "tool");
  return appRoot;
}

test("findInvalidBundledSymlinks accepts a bundle without symlinks", async () => {
  const appRoot = await createAppBundle();
  try {
    assert.deepEqual(findInvalidBundledSymlinks(appRoot), []);
    assertNoInvalidBundledSymlinks(appRoot);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test("findInvalidBundledSymlinks accepts relative symlinks that stay inside the bundle", async () => {
  const appRoot = await createAppBundle();
  try {
    await symlink(
      join("vendor", "inner", "tool"),
      join(appRoot, "Contents", "Resources", "tool-link"),
    );

    assert.deepEqual(findInvalidBundledSymlinks(appRoot), []);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test("findInvalidBundledSymlinks rejects absolute symlinks", async () => {
  const appRoot = await createAppBundle();
  try {
    await symlink(
      "/Users/builder/workspace/some-build-output",
      join(appRoot, "Contents", "Resources", "release"),
    );

    const invalid = findInvalidBundledSymlinks(appRoot);
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].reason, "absolute");
    assert.throws(() => assertNoInvalidBundledSymlinks(appRoot), /非法符号链接.*absolute/su);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test("findInvalidBundledSymlinks rejects symlinks escaping the bundle root", async () => {
  const appRoot = await createAppBundle();
  try {
    // Resources 位于 <appRoot>/Contents/Resources，三级向上才落到 bundle 根之外。
    await symlink("../../../outside.txt", join(appRoot, "Contents", "Resources", "escape-link"));

    const invalid = findInvalidBundledSymlinks(appRoot);
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].reason, "escapes-bundle");
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test("findInvalidBundledSymlinks rejects dangling symlinks", async () => {
  const appRoot = await createAppBundle();
  try {
    await symlink(
      join("vendor", "missing"),
      join(appRoot, "Contents", "Resources", "dangling-link"),
    );

    const invalid = findInvalidBundledSymlinks(appRoot);
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].reason, "dangling");
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});
