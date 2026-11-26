import { parseV4VisibleSlashCommand } from "@/v4/slashCommands.js";
import type { ComposerEditSession } from "./contract.js";

/**
 * 编辑排队消息时 kind 不变（docs/ui/composer-edit-mode.md）：goal 项必须保留 /goal，
 * 普通项不能改成 /goal 命令，否则 CLI 原地替换后消费语义与用户看到的文字不一致。
 */
export function composerEditQueueKindMismatch(
  inputKind: ComposerEditSession["inputKind"],
  text: string,
): "goal" | "text" | null {
  const isGoal = parseV4VisibleSlashCommand(text.trim())?.kind === "sendGoalCommand";
  if (inputKind === "sendGoalCommand" && !isGoal) return "goal";
  if (inputKind === "sendText" && isGoal) return "text";
  return null;
}
