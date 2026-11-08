import { describe, expect, it, vi } from "vitest";
import { runStartupReconnectBatch } from "../src/host/sourceServerStartupReconnect.js";

describe("runStartupReconnectBatch", () => {
  it("关闭启动自动重连时连候选枚举都不执行", async () => {
    const listCandidates = vi.fn(async () => ["a"]);
    const reconnect = vi.fn(async (candidates: string[]) => candidates);
    const results = await runStartupReconnectBatch({
      getSettings: async () => ({ remoteStartupAutoReconnectEnabled: false }),
      listCandidates,
      reconnect,
    });
    expect(results).toEqual([]);
    expect(listCandidates).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("旧设置缺字段时视为开启，保持现行为", async () => {
    const reconnect = vi.fn(async (candidates: string[]) => candidates.map((id) => `ok:${id}`));
    const results = await runStartupReconnectBatch({
      getSettings: async () => ({}),
      listCandidates: async () => ["a", "b"],
      reconnect,
    });
    expect(results).toEqual(["ok:a", "ok:b"]);
    expect(reconnect).toHaveBeenCalledWith(["a", "b"]);
  });

  it("显式开启时执行候选枚举与重连", async () => {
    const results = await runStartupReconnectBatch({
      getSettings: async () => ({ remoteStartupAutoReconnectEnabled: true }),
      listCandidates: async () => [1],
      reconnect: async (candidates) => candidates.map((value) => value * 2),
    });
    expect(results).toEqual([2]);
  });
});
