import type { IServiceAccessor } from "@zcode/services";
import type { ProviderFamilyConnectionSelection } from "@zcode/shared";
import type { AccountConnectionLoss } from "@/root/accountConnectionRefreshObserver.js";

type AccountConnectionSwitchSuggestion = {
  selection: ProviderFamilyConnectionSelection;
  label?: string;
  apply(): Promise<"switched" | "stale">;
};

/**
 * KayingCode.localrun 没有账号连接 / 套餐权益，
 * 不提供替代套餐建议。保留签名以兼容通知层调用。
 */
export async function prepareAccountConnectionSwitch(
  _services: IServiceAccessor,
  _event: AccountConnectionLoss,
): Promise<AccountConnectionSwitchSuggestion | null> {
  return null;
}
