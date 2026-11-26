import { describe, expect, it, vi } from "vitest";
import {
  supportsHistoryFirst,
  supportsPluginDiscoveryUi,
} from "../src/kayingcode-agent/independentPlanSupport.js";

function capabilityClient(result: () => Promise<unknown>) {
  const request = vi.fn(result);
  return { client: { request } as never, request };
}

describe("plugin discovery capability probe", () => {
  it("reports false when the CLI does not advertise the capability", async () => {
    const { client, request } = capabilityClient(async () => ({ historyFirst: true }));

    await expect(supportsPluginDiscoveryUi(client)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reports true only when runtime capabilities explicitly advertise it", async () => {
    const { client } = capabilityClient(async () => ({ pluginDiscoveryUi: true }));

    await expect(supportsPluginDiscoveryUi(client)).resolves.toBe(true);
  });

  it("fails closed and retries after a probe error", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("proto.unsupported"))
      .mockResolvedValueOnce({ pluginDiscoveryUi: true });
    const client = { request } as never;

    await expect(supportsPluginDiscoveryUi(client)).resolves.toBe(false);
    await expect(supportsPluginDiscoveryUi(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("shares one capability probe across incremental capabilities", async () => {
    const { client, request } = capabilityClient(async () => ({
      pluginDiscoveryUi: true,
      historyFirst: true,
    }));

    await expect(supportsPluginDiscoveryUi(client)).resolves.toBe(true);
    await expect(supportsHistoryFirst(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
