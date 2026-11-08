import type { ProviderFamilyDomain } from "@zcode/shared";
import type { LegacyTeamConnection } from "#src/setting/legacyAccountConnectionSettings.js";

/**
 * KayingCode.localrun：无账号 / 无 OAuth / 无团队组织解析。
 * 旧连接导入不再请求官方 customer API，组织字段一律视为未知。
 */
export function createLegacyTeamOrganizationResolver(_dependencies: {
  apiClient?: unknown;
  loadOAuthTokenSet?: (family: ProviderFamilyDomain) => Promise<unknown>;
}): (connection: LegacyTeamConnection) => Promise<string | null> {
  return async (_connection: LegacyTeamConnection) => null;
}
