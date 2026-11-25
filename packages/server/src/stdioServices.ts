import {
  createLocalServices,
  createSettingServiceWithMigrations,
  createSettingServiceReplyLanguageResolver,
  getAppConfigDir,
  type KayingCodeAgentCommandResolver,
  type ReplyLanguageResolver,
} from "@zcode/services/node";
import { createServerCredentialCipher } from "@zcode/shared/credential-security";
import { join } from "node:path";
import {
  parseServiceAuthorityMode,
  KAYINGCODE_REMOTE_HTTP_PROXY_ENV_KEY,
  KAYINGCODE_REMOTE_NO_PROXY_ENV_KEY,
  KAYINGCODE_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
} from "@zcode/shared";

interface CreateStdioServicesOptions {
  env?: Record<string, string | undefined>;
  kayingcodeBuiltinProviderConfigFilePath: string;
  kayingcodeAgentCommandResolver?: KayingCodeAgentCommandResolver;
  /** 远端 stdio Host 的回复语言来源；缺省读取本 Host Setting（未设置回答 null）。 */
  resolveReplyLanguage?: ReplyLanguageResolver;
}

interface RemoteAgentNetworkOptions {
  httpProxy?: string;
  noProxy?: string;
}

function resolveRemoteAgentNetworkFromEnv(
  env: Record<string, string | undefined>,
): RemoteAgentNetworkOptions | undefined {
  if (env[KAYINGCODE_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY]?.trim() !== "1") {
    return undefined;
  }
  return {
    httpProxy: env[KAYINGCODE_REMOTE_HTTP_PROXY_ENV_KEY]?.trim() || undefined,
    noProxy: env[KAYINGCODE_REMOTE_NO_PROXY_ENV_KEY]?.trim() || undefined,
  };
}

export async function createStdioServices(options: CreateStdioServicesOptions) {
  const env = options.env ?? process.env;
  const authorityModeParseResult = parseServiceAuthorityMode(env);
  const remoteAgentNetwork = resolveRemoteAgentNetworkFromEnv(env);
  // 旧 stdio 入口也必须在发布 ready 前验证存储，不能在同步到一半时才失败。
  const credentialCipherProvider = await createServerCredentialCipher({
    filePath: join(getAppConfigDir(), "credentials.json"),
    env,
  });
  // 回复语言的设置页写入经既有 ISettingService 到达本 Host；复用同一实例保证
  // 读到已提交的更新，未设置时由 resolver 回答 null，不伪造默认语言。
  const { service: settingService, prepareLegacyAccountConnections } =
    createSettingServiceWithMigrations();
  // 远程 Desktop 的呈现能力必须从 stdio 入口收到的 authority mode 进入 Services 推导链。
  // 测试注入 resolver 只用于在 spawn 前观察最终命令，不改变生产默认 resolver。
  const services = createLocalServices({
    credentialCipherProvider,
    kayingcodeBuiltinProviderConfigFilePath: options.kayingcodeBuiltinProviderConfigFilePath,
    serviceAuthorityMode: authorityModeParseResult.mode,
    kayingcodeAgentCommandResolver: options.kayingcodeAgentCommandResolver,
    remoteAgentNetwork,
    settingService,
    prepareLegacyAccountConnections,
    resolveReplyLanguage:
      options.resolveReplyLanguage ?? createSettingServiceReplyLanguageResolver(settingService),
  });

  return {
    authorityModeParseResult,
    services,
  };
}
