import type { BridgeSession } from "./bridgeSession.js";
import { ChannelRpcError, Channels } from "./channelClient.js";

export type ModelProviderRecord = Record<string, unknown>;

function checkMutation(result: unknown): void {
  if (typeof result !== "object" || result === null || !("status" in result)) return;
  const status = result.status;
  if (status === "accepted" || status === "noop" || status === "duplicate") return;
  const record = result as Record<string, unknown>;
  throw new Error(String(record.reasonCode ?? record.message ?? status));
}

/** 模型供应商管理；结果以宿主响应为准，不在移动端维护目录副本。 */
export class ChannelModelProviders {
  constructor(private readonly bridge: BridgeSession) {}

  async getAll(): Promise<ModelProviderRecord[]> {
    await this.bridge.waitHealthy();
    const result = await this.bridge.channels.call(Channels.modelProvider, "getAll", []);
    return Array.isArray(result)
      ? result.filter(
          (item): item is ModelProviderRecord =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        )
      : [];
  }

  async save(provider: ModelProviderRecord): Promise<void> {
    await this.bridge.waitHealthy();
    checkMutation(await this.bridge.channels.call(Channels.modelProvider, "save", [provider]));
  }

  async delete(providerId: string): Promise<void> {
    await this.bridge.waitHealthy();
    try {
      checkMutation(
        await this.bridge.channels.call(Channels.modelProvider, "delete", [{ id: providerId }]),
      );
    } catch (error) {
      if (!(error instanceof ChannelRpcError)) throw error;
      checkMutation(
        await this.bridge.channels.call(Channels.modelProvider, "delete", [providerId]),
      );
    }
  }
}
