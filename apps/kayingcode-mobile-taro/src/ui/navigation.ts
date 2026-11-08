// 二级页导航工具。
//
// 壳首页（pages/home）是唯一常驻的栈底页；设备管理、引导、聊天、设置二级、
// 自动化都从它 push 出去。冷启动直达或分享进入二级页时栈里没有上一页，
// `navigateBack` 会静默失败，因此统一走这里回落到壳首页。
import Taro from "@tarojs/taro";

export const SHELL_HOME_URL = "/pages/home/index";

/** 返回上一页；没有上一页时清栈回到壳首页。 */
export function goBack(fallbackUrl: string = SHELL_HOME_URL): void {
  if (Taro.getCurrentPages().length > 1) {
    Taro.navigateBack();
    return;
  }
  Taro.reLaunch({ url: fallbackUrl });
}
