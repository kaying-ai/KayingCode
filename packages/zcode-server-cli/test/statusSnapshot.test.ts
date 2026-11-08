import { mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createStatusPersister } from "../src/runtime/statusSnapshot.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

describe("status snapshot persistence", () => {
  it("preserves a stopped snapshot across a transient Windows rename lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "status-lock-"));
    const file = join(root, "status.json");
    const errors = vi.fn();
    try {
      const persist = createStatusPersister(
        file,
        () => ({ state: "stopped" }),
        errors,
        async () => true,
      );
      // 模拟读句柄短暂占用，不能静默丢掉生命周期结束快照。
      vi.mocked(rename).mockRejectedValueOnce(
        Object.assign(new Error("locked"), { code: "EPERM" }),
      );
      await persist();
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ state: "stopped" });
      expect(errors).not.toHaveBeenCalled();
      expect(await readdir(root)).toEqual(["status.json"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a permanent write failure and still admits the next snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "status-recovery-"));
    const file = join(root, "status.json");
    const errors = vi.fn();
    try {
      const persist = createStatusPersister(
        file,
        () => ({ state: "ready" }),
        errors,
        async () => true,
      );
      const failure = Object.assign(new Error("disk failure"), { code: "EIO" });
      vi.mocked(rename).mockRejectedValueOnce(failure);
      await persist();
      expect(errors).toHaveBeenCalledWith(failure);
      expect(await readdir(root)).toEqual([]);
      await persist();
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ state: "ready" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
