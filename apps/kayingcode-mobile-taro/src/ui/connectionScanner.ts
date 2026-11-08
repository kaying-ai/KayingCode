interface ConnectionScannerPorts {
  scan: () => Promise<{ result: string }>;
  onResult: (value: string) => void;
  onError: (message: string) => void;
}

export function createConnectionScanner(ports: ConnectionScannerPorts) {
  let busy = false;
  let disposed = false;
  return {
    async scan(): Promise<void> {
      if (busy || disposed) return;
      busy = true;
      let value: string;
      try {
        value = (await ports.scan()).result.trim();
        if (!value) throw new Error("empty scan result");
      } catch (error: unknown) {
        const message =
          typeof error === "object" && error !== null && "errMsg" in error
            ? String(error.errMsg)
            : "";
        // 微信主动取消也会 reject；不能误报“不支持扫码”，更不能提交已关闭入口的结果。
        if (!disposed && !/\bcancel(?:led)?\b/i.test(message)) {
          ports.onError("扫码失败，请重试或粘贴连接信息");
        }
        return;
      } finally {
        busy = false;
      }
      if (!disposed) ports.onResult(value);
    },
    dispose() {
      disposed = true;
    },
  };
}
