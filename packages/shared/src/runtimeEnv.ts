export const KAYINGCODE_RUNTIME_ENV_KEY = "KAYINGCODE_RUNTIME_ENV";
export const KAYINGCODE_HTTP_PROXY_ENV_KEY = "KAYINGCODE_HTTP_PROXY";
export const KAYINGCODE_NO_PROXY_ENV_KEY = "KAYINGCODE_NO_PROXY";
/** Desktop Host 只向 desktop-attached remote server 传递一次的网络配置。 */
export const KAYINGCODE_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY =
  "KAYINGCODE_REMOTE_RUNTIME_NETWORK_AUTHORITY";
export const KAYINGCODE_REMOTE_HTTP_PROXY_ENV_KEY = "KAYINGCODE_REMOTE_HTTP_PROXY";
export const KAYINGCODE_REMOTE_NO_PROXY_ENV_KEY = "KAYINGCODE_REMOTE_NO_PROXY";
export const KAYINGCODE_AGENT_CA_CERT_ENV_KEY = "KAYINGCODE_AGENT_CA_CERT";
export const KAYINGCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY = "KAYINGCODE_TOOL_ENV_PASSTHROUGH_JSON";
/** Desktop Main 将服务端裁决的单功能灰度结果传给 Local/Remote Host。 */
export const KAYINGCODE_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV =
  "KAYINGCODE_DESKTOP_CONTEXT_PROMPT_ENABLED";

// 仅允许 Agent 为当前 session 注入；父进程遗留值仍由下方清理。
export const KAYINGCODE_OFFICIAL_ENDPOINT_ENV_KEY = "KAYINGCODE_OFFICIAL_ENDPOINT";
export const KAYINGCODE_OFFICIAL_ENDPOINT_TOKEN_ENV_KEY = "KAYINGCODE_OFFICIAL_ENDPOINT_TOKEN";

export type KayingCodeRuntimeEnv = "development" | "production" | "test";

type EnvRecord = Record<string, string | undefined>;

const SANITIZED_RUNTIME_ENV_KEYS = [
  "NODE_ENV",
  "ELECTRON_RUN_AS_NODE",
  "NODE_NO_WARNINGS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "GIT_SSL_CAINFO",
  KAYINGCODE_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  KAYINGCODE_REMOTE_HTTP_PROXY_ENV_KEY,
  KAYINGCODE_REMOTE_NO_PROXY_ENV_KEY,
  // 旧版本可能遗留 Helper 凭据；继续剔除，但不捕获或恢复给任何新进程。
  "KAYINGCODE_CUA_PERMISSION_BROKER_SOCKET",
  "KAYINGCODE_CUA_PERMISSION_BROKER_TOKEN",
  "KAYINGCODE_CUA_PERMISSION_BROKER_REFRESH_MARKER",
  "KAYINGCODE_CUA_PLUGIN_AUTHORITY",
  // 官方命令端点的地址与 token 属于某一个 session，由 agent 定向注入；从父进程继承来的
  // 值（例如嵌套运行的 agent）一律剔除，避免一个 session 拿着另一个 session 的 token。
  KAYINGCODE_OFFICIAL_ENDPOINT_ENV_KEY,
  KAYINGCODE_OFFICIAL_ENDPOINT_TOKEN_ENV_KEY,
  // Agent OTLP Endpoint/Auth/Identity 只属于 CLI telemetry bootstrap，不能继续泄漏给
  // Bash、MCP 或模型工具子进程。sanitize 前会捕获到本进程私有 Map，供 Agent 启动边界读取。
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_EXPORTER_OTLP_METRICS_HEADERS",
  "OTEL_SERVICE_NAME",
  "OTEL_RESOURCE_ATTRIBUTES",
  "OTEL_EXPORTER_OTLP_COMPRESSION",
  "KAYINGCODE_MODEL_TELEMETRY_ENABLED",
  "KAYINGCODE_TELEMETRY_DEVICE_MID",
  // 历史身份变量不再受支持，但仍须从所有子进程环境剔除，避免旧配置把原始账号
  // 或可伪造 hash 泄漏给 Host、Bash 与 MCP。
  "KAYINGCODE_TELEMETRY_USER_ID",
  "KAYINGCODE_TELEMETRY_USER_ID_HASH",
  "KAYINGCODE_TELEMETRY_USER_SUBJECT_ID",
  "KAYINGCODE_TELEMETRY_IDENTITY_STATE",
  "KAYINGCODE_TELEMETRY_RUNTIME_SURFACE",
  "KAYINGCODE_TELEMETRY_RUNTIME_DISTRIBUTION",
] as const;

const NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS = [
  "NODE_ENV",
  "ELECTRON_RUN_AS_NODE",
  "NODE_NO_WARNINGS",
  // CUA broker 凭据不得经 tool-env-passthrough 恢复到 Bash/tool 子进程（否则等于绕过上面的剔除）。
  "KAYINGCODE_CUA_PERMISSION_BROKER_SOCKET",
  "KAYINGCODE_CUA_PERMISSION_BROKER_TOKEN",
  "KAYINGCODE_CUA_PERMISSION_BROKER_REFRESH_MARKER",
  "KAYINGCODE_CUA_PLUGIN_AUTHORITY",
  KAYINGCODE_OFFICIAL_ENDPOINT_ENV_KEY,
  KAYINGCODE_OFFICIAL_ENDPOINT_TOKEN_ENV_KEY,
  KAYINGCODE_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  KAYINGCODE_REMOTE_HTTP_PROXY_ENV_KEY,
  KAYINGCODE_REMOTE_NO_PROXY_ENV_KEY,
] as const;

const SANITIZED_PACKAGE_MANAGER_ENV_PATTERN =
  /^(npm_config|yarn|pnpm)_(http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$/i;

export function normalizeKayingCodeRuntimeEnv(
  value: string | undefined,
): KayingCodeRuntimeEnv | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "development" || normalized === "production" || normalized === "test") {
    return normalized;
  }
  return undefined;
}

export function resolveKayingCodeRuntimeEnv(
  env: Record<string, string | undefined>,
  fallback: KayingCodeRuntimeEnv = "production",
): KayingCodeRuntimeEnv {
  return normalizeKayingCodeRuntimeEnv(env[KAYINGCODE_RUNTIME_ENV_KEY]) ?? fallback;
}
const capturedKayingCodeAgentTelemetryEnv: Record<string, string> = {};

function captureKayingCodeAgentTelemetryEnv(env: Record<string, string | undefined>): void {
  Object.assign(capturedKayingCodeAgentTelemetryEnv, readKayingCodeAgentTelemetryEnv(env));
}

/**
 * 只提取供 Agent telemetry bootstrap 使用的配置。宿主可在经过通用 env 清洗后，
 * 将这组值定向传给 host/Agent；不得把它并入 Bash/MCP 的 tool env。
 */
export function readKayingCodeAgentTelemetryEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const telemetryEnv: Record<string, string> = {};
  for (const key of SANITIZED_RUNTIME_ENV_KEYS) {
    if (!isKayingCodeAgentTelemetryEnvKey(key)) continue;
    const value = env[key]?.trim();
    if (value) telemetryEnv[key] = value;
  }
  return telemetryEnv;
}

export function getCapturedKayingCodeAgentTelemetryEnv(): Record<string, string> {
  return { ...capturedKayingCodeAgentTelemetryEnv };
}

export function resetCapturedKayingCodeAgentTelemetryEnvForTest(): void {
  for (const key of Object.keys(capturedKayingCodeAgentTelemetryEnv)) {
    delete capturedKayingCodeAgentTelemetryEnv[key];
  }
}

export function sanitizeKayingCodeRuntimeEnv<T extends Record<string, string | undefined>>(
  env: T,
): Record<string, string> {
  captureKayingCodeAgentTelemetryEnv(env);
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || shouldSanitizeKayingCodeRuntimeEnvKey(key)) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

export function buildKayingCodeToolEnvPassthroughEnv(env: EnvRecord): Record<string, string> {
  const captured = readKayingCodeToolEnvPassthroughEnv(env);

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || !shouldCaptureKayingCodeToolEnvPassthroughKey(key)) {
      continue;
    }
    captured[key] = value;
  }

  return stringifyKayingCodeToolEnvPassthroughEnv(captured);
}

export function readKayingCodeToolEnvPassthroughEnv(env: EnvRecord): Record<string, string> {
  const raw = env[KAYINGCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY];
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const captured: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === "string" &&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
        shouldCaptureKayingCodeToolEnvPassthroughKey(key)
      ) {
        captured[key] = value;
      }
    }
    return captured;
  } catch {
    return {};
  }
}

export function sanitizeKayingCodeRuntimeEnvInPlace(env: Record<string, string | undefined>): void {
  captureKayingCodeAgentTelemetryEnv(env);
  for (const key of Object.keys(env)) {
    if (shouldSanitizeKayingCodeRuntimeEnvKey(key)) {
      delete env[key];
    }
  }
}

function isKayingCodeAgentTelemetryEnvKey(key: string): boolean {
  return (
    key.startsWith("OTEL_") ||
    key.startsWith("KAYINGCODE_TELEMETRY_") ||
    key === "KAYINGCODE_MODEL_TELEMETRY_ENABLED"
  );
}

export function shouldSanitizeKayingCodeRuntimeEnvKey(key: string): boolean {
  const upperKey = key.toUpperCase();
  return (
    SANITIZED_RUNTIME_ENV_KEYS.some((candidate) => candidate === upperKey) ||
    SANITIZED_PACKAGE_MANAGER_ENV_PATTERN.test(key)
  );
}

export function shouldCaptureKayingCodeToolEnvPassthroughKey(key: string): boolean {
  const upperKey = key.toUpperCase();
  if (isKayingCodeAgentTelemetryEnvKey(upperKey)) {
    return false;
  }
  if (NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS.some((candidate) => candidate === upperKey)) {
    return false;
  }
  return shouldSanitizeKayingCodeRuntimeEnvKey(key);
}

function stringifyKayingCodeToolEnvPassthroughEnv(
  captured: Record<string, string>,
): Record<string, string> {
  const entries = Object.entries(captured).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return {};
  }
  return {
    [KAYINGCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY]: JSON.stringify(Object.fromEntries(entries)),
  };
}
