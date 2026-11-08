// sessions-index 的壳层单订阅者 + fan-out（阶段 4：通知域的前置）。
//
// core 的 `RelayAgentConnection.subscribeSessionsIndex` 背后是**单订阅者**
// （RelaySessionsIndexSubscriber，再订阅会先 unsubscribe）。因此「会话列表」与
// 「通知推导」不能各自直连——本模块是唯一上游订阅者，向下游 fan-out，并按
// 「最近活动倒序」统一排序（排序只在一处，避免两个消费方各自排）。
//
// 上游生命周期挂在壳层（pages/home），不随 Tab 切换重建：底栏未读角标在 Bot/
// 我的 Tab 也要继续更新。连接换代时旧代数的回调被 generation 丢弃。
import type { RelayAgentConnection } from "@kayingcode/mobile-client-core";
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";
import { ingestSessionsIndex } from "./notifications";

let generation = 0;
let attached: RelayAgentConnection | null = null;
let sessions: SessionSummary[] = [];
const listeners = new Set<(sessions: SessionSummary[]) => void>();

function publish(next: SessionSummary[]): void {
  sessions = next;
  for (const listener of Array.from(listeners)) listener(sessions);
}

/** 打开（或换绑）上游订阅；重复传入同一连接是幂等的。 */
export function openSessionsIndex(connection: RelayAgentConnection): void {
  if (attached === connection) return;
  closeSessionsIndex();
  attached = connection;
  const gen = ++generation;
  void connection
    .subscribeSessionsIndex((projection) => {
      if (gen !== generation) return;
      publish([...projection.sessions].sort((a, b) => b.lastActivityAt - a.lastActivityAt));
      // 通知推导与列表共用同一拍快照：两次独立订阅会让相位错位、漏掉完成跃迁。
      ingestSessionsIndex(projection.sessions);
    })
    .catch(() => {
      // existing-only：runtime 未运行时抛错按空列表处理，不向上弹错误。
      if (gen === generation) publish([]);
    });
}

/** 释放上游订阅（断开、切 Bot、离开壳层时调用）。幂等。 */
export function closeSessionsIndex(): void {
  const connection = attached;
  attached = null;
  generation += 1;
  if (connection) void connection.unsubscribeSessionsIndex().catch(() => undefined);
  publish([]);
}

/** 订阅会话列表快照；订阅时立即回调当前值。 */
export function subscribeSessionsIndex(
  listener: (sessions: SessionSummary[]) => void,
): () => void {
  listeners.add(listener);
  listener(sessions);
  return () => {
    listeners.delete(listener);
  };
}
