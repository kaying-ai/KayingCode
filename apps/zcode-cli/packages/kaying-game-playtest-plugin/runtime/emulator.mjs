import { spawn as spawnProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { AndroidDevice } from "./android.mjs";
export { rendererInfo } from "./device-environment.mjs";

async function emulatorCommand() {
  const name = process.platform === "win32" ? "emulator.exe" : "emulator";
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "darwin"
      ? join(homedir(), "Library", "Android", "sdk")
      : process.platform === "win32" && process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "Android", "Sdk")
        : join(homedir(), "Android", "Sdk"),
  ];
  for (const root of roots.filter(Boolean)) {
    const command = join(root, "emulator", name);
    try {
      await access(command);
      return command;
    } catch {
      /* 继续查标准 SDK 位置。 */
    }
  }
  return name;
}
async function launch(command, args) {
  const child = spawnProcess(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  return child;
}
export class EmulatorManager {
  constructor({ run, spawn = launch }) {
    this.run = run;
    this.spawn = spawn;
  }
  async call(args) {
    const devices = await AndroidDevice.list(this.run);
    if (args.operation === "start" && devices.length) {
      if (!args.serial && devices.length !== 1)
        throw new Error("Multiple devices: select serial explicitly");
      const selected = devices.find((d) => d.serial === (args.serial ?? devices[0].serial));
      if (!selected)
        throw new Error(
          "Requested serial unavailable; inspect devices before starting another AVD",
        );
      if (selected.status !== "device")
        return {
          reused: true,
          status: selected.status,
          device: selected,
          next: "inspect again after boot; no duplicate emulator was launched",
        };
      const device = await AndroidDevice.select(this.run, selected.serial);
      return {
        reused: true,
        status: device.environment.bootCompleted ? "ready" : "booting",
        device,
      };
    }
    if (args.operation === "start" && args.serial) throw new Error("Requested serial unavailable");
    if (args.operation === "start" && this.pendingLaunch)
      return {
        ...this.pendingLaunch,
        reused: true,
        next: "AVD is starting; inspect bootCompleted before another start",
      };
    const command = await emulatorCommand();
    let avds = [],
      emulatorLimitation;
    try {
      avds = (await this.run(command, ["-list-avds"]))
        .toString()
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    } catch (error) {
      if (args.operation === "start") throw error;
      emulatorLimitation = "无法查询 AVD；已连接设备仍可检查。请检查 Android SDK emulator。";
    }
    if (args.operation === "inspect") {
      const inspected = [];
      for (const device of devices)
        inspected.push(
          device.status === "device" ? await AndroidDevice.select(this.run, device.serial) : device,
        );
      return {
        devices: inspected,
        avds,
        preferredArguments: ["-gpu", "host", "-no-snapshot-load", "-no-snapshot-save"],
        ...(emulatorLimitation ? { emulatorLimitation } : {}),
      };
    }
    const avd = args.avd ?? (avds.length === 1 ? avds[0] : undefined);
    if (!avd || !avds.includes(avd))
      throw new Error(`Choose an existing AVD explicitly: ${JSON.stringify(avds)}`);
    // auto 曾在本次实测回退 SwiftShader；优先 host，并保留认证和游戏 userdata。
    const launchArgs = ["-avd", avd, "-gpu", "host", "-no-snapshot-load", "-no-snapshot-save"];
    const child = await this.spawn(command, launchArgs);
    this.pendingLaunch = {
      status: "starting",
      reused: false,
      avd,
      pid: child.pid,
      arguments: launchArgs,
      next: "Call android_emulator(inspect) until bootCompleted; inspect actual GLES. Spawn is not readiness or proof of hardware rendering.",
    };
    child.once?.("exit", () => {
      this.pendingLaunch = undefined;
    });
    return this.pendingLaunch;
  }
}
