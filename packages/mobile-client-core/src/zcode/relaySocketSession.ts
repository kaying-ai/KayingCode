// relay socket 打开与回调接线。
//
// 从 zcodeRelayClient 拆出：create → await opened → 接线 message/close/error，
// 全部回调经 `isCurrent()` 守卫，防止旧 socket 的迟到回调污染新一代连接
// （对齐 Flutter `_connectOnce` 的 generation 检查）。
import type { ZflowSocketFactory, ZflowSocketLike } from "./zflowTypes.js";

export interface RelaySocketSessionHandlers {
  isCurrent: () => boolean;
  onMessage: (data: string) => void;
  onClose: (code: number, reason: string) => void;
  onError: (error: unknown) => void;
}

/**
 * 打开 relay socket 并完成回调接线。
 * 返回 null 表示打开失败或已过期（调用方按 1006 走关闭处理）。
 */
export async function openRelaySocket(options: {
  url: string;
  factory: ZflowSocketFactory;
  handlers: RelaySocketSessionHandlers;
  log: (line: string) => void;
}): Promise<ZflowSocketLike | null> {
  const { url, factory, handlers, log } = options;
  // V2 URL 带一次性 token，连接日志只保留端点。
  log(`[relay] connecting ${url.split("?")[0]}`);
  let socket: ZflowSocketLike;
  try {
    socket = factory(url);
    await socket.opened;
  } catch {
    log("[relay] connect failed");
    return null;
  }
  if (!handlers.isCurrent()) {
    try {
      socket.close();
    } catch {
      // 已被更新一代接管。
    }
    return null;
  }
  socket.setMessageHandler((data) => {
    if (handlers.isCurrent()) handlers.onMessage(data);
  });
  socket.setCloseHandler((code, reason) => {
    if (handlers.isCurrent()) handlers.onClose(code, reason);
  });
  socket.setErrorHandler((error) => {
    if (handlers.isCurrent()) handlers.onError(error);
  });
  return socket;
}
