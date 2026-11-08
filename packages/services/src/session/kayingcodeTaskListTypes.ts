import type { WorkspacePurpose, KayingCodeTaskMeta } from "@zcode/shared";

export type KayingCodeTaskListKind = "pinned" | "archived" | "timeline" | "active" | "all";
export type KayingCodeTaskListSortBy = "created" | "updated";

export interface KayingCodeTaskListWorkspaceScope {
  workspacePath: string;
  workspaceIdentity?: string;
  workspacePurpose?: WorkspacePurpose;
}

export interface KayingCodeTaskListQuery {
  kind: KayingCodeTaskListKind;
  /** `"host"` 表示全局历史：直接查持久化 owner，不要求工作区已打开。 */
  workspaceScopes: KayingCodeTaskListWorkspaceScope[] | "host";
  sortBy: KayingCodeTaskListSortBy;
  search?: string;
  limit?: number;
}

export type KayingCodeTaskListItem = KayingCodeTaskMeta & {
  searchSnippet?: string;
  searchSnippets?: string[];
};

export interface KayingCodeTaskListResult {
  items: KayingCodeTaskListItem[];
  total: number;
  hasMore: boolean;
}

export type KayingCodeTaskGroupColor =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export interface KayingCodeTaskGroup {
  id: string;
  title: string;
  color: KayingCodeTaskGroupColor;
  createdAt: number;
  updatedAt: number;
}

export interface KayingCodeGroupedTaskRef {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}

export type KayingCodeGroupedTaskViewTopLevelNodeRef =
  | { type: "group"; groupId: string }
  | { type: "task"; task: KayingCodeGroupedTaskRef };

export type KayingCodeGroupedTaskViewNode =
  | {
      type: "group";
      group: KayingCodeTaskGroup;
      tasks: KayingCodeTaskListItem[];
      sortOrder?: number;
    }
  | {
      type: "task";
      task: KayingCodeTaskListItem;
      sortOrder?: number;
    };

export interface KayingCodeGroupedTaskView {
  nodes: KayingCodeGroupedTaskViewNode[];
}

export interface KayingCodeGroupedTaskViewQuery {
  workspaceScopes: KayingCodeTaskListWorkspaceScope[];
  includeAllWorkspaces?: boolean;
}

// ── grouped 原始结构（不 join tasks 表）──
// grouped 视图的任务数据源迁到 sessions-index 后，服务端只提供分组结构
// （task_groups / task_group_members / task_group_view_node_orders），
// 由客户端与 sessions-index 会话做 join。

/** 组成员引用（不含任务 meta；task 内容由 sessions-index 提供）。 */
export interface KayingCodeGroupedTaskViewStructureMember {
  groupId: string;
  /** 服务端口径 workspaceKey（resolveWorkspaceKey：identity ?? path），join 匹配键。 */
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
  /** null = 尚未落 sort_order（新加入组）；客户端按 addedAt 降序补内存序。 */
  sortOrder: number | null;
  addedAt: number;
}

/** 顶层节点排序（task_group_view_node_orders，node_key 已解析为结构化引用）。 */
export type KayingCodeGroupedTaskViewStructureTopOrder =
  | { type: "group"; groupId: string; sortOrder: number }
  | { type: "task"; workspaceKey: string; taskId: string; sortOrder: number };

export interface KayingCodeGroupedTaskViewStructure {
  /** 已按 workspaceScopes 可见性过滤的 group（bootstrap workspace group 只在其 workspace 可见）。 */
  groups: KayingCodeTaskGroup[];
  /** 全量组成员（含不可见 group 的成员——顶层排除规则需要全量判断）。 */
  members: KayingCodeGroupedTaskViewStructureMember[];
  topLevelOrders: KayingCodeGroupedTaskViewStructureTopOrder[];
}

export interface KayingCodeGroupedTaskViewOrderInput {
  workspaceScopes: KayingCodeTaskListWorkspaceScope[];
  topLevelNodes: KayingCodeGroupedTaskViewTopLevelNodeRef[];
  groups: Array<{
    groupId: string;
    taskRefs: KayingCodeGroupedTaskRef[];
  }>;
}

export interface KayingCodeWorkspaceEventSubscriptionParams {
  workspacePath: string;
  workspaceIdentity?: string;
}
