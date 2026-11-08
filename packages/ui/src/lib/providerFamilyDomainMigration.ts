import type { IServiceAccessor } from "@zcode/services";

/**
 * KayingCode.localrun：无 OAuth / 账号 family domain。
 * 跳过推断直接落定迁移标记，避免空 Registry 反复等待并卡住启动门禁。
 */
export async function ensureProviderFamilyDomainMigration(
  services: Pick<IServiceAccessor, "settingService">,
): Promise<void> {
  const settings = await services.settingService.get();
  if (settings.providerFamilyDomain || settings.providerFamilyDomainMigrated) {
    return;
  }
  await services.settingService.update({
    providerFamilyDomainUpdatedAt: Date.now(),
    providerFamilyDomainMigrated: true,
  });
}
