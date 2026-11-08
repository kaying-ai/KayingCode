import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  addMarketplace,
  comparePluginUpdate,
  installMarketplacePlugin,
  listInstalledPluginRecords,
  loadKnownMarketplacesSync,
  loadMarketplaceManifestSync,
  updateMarketplace,
} from "../src/plugins/index.js";

const MARKETPLACE_ID = "test-local-market";
const PLUGIN_NAME = "demo-plugin";

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeLocalMarketplaceTree(rootDir: string, version: string): void {
  writeJson(join(rootDir, "marketplace.json"), {
    name: MARKETPLACE_ID,
    plugins: [
      {
        name: PLUGIN_NAME,
        version,
        source: `./plugins/${PLUGIN_NAME}`,
      },
    ],
  });
  const pluginRoot = join(rootDir, "plugins", PLUGIN_NAME);
  mkdirSync(join(pluginRoot, ".kayingcode-plugin"), { recursive: true });
  writeJson(join(pluginRoot, ".kayingcode-plugin", "plugin.json"), {
    name: PLUGIN_NAME,
    version,
  });
  mkdirSync(join(pluginRoot, "skills", "hello"), { recursive: true });
  writeFileSync(
    join(pluginRoot, "skills", "hello", "SKILL.md"),
    "---\nname: hello\ndescription: demo\n---\n\n# hello\n",
  );
}

function createStorageRoot(): { storageRoot: string; cleanup: () => void } {
  const storageRoot = mkdtempSync(join(tmpdir(), "kayingcode-local-market-refresh-"));
  return {
    storageRoot,
    cleanup: () => rmSync(storageRoot, { recursive: true, force: true }),
  };
}

function readCatalogEntryVersion(storageRoot: string): string | undefined {
  const manifest = loadMarketplaceManifestSync(storageRoot, MARKETPLACE_ID);
  return manifest?.plugins.find((entry) => entry.name === PLUGIN_NAME)?.version;
}

test("updateMarketplace 重读本地 directory 源，检出 bump 后的目录版本", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "kayingcode-local-market-src-"));
  const { storageRoot, cleanup } = createStorageRoot();
  try {
    writeLocalMarketplaceTree(sourceRoot, "1.0.0");
    await addMarketplace({
      source: { source: "directory", path: sourceRoot },
      storageRoot,
    });
    assert.equal(readCatalogEntryVersion(storageRoot), "1.0.0");

    // 用户在本地源同时 bump marketplace 条目与 plugin.json 版本。
    writeLocalMarketplaceTree(sourceRoot, "1.1.0");
    const refreshed = await updateMarketplace({
      marketplace: MARKETPLACE_ID,
      storageRoot,
    });

    assert.equal(readCatalogEntryVersion(storageRoot), "1.1.0");
    assert.equal(refreshed.find((record) => record.id === MARKETPLACE_ID)?.pluginCount, 1);
    assert.equal(
      refreshed.find((record) => record.id === MARKETPLACE_ID)?.lastRefreshFailure,
      undefined,
    );
  } finally {
    cleanup();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test("本地源 bump 后，updateMarketplace 使 comparePluginUpdate 判为 update-available", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "kayingcode-local-market-src-"));
  const { storageRoot, cleanup } = createStorageRoot();
  try {
    writeLocalMarketplaceTree(sourceRoot, "1.0.0");
    await addMarketplace({
      source: { source: "directory", path: sourceRoot },
      storageRoot,
    });
    await installMarketplacePlugin({
      marketplace: MARKETPLACE_ID,
      name: PLUGIN_NAME,
      storageRoot,
    });

    const before = listInstalledPluginRecords(storageRoot).find(
      (record) => record.id === `${PLUGIN_NAME}@${MARKETPLACE_ID}`,
    );
    assert.ok(before);
    assert.equal(before.version, "1.0.0");

    writeLocalMarketplaceTree(sourceRoot, "1.2.0");
    await updateMarketplace({ marketplace: MARKETPLACE_ID, storageRoot });

    const latestVersion = readCatalogEntryVersion(storageRoot);
    const status = comparePluginUpdate({
      installedVersion: before.version,
      installedSha: undefined,
      latestVersion,
      latestSha: undefined,
    });
    assert.equal(latestVersion, "1.2.0");
    assert.equal(status, "update-available");
  } finally {
    cleanup();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test("updateMarketplace 跳过 builtin://local 虚拟源且不报错", async () => {
  const { storageRoot, cleanup } = createStorageRoot();
  try {
    writeJson(join(storageRoot, "known_marketplaces.json"), {
      version: 1,
      marketplaces: [
        {
          id: "kayingcode-plugins-official",
          name: "kayingcode-plugins-builtin",
          source: { source: "file", path: "builtin://local" },
          addedAt: "2026-01-01T00:00:00.000Z",
          pluginCount: 0,
        },
      ],
    });
    const refreshed = await updateMarketplace({ storageRoot });
    assert.equal(refreshed.length, 1);
    assert.equal(refreshed[0]?.lastRefreshFailure, undefined);
  } finally {
    cleanup();
  }
});

test("本地源缺失时 updateMarketplace 保留旧快照并记 lastRefreshFailure", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "kayingcode-local-market-src-"));
  const { storageRoot, cleanup } = createStorageRoot();
  try {
    writeLocalMarketplaceTree(sourceRoot, "1.0.0");
    await addMarketplace({
      source: { source: "directory", path: sourceRoot },
      storageRoot,
    });
    rmSync(sourceRoot, { recursive: true, force: true });

    const refreshed = await updateMarketplace({
      marketplace: MARKETPLACE_ID,
      storageRoot,
    });
    assert.equal(readCatalogEntryVersion(storageRoot), "1.0.0");
    const record = refreshed.find((item) => item.id === MARKETPLACE_ID);
    assert.ok(record?.lastRefreshFailure);
    assert.equal(record.lastRefreshFailure.code, "plugin_marketplace_invalid");
    assert.ok(record.lastRefreshFailure.message.length > 0);
  } finally {
    cleanup();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test("刷新成功后清除历史 lastRefreshFailure", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "kayingcode-local-market-src-"));
  const { storageRoot, cleanup } = createStorageRoot();
  try {
    writeLocalMarketplaceTree(sourceRoot, "1.0.0");
    await addMarketplace({
      source: { source: "directory", path: sourceRoot },
      storageRoot,
    });
    rmSync(sourceRoot, { recursive: true, force: true });
    await updateMarketplace({ marketplace: MARKETPLACE_ID, storageRoot });
    assert.ok(
      loadKnownMarketplacesSync(storageRoot).find((item) => item.id === MARKETPLACE_ID)
        ?.lastRefreshFailure,
    );

    writeLocalMarketplaceTree(sourceRoot, "1.0.1");
    const refreshed = await updateMarketplace({
      marketplace: MARKETPLACE_ID,
      storageRoot,
    });
    assert.equal(
      refreshed.find((item) => item.id === MARKETPLACE_ID)?.lastRefreshFailure,
      undefined,
    );
    assert.equal(readCatalogEntryVersion(storageRoot), "1.0.1");
  } finally {
    cleanup();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
});
