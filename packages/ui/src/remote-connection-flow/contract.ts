import type { SourceServerConnectionState, SourceServerOperationLog } from "@zcode/shared";

/**
 * 设备卡上的连接进度投影。
 *
 * 上游由连接向导在渲染期间 publish；本地连接向导尚未迁移，设备管理面板改为
 * 从 Host 快照（连接状态）与 Host 操作日志推导同一份只读进度，避免新增状态 owner。
 * 因此这里只保留面板真正消费的字段，不含向导视图、恢复与取消动作。
 */
export interface RemoteConnectionProgress {
  sourceServerId?: string;
  profileId: string;
  /** 设备展示名；用于进度条的 aria 文案。 */
  name: string;
  /** Host 保留的最近一次操作日志；也是唯一进度事实来源。 */
  logs: readonly SourceServerOperationLog[];
  state: Extract<SourceServerConnectionState, "bootstrapping" | "retrying">;
}
