import { pngDimensions } from "./io.mjs";
import { inspectRendering } from "./device-environment.mjs";

export class AndroidDevice {
  constructor(run, serial) {
    this.run = run;
    this.serial = serial;
  }
  async adb(args, options) {
    return this.run("adb", ["-s", this.serial, ...args], options);
  }
  static async list(run) {
    const output = (await run("adb", ["devices", "-l"])).toString();
    return output
      .split(/\r?\n/)
      .slice(1)
      .filter((line) => /^\S+\s+\S+/.test(line))
      .map((line) => {
        const [serial, status, ...details] = line.trim().split(/\s+/);
        return { serial, status, details: details.join(" ") };
      });
  }
  static async select(run, serial) {
    const devices = await AndroidDevice.list(run);
    const ready = devices.filter((device) => device.status === "device");
    if (!serial && ready.length !== 1)
      throw new Error(`Select serial explicitly: ${JSON.stringify(devices)}`);
    const selected = devices.find((device) => device.serial === (serial ?? ready[0]?.serial));
    if (!selected || selected.status !== "device" || !/^[a-zA-Z0-9_.:-]+$/.test(selected.serial))
      throw new Error("Device unavailable, offline or unauthorized");
    const adapter = new AndroidDevice(run, selected.serial);
    const environment = {};
    for (const [key, prop] of [
      ["model", "ro.product.model"],
      ["android", "ro.build.version.release"],
      ["abi", "ro.product.cpu.abi"],
      ["bootCompleted", "sys.boot_completed"],
    ])
      environment[key] = (await adapter.adb(["shell", "getprop", prop])).toString().trim();
    environment.bootCompleted = environment.bootCompleted === "1";
    Object.assign(environment, await inspectRendering(adapter));
    return { ...selected, environment };
  }
  async install(apk, packageName) {
    const receipt = (await this.adb(["install", "-r", apk], { timeoutMs: 120000 })).toString();
    if (/Failure\s*\[|INSTALL_FAILED|Error:/i.test(receipt))
      throw new Error(`APK installation failed: ${receipt}`);
    // Android 16 上 monkey 会因 SYS_KEYS 无实体按键返回 251；显式解析并启动 Activity
    // 已在相同 APK/模拟器验证成功，也避免随机事件启动和跨包目标。
    const resolved = (
      await this.adb(["shell", "cmd", "package", "resolve-activity", "--brief", packageName])
    ).toString();
    const component = resolved.trim().split(/\r?\n/).at(-1);
    if (
      !/^[A-Za-z][\w.]*\/\.?[A-Za-z][\w.]*$/.test(component ?? "") ||
      component.split("/")[0] !== packageName
    )
      throw new Error("Cannot resolve target package Activity");
    const launch = (await this.adb(["shell", "am", "start", "-W", "-n", component])).toString();
    if (/aborted|No activities found|Error:/i.test(launch))
      throw new Error(`Game launch failed: ${launch}`);
    return { install: receipt.trim(), launch: launch.trim() };
  }
  async foreground(packageName) {
    const state = (await this.adb(["shell", "dumpsys", "activity", "activities"])).toString();
    const resumed = state
      .split(/\r?\n/)
      .filter((line) => /mResumedActivity|topResumedActivity/.test(line));
    if (!resumed.some((line) => line.match(/(?:^|\s)([A-Za-z][\w.]*)\//)?.[1] === packageName))
      throw new Error("Target game is not foreground; inspect device before continuing");
  }
  async observe() {
    const bytes = await this.adb(["exec-out", "screencap", "-p"]);
    return { bytes, ...pngDimensions(bytes) };
  }
  async act(action, observation, packageName) {
    const args = validateAction(action, observation);
    await this.foreground(packageName);
    if (action.type === "wait") {
      await new Promise((resolve) => setTimeout(resolve, action.durationMs));
      return;
    }
    await this.adb(["shell", "input", ...args]);
  }
  async logs(packageName) {
    const pid = (await this.adb(["shell", "pidof", "-s", packageName])).toString().trim();
    // 只采集目标游戏进程，避免把个人设备上其他应用的日志写入试玩证据。
    if (!/^\d+$/.test(pid))
      throw new Error("Target process unavailable; crash logs require explicit collection");
    return this.adb(["logcat", "-d", "-t", "300", `--pid=${pid}`]);
  }
}

export function validateAction(action, observation) {
  const coordinate = (value, max) => {
    if (!Number.isInteger(value) || value < 0 || value >= max)
      throw new Error("Action coordinate out of screenshot bounds");
    return String(value);
  };
  const point = (x, y) => [coordinate(x, observation.width), coordinate(y, observation.height)];
  if (action.type === "back") return ["keyevent", "4"];
  if (action.type === "wait") {
    if (!action.durationMs) throw new Error("wait requires durationMs");
    return [];
  }
  const from = point(action.x, action.y);
  if (action.type === "tap") return ["tap", ...from];
  if (!action.durationMs) throw new Error("swipe/long-press requires durationMs");
  return [
    "swipe",
    ...from,
    ...(action.type === "long-press" ? from : point(action.toX, action.toY)),
    String(action.durationMs),
  ];
}
