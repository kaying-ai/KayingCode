import { net } from "electron";
import { createDesktopTelemetryFetch } from "./desktopTelemetryFetch.js";
import {
  buildHelpAppConfigUrl,
  buildKayingCodeSourceHeadersFromContext,
  createHelpAppConfigReader,
  KAYINGCODE_ENV,
} from "@zcode/shared";

export function createDesktopHelpConfigReader(options: {
  resolveEndpointOrigin: () => Promise<string>;
  appVersion: string;
  deviceMid: string;
  /** 当前界面语言；以前不传，X-Client-Language 固定为 unknown。 */
  getClientLanguage: () => string;
}) {
  const read = createHelpAppConfigReader({ fetchImpl: createDesktopTelemetryFetch(net) });
  return async () => {
    const endpointOrigin = await options.resolveEndpointOrigin();
    const url = buildHelpAppConfigUrl(
      endpointOrigin,
      options.appVersion,
      `${process.platform}-${process.arch}`,
    );
    // Bug 原因：KayingCode.localrun 没有官方端点，buildHelpAppConfigUrl 会返回空串；
    // 空串进入 net.fetch 会抛 ERR_INVALID_URL，社区/反馈入口启动时出现失败日志。
    // 无端点时直接返回 undefined，让调用方走本地 config/default.json 缺省。
    if (!url) return undefined;

    return read(
      url,
      buildKayingCodeSourceHeadersFromContext({
        endpointOrigin,
        appVersion: options.appVersion,
        clientLanguage: options.getClientLanguage(),
        deviceMid: options.deviceMid,
        platform: process.platform,
        arch: process.arch,
        releaseChannel: KAYINGCODE_ENV,
        sourceTitle: "electron",
      }),
    );
  };
}
