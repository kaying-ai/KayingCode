import { createConnection } from "node:net";
import type { Readable } from "node:stream";

export function canUseWindowsDesktopTray(platform: NodeJS.Platform, isPackaged: boolean): boolean {
  return platform === "win32" && isPackaged;
}

export function bindDesktopDevLauncherLifetime(options: {
  isPackaged: boolean;
  enabled: boolean;
  input: Readable;
  requestQuit: () => void;
}) {
  if (options.isPackaged || !options.enabled) return;
  let quitRequested = false;
  const requestQuit = () => {
    if (quitRequested) return;
    quitRequested = true;
    options.requestQuit();
  };
  // 开发启动器被控制台结束时可能来不及执行 signal handler；连接关闭由 OS
  // 反映父进程退出，Main 仍走已有退出屏障，避免 Electron 留在托盘。
  options.input.once("end", requestQuit);
  options.input.once("close", requestQuit);
  options.input.once("error", requestQuit);
  options.input.resume();
}

export function connectDesktopDevLauncherLifetime(options: {
  isPackaged: boolean;
  port?: string;
  token?: string;
  requestQuit: () => void;
}) {
  if (options.isPackaged || !options.port || !options.token) return;
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.once("connect", () => socket.write(`${options.token}\n`));
  bindDesktopDevLauncherLifetime({ ...options, enabled: true, input: socket });
  return socket;
}
