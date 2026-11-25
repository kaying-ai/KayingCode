import { describe, expect, it } from "vitest";
import { PLUGIN_DISCOVERY_INPUT } from "@zcode/contracts";
import { commandEnvelopeSchema, type CommandEnvelope } from "@zcode/shared/kayingcode-protocol-v4";
import {
  inputIntentMetadata,
  inputIntentMetadataFromCanonical,
} from "../src/kayingcode-protocol-v4/commands/input-intent.js";
import { ConversationTopicPublisher } from "../src/kayingcode-protocol-v4/conversation-topic-publisher.js";

// 对齐上游 plugin-discovery-session-support.test.ts：能力位只留在发起输入上，
// 不进入 JSON 历史，也不从 canonical 重建中继承。
describe("plugin discovery input admission", () => {
  it.each(["createSession", "sendText"] as const)(
    "keeps %s support on the initiating input only",
    (type) => {
      const command: CommandEnvelope = {
        type,
        commandId: "cmd",
        sessionId: type === "createSession" ? null : "s",
        issuedAt: 0,
        clientId: "app",
        payload: {},
      };
      const options = { text: "mail", requestedDelivery: "startNow" as const };
      const supported = inputIntentMetadata({ ...command, pluginDiscoveryUi: true }, options);
      const legacy = inputIntentMetadata(command, options);
      expect(supported[PLUGIN_DISCOVERY_INPUT]).toBe(true);
      expect(legacy[PLUGIN_DISCOVERY_INPUT]).toBeUndefined();
      expect(JSON.parse(JSON.stringify(supported))).toEqual(JSON.parse(JSON.stringify(legacy)));
      expect(
        inputIntentMetadataFromCanonical(command, {
          ...supported,
          text: "retry",
          kind: "sendText",
        })[PLUGIN_DISCOVERY_INPUT],
      ).toBeUndefined();
    },
  );

  it("declares envelope support as a strict literal true", () => {
    const base = {
      commandId: "cmd",
      clientId: "app",
      sessionId: "s",
      type: "sendText" as const,
      payload: {},
      issuedAt: 0,
    };
    expect(
      commandEnvelopeSchema.parse({ ...base, pluginDiscoveryUi: true }).pluginDiscoveryUi,
    ).toBe(true);
    // 信封只接受可信 Host 注入的 true；false/缺省都不该伪装成能力声明。
    expect(commandEnvelopeSchema.safeParse({ ...base, pluginDiscoveryUi: false }).success).toBe(
      false,
    );
    expect(commandEnvelopeSchema.parse(base).pluginDiscoveryUi).toBeUndefined();
  });
});

describe("plugin discovery subscription capability", () => {
  it("resumes only while the capability matches, and snapshots after it changes", () => {
    const publisher = new ConversationTopicPublisher("session", "epoch");
    publisher.subscribe({ connectionId: "phone", pluginDiscoveryUi: false });
    const base = { logEpoch: "epoch", seq: publisher.getSnapshot().seq };

    // 同一能力位：base 仍可信，可续传。
    const resumed = publisher.subscribe({
      connectionId: "phone",
      base,
      pluginDiscoveryUi: false,
    });
    expect(resumed.ack.mode).toBe("resume");

    // 能力位变化后同一 seq 对应的卡片投影可能不同，必须改用 snapshot 校正。
    const upgraded = publisher.subscribe({
      connectionId: "phone",
      base,
      pluginDiscoveryUi: true,
    });
    expect(upgraded.ack.mode).toBe("snapshot");

    const downgraded = publisher.subscribe({
      connectionId: "phone",
      base,
      pluginDiscoveryUi: false,
    });
    expect(downgraded.ack.mode).toBe("snapshot");
  });
});
