import {
  createLocalServices,
  getAppConfigDir,
  migrateApplicationStorage,
} from "@zcode/services/node";
import { createSettingService } from "@zcode/services/storage-startup";
import {
  materializeBundledKayingCodeBuiltinProviderConfig,
  readBundledKayingCodeBuiltinProviderConfig,
} from "./bundledKayingCodeBuiltinProviderConfig.js";
import { createHttpServer } from "./http.js";

async function main(): Promise<void> {
  const kayingcodeBuiltinProviderConfigFilePath =
    await materializeBundledKayingCodeBuiltinProviderConfig({
      environmentConfigRoot: getAppConfigDir(),
      content: readBundledKayingCodeBuiltinProviderConfig(),
    });
  const port = Number(process.env["PORT"]) || 3030;
  const host =
    process.env["KAYINGCODE_SERVER_HOST"]?.trim() || process.env["HOST"]?.trim() || undefined;
  const staticRoot = process.env["KAYINGCODE_WEB_STATIC_ROOT"]?.trim() || undefined;
  const authToken = process.env["KAYINGCODE_SERVER_AUTH_TOKEN"]?.trim() || undefined;
  // 与 Desktop Database Startup 相同的顺序屏障：先带旧设置完成 tasks/project 库迁移，
  // 再开放 RPC。否则 projectService 首次读树时才由 TaskIndexRepo 懒迁移，
  // lastWorkspaceSession 的项目种子不会被消费。
  await migrateApplicationStorage(await createSettingService().get());
  const services = createLocalServices({
    kayingcodeBuiltinProviderConfigFilePath,
    providerProvisioningTargetEnabled: Boolean(authToken),
  });

  createHttpServer(services, port, {
    ...(host ? { host } : {}),
    ...(staticRoot ? { staticRoot, spaFallback: true } : {}),
    ...(authToken ? { authToken, authRequired: true } : {}),
  });
}

void main().catch((error: unknown) => {
  console.error("[kayingcode-server:http] startup failed", error);
  process.exitCode = 1;
});
