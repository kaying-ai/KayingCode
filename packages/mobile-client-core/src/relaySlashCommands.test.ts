import assert from "node:assert/strict";
import { test } from "vitest";
import { RelaySessionCommands, runMobileSlashCommand } from "./relaySessionCommands.js";
import type { MobileAgentService } from "./mobileAgentService.js";
import type { CommandEnvelope } from "@zcode/shared/kayingcode-protocol-v4";

test("maintenance slash commands use typed admission and custom prefixes remain text", async () => {
  const envelopes: CommandEnvelope[] = [];
  const commands = new RelaySessionCommands(
    {
      sendConversationCommandV4: async ({ envelope }) => {
        envelopes.push(envelope);
        return { commandId: envelope.commandId, status: "accepted", revisionAtDecision: 1 };
      },
    } as MobileAgentService,
    { workspacePath: "workspace" },
    () => ({ revision: 1, logEpoch: "epoch" }),
  );
  assert.equal(await runMobileSlashCommand(commands, "session", "/compact"), true);
  assert.equal(await runMobileSlashCommand(commands, "session", "/goal pause"), true);
  assert.equal(await runMobileSlashCommand(commands, "session", "/goal resume"), true);
  assert.equal(await runMobileSlashCommand(commands, "session", "/goal finish the sample"), true);
  assert.equal(await runMobileSlashCommand(commands, "session", "/goals custom"), false);
  assert.equal(await runMobileSlashCommand(commands, "session", "/goal"), false);
  assert.deepEqual(
    envelopes.map((value) => value.type),
    ["compact", "pauseGoal", "resumeGoal", "sendGoalCommand"],
  );
});
