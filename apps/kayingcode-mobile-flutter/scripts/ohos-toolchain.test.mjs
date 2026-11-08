import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { sep, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspectDevecoSdk } from "./ohos-toolchain.mjs";

const buildRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "build");

async function fixture(t, api, layout = "studio", includeHvigor = true) {
  await mkdir(buildRoot, { recursive: true });
  const root = await mkdtemp(join(buildRoot, "toolchain-fixture-"));
  t.after(async () => {
    const target = await realpath(root);
    const allowed = await realpath(buildRoot);
    if (!target.startsWith(`${allowed}${sep}`)) throw new Error(`测试清理路径越界：${target}`);
    await rm(target, { recursive: true });
  });
  const sdk = join(root, "sdk");
  const defaultSdk = join(sdk, "default");
  const hdcDir = join(defaultSdk, "openharmony", "toolchains");
  const ohpmDir = layout === "studio" ? join(root, "tools", "ohpm", "bin") : join(root, "bin");
  const hvigorDir = layout === "studio" ? join(root, "tools", "hvigor", "bin") : join(root, "bin");
  await Promise.all([
    mkdir(hdcDir, { recursive: true }),
    mkdir(ohpmDir, { recursive: true }),
    mkdir(hvigorDir, { recursive: true }),
  ]);
  await writeFile(
    join(defaultSdk, "sdk-pkg.json"),
    JSON.stringify({ data: { apiVersion: String(api) } }),
  );
  await writeFile(join(ohpmDir, process.platform === "win32" ? "ohpm.bat" : "ohpm"), "");
  if (includeHvigor)
    await writeFile(join(hvigorDir, process.platform === "win32" ? "hvigorw.bat" : "hvigorw"), "");
  await writeFile(join(hdcDir, process.platform === "win32" ? "hdc.exe" : "hdc"), "");
  return { sdk, root, ohpmDir, hvigorDir, hdcDir };
}

test("API 26 使用所选 Studio 的工具目录", async (t) => {
  const expected = await fixture(t, 26);
  const selected = await inspectDevecoSdk(expected.sdk, [21, 26]);
  assert.equal(selected.api, 26);
  assert.deepEqual(selected.toolDirs, [expected.ohpmDir, expected.hvigorDir, expected.hdcDir]);
  assert.ok(selected.toolDirs.every((dir) => dir.startsWith(`${expected.root}${sep}`)));
});

test("API 21 支持 Command Line Tools 的 bin 目录", async (t) => {
  const expected = await fixture(t, 21, "command-line");
  const selected = await inspectDevecoSdk(expected.sdk, [21, 26]);
  assert.deepEqual(selected.toolDirs, [expected.ohpmDir, expected.hdcDir]);
});

test("已知不兼容的 API 23 在构建前被拒绝", async (t) => {
  const expected = await fixture(t, 23);
  await assert.rejects(inspectDevecoSdk(expected.sdk, [21, 26]), /API 23.*不兼容/);
});

test("所选 SDK 缺工具时不回退到系统 PATH", async (t) => {
  const expected = await fixture(t, 26, "studio", false);
  await assert.rejects(inspectDevecoSdk(expected.sdk, [21, 26]), /缺少配套的 ohpm、hvigorw 或 hdc/);
});
