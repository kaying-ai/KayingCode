import { Event } from "@zcode/rpc";
import type { IWindowControllerService } from "@zcode/services";

/**
 * Window Host Controller 的缺失语义。
 *
 * Web Host 没有窗口级 controller（多 workspace 目录、跨 source 路由与实时帧
 * 由 Desktop Window Host 持有）。未注册 channel 时 ProxyChannel 的 EventListen
 * 会被 ChannelServer 当成 pending 请求挂起，UI 的活动订阅只能等超时——既慢又
 * 无法区分“没有 controller”和“Host 卡住”。这里注册显式 unavailable 实现：
 * 方法调用立即以稳定错误码拒绝，动态事件返回永不触发的 Event，UI 走已有的
 * 降级/告警分支，不伪造任务或活动状态。
 */
export const WINDOW_CONTROLLER_UNAVAILABLE_CODE = "window-controller-unavailable";

function unavailable(method: string): never {
  throw Object.assign(
    new Error(`window-controller-unavailable: ${method} is not supported by this Host`),
    { code: WINDOW_CONTROLLER_UNAVAILABLE_CODE },
  );
}

export function createUnavailableWindowControllerService(): IWindowControllerService {
  return {
    deleteArchivedTask: async () => unavailable("deleteArchivedTask"),
    deleteArchivedTasks: async () => unavailable("deleteArchivedTasks"),
    listTaskList: async () => unavailable("listTaskList"),
    getTaskMeta: async () => unavailable("getTaskMeta"),
    mutateTask: async () => unavailable("mutateTask"),
    subscribeControllerV4: async () => unavailable("subscribeControllerV4"),
    resyncControllerV4: async () => unavailable("resyncControllerV4"),
    unsubscribeControllerV4: async () => unavailable("unsubscribeControllerV4"),
    // 事件面返回永不触发的 Event：订阅本身不是业务状态，UI 不应因为 Host
    // 没有实时帧而永远停在 EventListen 的超时路径。
    onDynamicControllerFrame: () => Event.None,
    onDynamicTaskUnreadSignal: () => Event.None,
  };
}
