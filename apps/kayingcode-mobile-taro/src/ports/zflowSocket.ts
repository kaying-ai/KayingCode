// weapp SocketTask → core ZflowSocketLike 适配（阶段 4：ZCode 后端接线）。
//
// 与 ports/taroSocket.ts（attachment 二进制通道）分开：zflow relay 只走 JSON
// 文本帧，接口窄得多——没有 binaryType，也没有数组缓冲。H5 target 不注入本
// 适配（core 的 defaultZflowSocket 走浏览器原生 WebSocket，与 web ?relay 同路径）。
//
// ⚠ 真机证据（合法域名、前后台恢复、并发 socket 上限）属 MOB-P-002 / DEC-005；
// 当前实现以「weapp 可构建 + 事件形状符合 wx 文档」为准。
import Taro from "@tarojs/taro";
import type { ZflowSocketLike } from "@kayingcode/mobile-client-core";

class TaroZflowSocketTask implements ZflowSocketLike {
  readonly opened: Promise<void>;
  private task: Taro.SocketTask | null = null;
  private messageHandler: ((data: string) => void) | null = null;
  private closeHandler: ((code: number, reason: string) => void) | null = null;
  private errorHandler: ((error: unknown) => void) | null = null;

  constructor(url: string) {
    // Taro.connectSocket 类型为 Promise<SocketTask>（weapp 运行时同步返回 SocketTask，
    // 两种都归一为 Promise）；监听器在 then 内注册，微任务早于任何网络 round-trip
    // 的 open 事件，不会丢首帧。
    this.opened = new Promise<void>((resolve, reject) => {
      void Promise.resolve(Taro.connectSocket({ url }))
        .then((task) => {
          this.task = task;
          // settled 只能成功/失败一次：open 之前的 close/error 视为打开失败
          // （对齐 defaultZflowSocket 的 opened reject 语义），open 之后按常规事件转发。
          let settled = false;
          task.onOpen(() => {
            settled = true;
            resolve();
          });
          task.onMessage((res) => {
            // relay 协议只认 JSON 文本帧；二进制帧在协议层无意义，按 defaultZflowSocket
            // 的 `typeof event.data === "string"` 守卫同样忽略。
            if (typeof res.data === "string") this.messageHandler?.(res.data);
          });
          task.onClose((res) => {
            if (!settled) {
              settled = true;
              reject(new Error(`socket closed before open: ${url}`));
            }
            this.closeHandler?.(res.code ?? 1005, res.reason ?? "");
          });
          task.onError((res) => {
            const error = new Error(res.errMsg ?? "socket error");
            if (!settled) {
              settled = true;
              reject(error);
              return;
            }
            this.errorHandler?.(error);
          });
        })
        .catch((error: unknown) => reject(error));
    });
  }

  send(data: string): void {
    // 调用方（core）只在 opened 之后发送；此时 task 必已就绪。
    this.task?.send({ data });
  }

  close(code?: number, reason?: string): void {
    this.task?.close({ code: code ?? 1000, reason: reason ?? "" });
  }

  setMessageHandler(handler: (data: string) => void): void {
    this.messageHandler = handler;
  }

  setCloseHandler(handler: (code: number, reason: string) => void): void {
    this.closeHandler = handler;
  }

  setErrorHandler(handler: (error: unknown) => void): void {
    this.errorHandler = handler;
  }
}

/** weapp target 的 zflow relay socket 工厂；H5 target 不注入（走浏览器缺省）。 */
export function createTaroZflowSocket(url: string): ZflowSocketLike {
  return new TaroZflowSocketTask(url);
}
