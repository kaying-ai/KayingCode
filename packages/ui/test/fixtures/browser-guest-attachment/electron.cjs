const { app, BrowserWindow } = require("electron");
app.setPath("userData", process.env.BROWSER_RECOVERY_PROFILE);
let injected = false;
app.on("web-contents-created", (_, guest) => {
  if (guest.getType() !== "webview") return;
  guest.on("did-start-navigation", (details) => {
    if (!injected && details.url === process.env.BROWSER_RECOVERY_TARGET) {
      injected = true;
      // 在首个导航提交前触发真实 renderer 退出，验证 Electron webview 事件而不是仅模拟 DOM。
      setImmediate(() => guest.forcefullyCrashRenderer());
    }
  });
});
app.whenReady().then(() => {
  const window = new BrowserWindow({
    show: false,
    width: 700,
    height: 900,
    webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false },
  });
  window.loadURL(process.env.BROWSER_RECOVERY_FIXTURE);
});
app.on("window-all-closed", () => app.quit());
