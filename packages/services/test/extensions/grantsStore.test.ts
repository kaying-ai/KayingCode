import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionStaticTable } from "@zcode/shared/extension-host";
import { describe, expect, it, vi } from "vitest";
import { createGrantsStore } from "../../src/extensions/grantsStore.js";

const PLUGIN_ID = "demo@inline";
const logger = { info: vi.fn(), warn: vi.fn() };

function staticTable(grants: Array<"sessions.read" | "sessions.write" | "notifications">) {
  return {
    rev: 1,
    plugins: [
      {
        pluginId: PLUGIN_ID,
        name: "Demo",
        version: "1.2.0",
        extension: {
          state: "ok",
          activationEvents: [],
          commands: [],
          views: [],
          grants,
          protocols: { sessions: 1 },
        },
        slotItems: [],
        problems: [],
        ignored: [],
      },
    ],
  } satisfies ExtensionStaticTable;
}

async function withStore(
  run: (store: ReturnType<typeof createGrantsStore>) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "kayingcode-grants-"));
  const store = createGrantsStore({
    filePath: join(dir, "grants.json"),
    logger,
    now: () => 1000,
  });
  try {
    await store.ready;
    await run(store);
  } finally {
    store.dispose();
    await rm(dir, { recursive: true, force: true });
  }
}

describe("extension grants store", () => {
  it("grants only the tiers declared by the current manifest", async () => {
    await withStore(async (store) => {
      store.reconcile(staticTable(["sessions.write", "notifications"]));

      await expect(store.grant(PLUGIN_ID, ["sessions.write", "sessions.fullAccess"])).rejects.toThrow(
        "does not match",
      );
      expect(store.covers(PLUGIN_ID, "sessions.write")).toBe(false);

      await expect(store.grant(PLUGIN_ID, ["sessions.write", "notifications"])).resolves.toEqual([
        "sessions.write",
        "notifications",
      ]);
      expect(store.covers(PLUGIN_ID, "sessions.read")).toBe(true);
      expect(store.covers(PLUGIN_ID, "sessions.write")).toBe(true);
      expect(store.covers(PLUGIN_ID, "notifications")).toBe(true);
      expect(store.holders()).toEqual([
        { pluginId: PLUGIN_ID, name: "Demo", granted: ["sessions.write"] },
      ]);
    });
  });

  it("returns to needs-consent when the manifest declares more tiers", async () => {
    await withStore(async (store) => {
      store.reconcile(staticTable(["sessions.read"]));
      await store.grant(PLUGIN_ID, ["sessions.read"]);

      const changed = store.reconcile(staticTable(["sessions.read", "sessions.write"]));

      // 声明变多后该插件回到待授权，生效档位从 read 收窄为空，调用方据此中止在途调用。
      expect(changed).toEqual([PLUGIN_ID]);
      expect(store.covers(PLUGIN_ID, "sessions.read")).toBe(false);
      expect(store.snapshot().plugins[0]).toMatchObject({
        pluginId: PLUGIN_ID,
        declared: ["sessions.read", "sessions.write"],
        status: "needs-consent",
      });
    });
  });

  it("revokes the record and reports the removed tiers", async () => {
    await withStore(async (store) => {
      store.reconcile(staticTable(["sessions.read"]));
      await store.grant(PLUGIN_ID, ["sessions.read"]);

      await expect(store.revoke(PLUGIN_ID)).resolves.toEqual(["sessions.read"]);
      expect(store.covers(PLUGIN_ID, "sessions.read")).toBe(false);
      expect(store.holders()).toEqual([]);
    });
  });
});
