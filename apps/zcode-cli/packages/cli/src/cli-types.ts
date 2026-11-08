import type { TuiReadClipboardImage, TuiWriteClipboardText } from "@zcode/tui";
import type { UiLocale } from "@zcode/i18n";
import type { Logger } from "@zcode/contracts";
import type {
  createManagedCdpBrowserRuntime,
  ManagedCdpBrowserRuntimeOptions,
} from "@zcode/adapters/browser";
import type {
  createDefaultProviderEndpointRoutingPort,
  createModelAdapter,
  createKayingCodeApp,
  CreateDefaultProviderEndpointRoutingPortOptions,
  CreateModelAdapterOptions,
  inspectKayingCodeSkill,
  inspectWorkspaceHookTrust,
  grantWorkspaceHookTrust,
  revokeWorkspaceHookTrustCli,
  inspectKayingCodeCustomCommand,
  InspectKayingCodeCustomCommandOptions,
  InspectKayingCodeSkillOptions,
  listKayingCodeCustomCommands,
  ListKayingCodeCustomCommandsOptions,
  loadKayingCodeCustomCommand,
  listKayingCodeSessions,
  listKayingCodeSkills,
  ListKayingCodeSessionsOptions,
  ListKayingCodeSkillsOptions,
  resolveLatestSession,
  ResolveLatestSessionOptions,
  RunKayingCodeProtocolAgentOptions,
  prepareKayingCodeTelemetryEnv,
  startProcessProviderRegistryRuntime,
  shutdownKayingCodeTelemetry,
  KayingCodeAppOptions,
} from "@zcode/bootstrap";
import type { CliEnv, DotenvLoadResult, LoadCliDotenvOptions } from "./env.js";
import type { PluginsCommandOverrides } from "./plugins-command.js";
import type { CliShutdownProcess } from "./shutdown.js";
import type { resolveWorkspaceGitBranch } from "./tui-workspace-git.js";

export type BootstrapModule = typeof import("@zcode/bootstrap");

export interface RunDependencies extends PluginsCommandOverrides {
  migrateStorage?: () => Promise<import("@zcode/shared/sqlite-migrations").MigrationResult>;
  protocolLifecycle?: RunKayingCodeProtocolAgentOptions["lifecycle"];
  protocolInput?: NodeJS.ReadableStream;
  createManagedCdpBrowserRuntime?: (
    options?: ManagedCdpBrowserRuntimeOptions,
  ) => ReturnType<typeof createManagedCdpBrowserRuntime>;
  createModelAdapter?: (
    options?: CreateModelAdapterOptions,
  ) => ReturnType<typeof createModelAdapter>;
  createProviderEndpointRoutingPort?: (
    options: CreateDefaultProviderEndpointRoutingPortOptions,
  ) => ReturnType<typeof createDefaultProviderEndpointRoutingPort>;
  createKayingCodeApp?: (
    options?: KayingCodeAppOptions,
  ) => Awaited<ReturnType<typeof createKayingCodeApp>> | ReturnType<typeof createKayingCodeApp>;
  /**
   * Session-event shaper for --output-format stream-json. Defaults to the
   * bootstrap module's, which is also what the protocol server uses; injectable
   * so a caller that supplies its own `createKayingCodeApp` (tests, embedders) can
   * still stream, since the bootstrap module is not loaded on that path.
   */
  mapSessionEvent?: BootstrapModule["mapSessionEvent"];
  cwd?: () => string;
  env?: CliEnv;
  inspectSkill?: (options: InspectKayingCodeSkillOptions) => ReturnType<typeof inspectKayingCodeSkill>;
  inspectWorkspaceHookTrust?: typeof inspectWorkspaceHookTrust;
  grantWorkspaceHookTrust?: typeof grantWorkspaceHookTrust;
  revokeWorkspaceHookTrustCli?: typeof revokeWorkspaceHookTrustCli;
  inspectCustomCommand?: (
    options: InspectKayingCodeCustomCommandOptions,
  ) => ReturnType<typeof inspectKayingCodeCustomCommand>;
  loadDotenv?: (options?: LoadCliDotenvOptions) => DotenvLoadResult;
  prepareKayingCodeTelemetryEnv?: typeof prepareKayingCodeTelemetryEnv;
  projectConfigPath?: string;
  listSessions?: (options: ListKayingCodeSessionsOptions) => ReturnType<typeof listKayingCodeSessions>;
  listCustomCommands?: (
    options: ListKayingCodeCustomCommandsOptions,
  ) => ReturnType<typeof listKayingCodeCustomCommands>;
  loadCustomCommand?: (
    options: InspectKayingCodeCustomCommandOptions,
  ) => ReturnType<typeof loadKayingCodeCustomCommand>;
  // headless slash 路由要和 app facade 的保留名 gate 用同一个判据；默认取 bootstrap 的，
  // 注入点只为让单测不必拉起整个 bootstrap 模块。见 prompt-command.ts。
  isReservedSlashCommandName?: BootstrapModule["isReservedKayingCodeSlashCommandName"];
  listSkills?: (options: ListKayingCodeSkillsOptions) => ReturnType<typeof listKayingCodeSkills>;
  logger?: Logger;
  readClipboardImage?: TuiReadClipboardImage;
  writeClipboardText?: TuiWriteClipboardText;
  resolveLatestSession?: (
    options: ResolveLatestSessionOptions,
  ) => ReturnType<typeof resolveLatestSession>;
  resolveWorkspaceGitBranch?: typeof resolveWorkspaceGitBranch;
  runKayingCodeProtocolAgent?: (options?: RunKayingCodeProtocolAgentOptions) => Promise<void>;
  runTui?: typeof import("@zcode/tui").runTui;
  skipUserConfig?: boolean;
  userConfigPath?: string;
  exitProcess?: (code: number) => void;
  shutdownCleanupTimeoutMs?: number;
  shutdownProcess?: CliShutdownProcess;
  startProcessProviderRegistryRuntime?: typeof startProcessProviderRegistryRuntime;
  shutdownKayingCodeTelemetry?: typeof shutdownKayingCodeTelemetry;
}

export type CliPermissionMode = "build" | "plan" | "edit" | "yolo" | "guarded";
export type CliRuntimeMode = CliPermissionMode | "auto";

export interface CliModeState {
  current?: CliRuntimeMode;
  override?: CliPermissionMode;
}

export interface CliTargetRequest {
  objective: string;
  replaceExisting: boolean;
}

export type ModeCapableApp = Awaited<ReturnType<typeof createKayingCodeApp>> & {
  getMode?: () => CliRuntimeMode;
  setLocale?: (locale: UiLocale) => Promise<{ locale: "en-US" | "zh-CN" }>;
  setMode?: (mode: CliRuntimeMode) => Promise<{ mode: CliRuntimeMode }>;
};

export interface CliResumeRequest {
  continueSession: boolean;
  resumeSessionId?: string;
}
