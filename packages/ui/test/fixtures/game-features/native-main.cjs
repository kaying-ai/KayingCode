const { app, BrowserWindow, session } = require("electron");
app.whenReady().then(async () => {
  const url = process.argv.at(-1);
  session
    .fromPartition("persist:kayingcode-embedded-browser")
    .webRequest.onBeforeRequest(
      { urls: ["https://www.kayingai.com/*", "https://www.taptap.cn/*"] },
      (_details, callback) => callback({ redirectURL: new URL("embedded.html", url).href }),
    );
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  await window.loadURL(url);
});
app.on("window-all-closed", () => app.quit());
