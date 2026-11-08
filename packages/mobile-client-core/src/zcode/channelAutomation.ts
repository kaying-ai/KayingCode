import type { RelayWorkspaceTarget } from "../relayWorkspaceTarget.js";
import type { BridgeSession } from "./bridgeSession.js";
import { Channels } from "./channelClient.js";

export type AutomationRecord = Record<string, unknown>;

function records(value: unknown): AutomationRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is AutomationRecord =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

/** ZCode 自动化 RPC；权威列表在宿主，实例不缓存数据。 */
export class ChannelAutomation {
  constructor(
    private readonly bridge: BridgeSession,
    private readonly workspace: RelayWorkspaceTarget,
  ) {}

  private get scope(): Record<string, string> {
    return {
      workspacePath: this.workspace.workspacePath,
      ...(this.workspace.workspaceIdentity
        ? { workspaceIdentity: this.workspace.workspaceIdentity }
        : {}),
    };
  }

  private async agent(method: string, extra: AutomationRecord = {}): Promise<unknown> {
    await this.bridge.waitHealthy();
    return this.bridge.channels.call(Channels.zcodeAgent, method, [{ ...this.scope, ...extra }]);
  }

  async list(): Promise<AutomationRecord[]> {
    return records(await this.agent("listAutomations"));
  }

  async runs(automationId: string): Promise<AutomationRecord[]> {
    return records(await this.agent("listAutomationRuns", { automationId }));
  }

  async setEnabled(automationId: string, enabled: boolean): Promise<void> {
    await this.agent("setAutomationEnabled", { automationId, enabled });
  }

  async delete(automationId: string): Promise<void> {
    await this.agent("deleteAutomation", { automationId });
  }

  async runNow(automationId: string): Promise<string> {
    const result = await this.agent("runAutomationNow", { automationId });
    if (typeof result === "object" && result !== null && "status" in result) {
      return String(result.status);
    }
    return "queued";
  }

  async restart(automationId: string): Promise<void> {
    await this.agent("restartAutomation", { automationId });
  }

  async create(input: { title: string; cronExpr: string; prompt: string }): Promise<void> {
    await this.agent("createAutomation", input);
  }

  async update(input: {
    automationId: string;
    title?: string;
    cronExpr?: string;
    prompt?: string;
  }): Promise<void> {
    await this.agent("updateAutomation", input);
  }

  async offPeakQueue(): Promise<AutomationRecord[]> {
    await this.bridge.waitHealthy();
    return records(
      await this.bridge.channels.call(Channels.offPeakTask, "list", [this.scope], 8_000),
    );
  }
}
