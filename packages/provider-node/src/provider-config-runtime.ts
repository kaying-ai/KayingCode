import {
  ProviderConfigService,
  type ProviderConfigLayerSnapshot,
  type ProviderConfigLayerUpdate,
} from "@zcode/provider";
import { NodeKayingCodeBuiltinProviderConfigSource } from "./kayingcode-builtin-provider-config-source.js";
import {
  EndpointScopedKayingCodeBuiltinSource,
  type EndpointScopedKayingCodeBuiltinSourceOptions,
} from "./endpoint-scoped-kayingcode-builtin-source.js";
import {
  KayingCodeBuiltinRemoteSynchronizer,
  type KayingCodeBuiltinRemoteSynchronizerOptions,
  type KayingCodeBuiltinRefreshResult,
} from "./kayingcode-builtin-remote-synchronizer.js";
import {
  NodePersonalProviderConfigRepository,
  type PersonalProviderConfigRecoveryEvent,
} from "./personal-provider-config-repository.js";

export interface NodeProviderConfigRuntimeOptions {
  readonly kayingcodeBuiltinFilePath: string;
  readonly kayingcodeBuiltinActiveFilePath?: string;
  readonly kayingcodeBuiltinRemote?: Omit<KayingCodeBuiltinRemoteSynchronizerOptions, "source">;
  readonly kayingcodeBuiltinEnvironment?: Omit<
    EndpointScopedKayingCodeBuiltinSourceOptions,
    "bundledFilePath"
  >;
  readonly onKayingCodeBuiltinRefreshError?: (error: unknown) => void;
  readonly onPersonalConfigRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPersonalConfigPollingError?: (error: unknown) => void;
  readonly personalFilePath: string;
  readonly personalPollingIntervalMs?: number | false;
  readonly importLegacy?: (
    kayingcodeBuiltin: ProviderConfigLayerSnapshot,
  ) => Promise<ProviderConfigLayerUpdate | null>;
  readonly watch?: boolean;
}

/** 组装一个 Node.js 进程内共享的 KayingCode Built-in/Personal Config 运行边界。 */
export class NodeProviderConfigRuntime {
  readonly configService: ProviderConfigService;
  readonly #kayingcodeBuiltinSource:
    | NodeKayingCodeBuiltinProviderConfigSource
    | EndpointScopedKayingCodeBuiltinSource;
  readonly #personalRepository: NodePersonalProviderConfigRepository;
  readonly #remoteSynchronizer?: KayingCodeBuiltinRemoteSynchronizer;
  readonly #onRemoteRefreshError?: (error: unknown) => void;
  #startPromise: Promise<void> | null = null;
  #disposed = false;
  readonly #checkListeners = new Set<() => Promise<void>>();
  #checkTimer: ReturnType<typeof setInterval> | null = null;
  #checkInFlight: Promise<void> | null = null;

  constructor(options: NodeProviderConfigRuntimeOptions) {
    this.#kayingcodeBuiltinSource = options.kayingcodeBuiltinEnvironment
      ? new EndpointScopedKayingCodeBuiltinSource({
          bundledFilePath: options.kayingcodeBuiltinFilePath,
          ...options.kayingcodeBuiltinEnvironment,
        })
      : new NodeKayingCodeBuiltinProviderConfigSource({
          bundledFilePath: options.kayingcodeBuiltinFilePath,
          activeFilePath: options.kayingcodeBuiltinActiveFilePath,
          watch: options.watch,
        });
    this.#remoteSynchronizer =
      options.kayingcodeBuiltinRemote &&
      this.#kayingcodeBuiltinSource instanceof NodeKayingCodeBuiltinProviderConfigSource
        ? new KayingCodeBuiltinRemoteSynchronizer({
            source: this.#kayingcodeBuiltinSource,
            ...options.kayingcodeBuiltinRemote,
          })
        : undefined;
    this.#onRemoteRefreshError = options.onKayingCodeBuiltinRefreshError;
    this.#personalRepository = new NodePersonalProviderConfigRepository({
      filePath: options.personalFilePath,
      onRecovery: options.onPersonalConfigRecovery,
      onPollingError: options.onPersonalConfigPollingError,
      pollingIntervalMs: options.personalPollingIntervalMs,
      ...(options.importLegacy
        ? {
            importLegacy: async () => options.importLegacy!(await this.#kayingcodeBuiltinSource.read()),
          }
        : {}),
    });
    this.configService = new ProviderConfigService({
      kayingcodeBuiltinSource: this.#kayingcodeBuiltinSource,
      personalRepository: this.#personalRepository,
    });
  }

  resolveKayingCodeBuiltinActiveFilePath(): Promise<string> {
    return this.#kayingcodeBuiltinSource instanceof NodeKayingCodeBuiltinProviderConfigSource
      ? Promise.resolve(this.#kayingcodeBuiltinSource.activeFilePath)
      : this.#kayingcodeBuiltinSource.resolveActiveFilePath();
  }

  get personalRepository(): import("@zcode/provider").PersonalProviderConfigRepository {
    return this.#personalRepository;
  }

  /** Environment 同一周期检查中恢复未对齐依赖，不被下载 TTL 或失败挡住。 */
  onDidCheckKayingCodeBuiltin(listener: () => Promise<void>): () => void {
    this.#checkListeners.add(listener);
    return () => this.#checkListeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.#disposed) throw new Error("NodeProviderConfigRuntime 已 dispose");
    if (this.#startPromise) return this.#startPromise;
    const startPromise = this.configService.read().then(() => {
      if (this.#disposed) return;
      void this.#checkBackground();
      // Managed Worker 无下载配置也无恢复 owner，不建立周期任务。
      if (
        this.#remoteSynchronizer ||
        this.#kayingcodeBuiltinSource instanceof EndpointScopedKayingCodeBuiltinSource ||
        this.#checkListeners.size > 0
      ) {
        this.#checkTimer = setInterval(() => {
          void this.#checkBackground();
        }, 60_000);
        this.#checkTimer.unref?.();
      }
    });
    this.#startPromise = startPromise;
    void startPromise.catch(() => {
      if (this.#startPromise === startPromise) this.#startPromise = null;
    });
    return startPromise;
  }

  refreshKayingCodeBuiltin(options?: { readonly force?: boolean }): Promise<KayingCodeBuiltinRefreshResult> {
    if (this.#disposed) return Promise.resolve("disposed");
    if (this.#kayingcodeBuiltinSource instanceof EndpointScopedKayingCodeBuiltinSource) {
      return this.#kayingcodeBuiltinSource.refresh(options);
    }
    return this.#remoteSynchronizer?.refresh(options) ?? Promise.resolve("skipped");
  }

  #checkBackground(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    if (this.#checkInFlight) return this.#checkInFlight;
    const check = Promise.allSettled([
      this.refreshKayingCodeBuiltin(),
      ...[...this.#checkListeners].map((listener) => Promise.resolve().then(listener)),
    ])
      .then((results) => {
        if (this.#disposed) return;
        for (const result of results)
          if (result.status === "rejected") this.#onRemoteRefreshError?.(result.reason);
      })
      .finally(() => {
        if (this.#checkInFlight === check) this.#checkInFlight = null;
      });
    this.#checkInFlight = check;
    return check;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#checkTimer) clearInterval(this.#checkTimer);
    this.#checkTimer = null;
    this.#checkListeners.clear();
    this.#remoteSynchronizer?.dispose();
    this.configService.dispose();
    this.#personalRepository.dispose();
    this.#kayingcodeBuiltinSource.dispose();
  }
}

export function createNodeProviderConfigRuntime(
  options: NodeProviderConfigRuntimeOptions,
): NodeProviderConfigRuntime {
  return new NodeProviderConfigRuntime(options);
}
