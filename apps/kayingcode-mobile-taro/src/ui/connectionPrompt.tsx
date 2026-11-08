import type { MobileBackendType } from "@kayingcode/mobile-client-core";
import { PromptDialog } from "./dialog";
import { useConnectionScanner } from "./useConnectionScanner";

export function ConnectionPrompt({
  backend,
  onCancel,
  onSubmit,
}: {
  backend: MobileBackendType;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const scanner = useConnectionScanner(onSubmit);
  return (
    <PromptDialog
      title={backend === "kayingcode" ? "连接 KayingCode" : "连接 ZCode"}
      message={
        backend === "kayingcode"
          ? "扫描电脑端二维码，或粘贴 Web 连接链接/配对码，在网页工作台继续。"
          : "扫描电脑端二维码或粘贴完整连接地址。新版 ZCode 需要登录与电脑相同的账号。"
      }
      placeholder={
        backend === "kayingcode"
          ? "https://…/?relay&bot=…#v=1&pairing=…"
          : "https://…/remote/v4?sid=…&mid=…&app_version=…"
      }
      multiline
      confirmLabel="添加"
      onScan={scanner.scan}
      onCancel={() => {
        scanner.cancel();
        onCancel();
      }}
      onSubmit={(value) => {
        scanner.cancel();
        onSubmit(value);
      }}
    />
  );
}
