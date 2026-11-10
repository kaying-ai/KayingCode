export interface TaskUnreadBadgeGate {
  notificationEnabled: boolean;
  badgeEnabled: boolean;
  unreadTaskCount: number;
}

/**
 * 角标上报唯一门控：通知总开关关闭或角标偏好关闭时上报 0。
 * 关闭只影响平台角标，不清除未读事实，侧栏蓝点仍按 tasks-index 显示。
 */
export function resolveTaskUnreadBadgeCount(options: TaskUnreadBadgeGate): number {
  if (!options.notificationEnabled || !options.badgeEnabled) {
    return 0;
  }

  const unreadTaskCount = Math.max(0, Math.trunc(options.unreadTaskCount));
  return Number.isFinite(unreadTaskCount) ? unreadTaskCount : 0;
}
