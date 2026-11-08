// Bootstrap public API surface.

export * from "./app/create-app.js";
export type {
  ListKayingCodeSessionsOptions,
  PromptInput,
  ResolveLatestSessionOptions,
  ResumeOptions,
  RunKayingCodeProtocolAgentOptions,
  SendInputOptions,
  SendInputResult,
  SetLocaleResult,
  SteerTurnOptions,
  SubmitPromptOptions,
  UserPromptInput,
  KayingCodeApp,
  KayingCodeAppOptions,
  KayingCodeModelOption,
} from "./app/types.js";
export {
  inspectKayingCodeCustomCommand,
  listKayingCodeCustomCommands,
  loadKayingCodeCustomCommand,
} from "./custom-commands.js";
export type {
  InspectKayingCodeCustomCommandOptions,
  ListKayingCodeCustomCommandsOptions,
  KayingCodeCustomCommandInspection,
} from "./custom-commands.js";
export { createModelAdapter } from "./model-factory.js";
export type { CreateModelAdapterOptions } from "./model-factory.js";
export {
  createDefaultProviderEndpointRoutingPort,
  resolveProcessProviderEndpointRoutingPort,
} from "./provider-endpoint-routing.js";
export type {
  CreateDefaultProviderEndpointRoutingPortOptions,
  ResolveProcessProviderEndpointRoutingPortOptions,
} from "./provider-endpoint-routing.js";
export { startProcessProviderRegistryRuntime } from "./app/process-provider-registry-runtime.js";
export type { ProcessProviderRegistryRuntimeOptions } from "./app/process-provider-registry-runtime.js";
export {
  addKayingCodePluginMarketplace,
  getKayingCodePluginsOverview,
  installKayingCodeLocalPlugin,
  installKayingCodeMarketplacePlugin,
  listKayingCodePlugins,
  removeKayingCodePluginMarketplace,
  resolveKayingCodePlugins,
  setKayingCodePluginEnabled,
  uninstallKayingCodeMarketplacePlugin,
  updateKayingCodeMarketplacePlugin,
  updateKayingCodePluginMarketplace,
  validateKayingCodePluginPath,
} from "./plugins.js";
export type {
  AddKayingCodeMarketplaceOptions,
  InstallKayingCodeLocalPluginOptions,
  InstallKayingCodeMarketplacePluginOptions,
  ListKayingCodePluginsOptions,
  RemoveKayingCodeMarketplaceOptions,
  ResolveKayingCodePluginsOptions,
  SetKayingCodePluginEnabledOptions,
  SetKayingCodePluginEnabledResult,
  UninstallKayingCodeMarketplacePluginOptions,
  UpdateKayingCodeMarketplaceOptions,
  UpdateKayingCodeMarketplacePluginOptions,
  ValidateKayingCodePluginPathOptions,
  KayingCodeAvailablePluginData,
  KayingCodeInstalledPluginData,
  KayingCodeMarketplaceSummaryData,
  KayingCodeMarketplaceUpdateData,
  KayingCodePluginInstallData,
  KayingCodePluginUpdateData,
  KayingCodePluginsOverviewData,
} from "./plugins.js";
export { runKayingCodeProtocolAgent } from "./kayingcode-protocol-entrypoint.js";
// Exposed for the CLI's --output-format stream-json: it needs the same event
// shape the protocol server emits, rather than inventing a second one.
export { mapSessionEvent } from "./kayingcode-protocol/session-mapper.js";
export {
  prepareKayingCodeTelemetryEnv,
  shutdownKayingCodeTelemetry,
} from "./telemetry-bootstrap.js";
export type { SessionTranscriptMessage, SessionTranscriptPart } from "./session-transcript.js";
export { listKayingCodeSessions, resolveLatestSession } from "./sessions.js";
export { inspectKayingCodeSkill, listKayingCodeSkills } from "./skills.js";
export type {
  InspectKayingCodeSkillOptions,
  ListKayingCodeSkillsOptions,
  KayingCodeSkillInspection,
} from "./skills.js";
// Exposed for the CLI's headless slash routing: it must decide "is this a real
// custom command?" with the *same* reserved-name gate the app facade's
// customCommandPromptResolver applies, or the two disagree and a reserved name
// reaches the model as literal prompt text. See prompt-command.ts.
export { isReservedKayingCodeSlashCommandName } from "./slash-command-surface.js";
export {
  grantWorkspaceHookTrust,
  inspectWorkspaceHookTrust,
  revokeWorkspaceHookTrustCli,
} from "./workspace-hook-trust-cli.js";
export type {
  WorkspaceHookTrustCliItem,
  WorkspaceHookTrustCliStatus,
  WorkspaceHookTrustCliTarget,
} from "./workspace-hook-trust-cli.js";

// 嵌入式调用复用产品请求装配，避免来源头与网络配置漂移。
export { createRuntimeAiSdkModelExecutionConfig } from "./model-config.js";
