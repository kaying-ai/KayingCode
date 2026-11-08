import { z } from "zod";
import type { CommandAgentSource } from "./command-types.js";
import type { KayingCodeProvider } from "./kayingcode-task-types-core.js";

export const KAYINGCODE_AGENT_PROVIDER = "glm" satisfies KayingCodeProvider;
export const KAYINGCODE_AGENT_PROVIDER_LABEL = "KayingCode Agent";
export const KAYINGCODE_COMMAND_AGENT_SOURCE = "kayingcodeAgent" satisfies CommandAgentSource;

/**
 * 解析持久化/relay 数据时的 provider 归一 schema：
 * 已移除的第三方 provider 历史值仅作为归一化输入保留，统一收敛为 glm；
 * 其它非法值保持拒绝，与收窄前的校验边界一致。
 */
export const legacyKayingCodeProviderSchema = z
  .enum(["claude", "opencode", "gemini", "codex", "glm"])
  .transform((): typeof KAYINGCODE_AGENT_PROVIDER => KAYINGCODE_AGENT_PROVIDER);

export const KAYINGCODE_ENABLED_AGENT_PROVIDERS = [
  KAYINGCODE_AGENT_PROVIDER,
] as const satisfies readonly KayingCodeProvider[];

export const KAYINGCODE_COMMAND_AGENT_SOURCES = [
  KAYINGCODE_COMMAND_AGENT_SOURCE,
] as const satisfies readonly CommandAgentSource[];

export function normalizeAgentProviderToKayingCodeAgent(
  _provider?: KayingCodeProvider | null,
): KayingCodeProvider {
  return KAYINGCODE_AGENT_PROVIDER;
}

export function normalizeAgentProvidersToKayingCodeAgent(
  _providers?: ReadonlyArray<KayingCodeProvider> | null,
): KayingCodeProvider[] {
  return [...KAYINGCODE_ENABLED_AGENT_PROVIDERS];
}

export function normalizeCommandAgentSourceToKayingCodeAgent(
  _agentSource?: CommandAgentSource | null,
): CommandAgentSource {
  return KAYINGCODE_COMMAND_AGENT_SOURCE;
}

export function isKayingCodeAgentProvider(
  provider: KayingCodeProvider | null | undefined,
): provider is typeof KAYINGCODE_AGENT_PROVIDER {
  return provider === KAYINGCODE_AGENT_PROVIDER;
}
