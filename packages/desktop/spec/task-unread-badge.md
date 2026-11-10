# 任务未读角标

## 产品规则

桌面端任务未读角标默认关闭。用户可在「设置 → 通用 → 任务通知」下打开「显示未读角标」，在 macOS Dock、Linux LauncherEntry 或 Windows 任务栏上显示未读任务数量。

角标是任务通知的可选子能力，不改变侧栏蓝点、任务通知和未读状态的既有语义：

- 角标关闭时只上报 0，不清除 `tasks-index` 中的 `unreadAt`，侧栏蓝点仍按未读状态显示。
- 任务通知总开关关闭时角标同样不显示，设置项置灰；重新打开通知后由用户单独决定是否显示角标。
- 默认值从「通知开启 + 角标开启」改为「通知开启 + 角标关闭」。升级用户没有角标偏好键，按关闭处理，不需要数据迁移。

## 状态所有者

- 未读事实：`tasks-index` 的 `unreadAt`，由后台任务终态同步写入。
- 角标计数：`ProjectDirectoryProvider` 读取权威 `ProjectTree`，调用 `countProjectTreeUnreadTasks` 得到数量，是渲染进程唯一的上报者。
- Root 不再从 session store 的缓存推导第二份计数；删除重复上报路径，避免两个 effect 对同一窗口后写覆盖。
- 偏好：`kayingcode-task-unread-badge-enabled`，默认 `false`。

## 生效条件

```
上报数量 = notificationEnabled && taskUnreadBadgeEnabled ? unreadTaskCount : 0
```

`syncWindowUnreadCount` 的调用必须同时依赖 `notificationEnabled`、`taskUnreadBadgeEnabled` 和 `unreadTaskCount`。任一条件变化都要重新上报，保证打开/关闭开关能立即清除或恢复角标。Provider 卸载时上报 0，避免退出工作区后主进程保留最后一次计数。

## Main 进程聚合

- 每个窗口按 window id 保存自己上报的数量。
- 多窗口取最大值而不是求和：各窗口上报的是同一棵权威树的全局未读数，求和会重复。
- 窗口关闭时删除该窗口在 `windowUnreadCountMap` 中的记录并重新聚合，避免已关闭窗口的旧计数把角标永久留在 Dock/任务栏。
- 收到非法 payload（非整数、负数）只记录 warn，不修改现有计数。

## 平台差异

- macOS / Linux：`app.setBadgeCount(count)`，0 表示移除。
- Windows：`app.setBadgeCount` 是 no-op，使用窗口级 `setOverlayIcon`；数量大于 9 显示 `9+`，0 传 `null` 移除。
- 平台不支持时只保存计数，不产生 UI 副作用。

## 验收场景

1. 新安装或升级后首次启动：通知默认开启、角标偏好缺失，Dock/任务栏不出现数字角标。
2. 设置页打开「显示未读角标」：存在未读任务时立即出现角标，数量与侧栏未读一致。
3. 设置页关闭「显示未读角标」：角标立即消失，侧栏蓝点保持不变。
4. 关闭任务通知：角标消失且角标开关置灰；重新打开通知后角标仍保持关闭，除非用户重新打开角标。
5. 后台任务完成/失败产生新未读：角标开启时计数增加；角标关闭时不出现。
6. 多窗口：角标取各窗口上报值的最大值，不随窗口数量翻倍。
7. 关闭其中一个窗口：该窗口计数被移除，剩余窗口的角标按新聚合值更新。
