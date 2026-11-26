// 插件发现 UI 的按连接裁剪（对齐上游 `plugin-discovery/subscription.ts`）。
//
// 插件发现中产生的 `pluginInstall` 卡片只发给在 clientHello 声明了 `pluginDiscoveryUi`
// 的连接：旧客户端严格解析 pendingInteractions 的 kind，收到不认识的卡片会让整帧解析
// 失败（已知键上的解析错误不会只剥掉一项）。这里只裁剪该连接的载荷，保留原序号和其他
// 交互，不改写投影本身。
//
// v4 `pendingInteractionSchema` 已包含 `pluginInstall`；这里仍按 kind 字符串判别，
// 使裁剪只依赖线协议词表、不依赖 schema 的推断类型。没有该卡片时函数原样返回同一引用。
import type { ConversationDelta, ConversationSnapshot } from "@zcode/shared/kayingcode-protocol-v4";

type Pending = ConversationSnapshot["pendingInteractions"];

const PLUGIN_INSTALL_KIND = "pluginInstall";

function isPluginInstall(item: { kind: string }): boolean {
  return item.kind === PLUGIN_INSTALL_KIND;
}

/** 旧连接看不到插件安装卡片；有能力位或本来就没有卡片时返回同一引用。 */
function visibleInteractions(all: Pending, supported: boolean): Pending {
  return supported || !all.some((item) => isPluginInstall(item))
    ? all
    : all.filter((item) => !isPluginInstall(item));
}

export function pluginInstallSnapshotForConnection(
  snapshot: ConversationSnapshot,
  supported: boolean,
): ConversationSnapshot {
  const pendingInteractions = visibleInteractions(snapshot.pendingInteractions, supported);
  return pendingInteractions === snapshot.pendingInteractions
    ? snapshot
    : { ...snapshot, pendingInteractions };
}

export function pluginInstallDeltasForConnection(
  deltas: readonly ConversationDelta[],
  supported: boolean,
): readonly ConversationDelta[] {
  if (supported) return deltas;
  return deltas.map((delta) => {
    if (delta.op !== "state.updated" || !delta.patch.pendingInteractions) return delta;
    const pendingInteractions = visibleInteractions(delta.patch.pendingInteractions, false);
    return pendingInteractions === delta.patch.pendingInteractions
      ? delta
      : { ...delta, patch: { ...delta.patch, pendingInteractions } };
  });
}

/**
 * 当前快照里是否存在旧连接不可见的插件安装卡片。重订阅时能力位变化或存在这类卡片，
 * 同一 seq 可能对应不同卡片投影，必须改用 snapshot 校正。
 */
export function hasPluginInstallInteraction(all: Pending): boolean {
  return all.some((item) => isPluginInstall(item));
}
