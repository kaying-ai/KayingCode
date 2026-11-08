import { accountError } from "./webAuthService.js";
// 自建账号适配边界：本部署没有官方 OAuth，只接受桌面签发的终端授权。
export function WebLoginPage(_props: { onLogin: (provider: "zai" | "bigmodel") => void }) {
  const zh = /^zh\b/i.test(navigator.language);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <section className="max-w-sm space-y-3">
        <h1 className="text-lg font-medium">KayingCode</h1>
        <p>
          {zh
            ? "请在电脑左下角打开移动端远程控制，使用新二维码授权此浏览器。"
            : "Open mobile remote control on your desktop and scan a new code to authorize this browser."}
        </p>
        {accountError && (
          <p role="alert" className="text-sm text-destructive">
            {zh ? "授权链接已失效或授权服务暂时不可用，请重新扫码或重试。" : accountError}
          </p>
        )}
      </section>
    </main>
  );
}
