import type { IPlatformService } from "@zcode/shared";

/**
 * 预装工具管理能力检测。
 *
 * 三个方法都由 Desktop preload 实现；Web、手机远控与旧版 preload 缺少其中任意一个，
 * 帮助菜单就不展示入口，也不挂载对话框。不能用 executeDesktopCommand 之类的旁证判断：
 * Web 的 IPlatformService 桩同样实现了 no-op 桌面命令。
 */
export function canManagePreinstalledTools(platform: IPlatformService): boolean {
  return (
    typeof platform.getPreinstalledToolsState === "function" &&
    typeof platform.executePreinstalledToolsCommand === "function" &&
    typeof platform.onPreinstalledToolsState === "function"
  );
}
