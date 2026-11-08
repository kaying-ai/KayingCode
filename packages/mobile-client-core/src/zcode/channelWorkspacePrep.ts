import type {
  WorkspaceConfigState,
  WorkspaceSlashCommand,
} from "@zcode/shared/kayingcode-protocol-v4";
import type { RelayWorkspaceTarget } from "../relayWorkspaceTarget.js";
import type { BridgeSession } from "./bridgeSession.js";
import { Channels } from "./channelClient.js";

export interface ChannelSkillEntry {
  name: string;
  description: string;
  inputHint?: string;
}

/** Flutter ZCode 目录来源：`zcode-session.readWorkspacePresentation` 与 `skills.list`。 */
export class ChannelWorkspacePrep {
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

  /**
   * 工作区目录（模式 + slash）。宿主已下线 `zcode-task.prepareWorkspace`
   * （实测 ZCode 3.15.3 返回 `Method not found: prepareWorkspace`），目录改由
   * `zcode-session.readWorkspacePresentation` 提供；工作区参数是扁平 scope
   * （嵌套 `{workspace: …}` 会让宿主的 workspacePath 变成 undefined 并抛 path TypeError）。
   */
  async prepare(): Promise<WorkspaceConfigState> {
    await this.bridge.waitHealthy();
    const raw = await this.bridge.channels.call(
      Channels.zcodeSession,
      "readWorkspacePresentation",
      [{ ...this.scope }],
      60_000,
    );
    return workspacePresentationToConfig(raw);
  }

  async skills(): Promise<ChannelSkillEntry[]> {
    await this.bridge.waitHealthy();
    const raw = await this.bridge.channels.call(
      Channels.skills,
      "list",
      [{ ...this.scope, provider: "glm" }],
      20_000,
    );
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === "object" && raw !== null && "skills" in raw && Array.isArray(raw.skills)
        ? raw.skills
        : [];
    return list.flatMap((item: unknown) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (typeof record.name !== "string" || !record.name || record.enabled === false) return [];
      return [
        {
          name: record.name,
          description: typeof record.description === "string" ? record.description : "",
          ...(typeof record.argumentHint === "string" ? { inputHint: record.argumentHint } : {}),
        },
      ];
    });
  }
}

/**
 * 宿主 workspace-presentation（`{mode, slashCommands}`）→ 约定的 workspace 目录形状。
 * 缺键的条目直接丢弃，不生成半成品项。
 */
export function workspacePresentationToConfig(raw: unknown): WorkspaceConfigState {
  const record =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const mode = nonEmptyString(record?.mode);
  const slashCommands: WorkspaceSlashCommand[] = [];
  const list = Array.isArray(record?.slashCommands) ? record.slashCommands : [];
  for (const item of list) {
    const entry =
      typeof item === "object" && item !== null && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    const name = nonEmptyString(entry?.name);
    if (name === null) continue;
    const inputHint = nonEmptyString(entry?.inputHint) ?? nonEmptyString(entry?.argumentHint);
    slashCommands.push({
      name,
      description: typeof entry?.description === "string" ? entry.description : "",
      ...(inputHint ? { inputHint } : {}),
    });
  }
  return {
    configOptions:
      mode === null
        ? []
        : [
            {
              id: "mode",
              name: "模式",
              category: "mode",
              type: "select",
              currentValue: mode,
            },
          ],
    slashCommands,
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
