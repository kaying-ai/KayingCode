import { useEffect, useRef } from "react";
import Taro from "@tarojs/taro";
import { createConnectionScanner } from "./connectionScanner";

/** 原生扫码只交付文本；解析、未知服务器确认及账户写入由页面原有命令处理。 */
export function useConnectionScanner(onResult: (value: string) => void) {
  const onResultRef = useRef(onResult);
  const scannerRef = useRef<ReturnType<typeof createConnectionScanner> | null>(null);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    const scanner = createConnectionScanner({
      scan: () => Taro.scanCode({ onlyFromCamera: false, scanType: ["qrCode"] }),
      onResult: (value) => onResultRef.current(value),
      onError: (title) => void Taro.showToast({ title, icon: "none" }),
    });
    scannerRef.current = scanner;
    return () => {
      scanner.dispose();
      scannerRef.current = null;
    };
  }, []);
  return {
    scan: () => void scannerRef.current?.scan(),
    cancel: () => scannerRef.current?.dispose(),
  };
}
