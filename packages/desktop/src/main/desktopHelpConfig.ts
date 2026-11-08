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
    return read(
      buildHelpAppConfigUrl(
        endpointOrigin,
        options.appVersion,
        `${process.platform}-${process.arch}`,
      ),
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
