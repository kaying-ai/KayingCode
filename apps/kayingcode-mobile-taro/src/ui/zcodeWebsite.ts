import Taro from "@tarojs/taro";
import {
  findMobileAccount,
  touchMobileAccount,
  type MobileAccount,
} from "@kayingcode/mobile-client-core";
import { createZcodeWebOpener } from "../flow/zcodeWeb";

const open = createZcodeWebOpener({
  findAccount: findMobileAccount,
  navigate: (url) => Taro.navigateTo({ url }),
  touch: touchMobileAccount,
});

/** 卡片、设备管理和会话 Tab 共用导航，不触发原生连接或账户切换。 */
export function openZcodeWebsite(account: MobileAccount): void {
  void open(account).catch(() => {
    // 平台错误可能包含完整连接信息，只显示固定文案。
    void Taro.showToast({ title: "无法打开网页，请重试或重新添加 Bot", icon: "none" });
  });
}
