import assert from "node:assert/strict";
import { appendFile, access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEV_ELECTRON_WINDOWS_EXE_NAME,
  prepareDevElectronWindowsBundle,
  resolveDevElectronWindowsBundlePath,
  resolveDevShortcutIconCopyTarget,
} from "./devElectronAppBundle.mjs";
import {
  KAYINGCODE_DEVELOPMENT_APP_ID,
  resolveWindowsAppUserModelIdForFlavor,
} from "./desktop-product-identity.mjs";

test("development runtime skips the custom Windows AUMID and keeps macOS bundle id", () => {
  // 修复依据：Win11 任务栏对自定义 AUMID 只按开始菜单匹配的快捷方式解析图标，
  // 开发态设置 AUMID 会让重品牌 exe 图标与窗口 HICON 都不生效。
  assert.equal(resolveWindowsAppUserModelIdForFlavor("production", { isPackaged: false }), null);
  assert.equal(resolveWindowsAppUserModelIdForFlavor("preview", { isPackaged: false }), null);
  assert.notEqual(KAYINGCODE_DEVELOPMENT_APP_ID, "cn.aminer.kayingcode");
});

test("resolveDevElectronWindowsBundlePath isolates version and architecture", () => {
  assert.equal(
    resolveDevElectronWindowsBundlePath({
      runtimeRoot: "runtime",
      electronVersion: "41.0.3",
      arch: "x64",
    }),
    join("runtime", "41.0.3-x64", "win32"),
  );
});

test("prepareDevElectronWindowsBundle brands once and rebuilds after the icon changes", async () => {
  const testRoot = await mkdtemp(join(tmpdir(), "kayingcode-dev-electron-"));
  try {
    const electronDistPath = join(testRoot, "electron-dist");
    const runtimeRoot = join(testRoot, "runtime");
    const iconPath = join(testRoot, "icon.ico");
    await mkdir(electronDistPath, { recursive: true });
    await writeFile(join(electronDistPath, "electron.exe"), "electron-binary", "utf8");
    await writeFile(join(electronDistPath, "runtime.dll"), "runtime", "utf8");
    await writeFile(iconPath, "icon", "utf8");

    let editCount = 0;
    const editExecutable = async (executablePath, receivedIconPath, receivedElectronVersion) => {
      editCount += 1;
      assert.equal(receivedIconPath, iconPath);
      assert.equal(receivedElectronVersion, "41.0.3");
      await appendFile(executablePath, `\npatched-${editCount}`, "utf8");
    };
    const refreshCalls = [];
    const refreshShortcutIcons = async (args) => {
      refreshCalls.push(args);
      return {
        hashedIconPath: join(args.runtimeRoot, "shortcut-icons", "ab12cd34.ico"),
        refreshed: [],
        failed: [],
      };
    };
    const options = {
      electronDistPath,
      runtimeRoot,
      electronVersion: "41.0.3",
      arch: "x64",
      iconPath,
      editExecutable,
      refreshShortcutIcons,
    };

    const first = await prepareDevElectronWindowsBundle(options);
    assert.equal(first.executablePath, join(first.bundlePath, DEV_ELECTRON_WINDOWS_EXE_NAME));
    assert.match(await readFile(first.executablePath, "utf8"), /patched-1/u);
    assert.equal(await readFile(join(first.bundlePath, "runtime.dll"), "utf8"), "runtime");
    assert.equal(DEV_ELECTRON_WINDOWS_EXE_NAME, "electron.exe");
    assert.equal(
      first.shortcutIconRefresh.hashedIconPath,
      join(runtimeRoot, "shortcut-icons", "ab12cd34.ico"),
    );
    assert.equal(refreshCalls[0].executablePath, first.executablePath);
    assert.equal(refreshCalls[0].iconPath, iconPath);
    assert.equal(refreshCalls[0].runtimeRoot, runtimeRoot);

    const second = await prepareDevElectronWindowsBundle(options);
    assert.deepEqual(second, first);
    assert.equal(editCount, 1);

    await writeFile(iconPath, "icon-updated", "utf8");
    const third = await prepareDevElectronWindowsBundle(options);
    assert.deepEqual(third, first);
    assert.equal(editCount, 2);
    assert.match(await readFile(third.executablePath, "utf8"), /patched-2/u);
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
});

test("prepareDevElectronWindowsBundle retries after resource editing fails", async () => {
  const testRoot = await mkdtemp(join(tmpdir(), "kayingcode-dev-electron-failure-"));
  try {
    const electronDistPath = join(testRoot, "electron-dist");
    const runtimeRoot = join(testRoot, "runtime");
    const iconPath = join(testRoot, "icon.ico");
    await mkdir(electronDistPath, { recursive: true });
    await writeFile(join(electronDistPath, "electron.exe"), "electron-binary", "utf8");
    await writeFile(iconPath, "icon", "utf8");

    let editCount = 0;
    const options = {
      electronDistPath,
      runtimeRoot,
      electronVersion: "41.0.3",
      arch: "x64",
      iconPath,
      editExecutable: async () => {
        editCount += 1;
        if (editCount === 1) throw new Error("rcedit failed");
      },
      refreshShortcutIcons: async () => ({ hashedIconPath: undefined, refreshed: [], failed: [] }),
    };

    await assert.rejects(prepareDevElectronWindowsBundle(options), /rcedit failed/u);
    const prepared = await prepareDevElectronWindowsBundle(options);
    assert.equal(editCount, 2);
    await access(prepared.executablePath);
    await access(join(prepared.bundlePath, ".kayingcode-dev-electron-source.json"));
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
});

test("dev shortcut icon target derives a content-hashed ico path", () => {
  const first = resolveDevShortcutIconCopyTarget(Buffer.from("icon-bytes"), "runtime");
  const same = resolveDevShortcutIconCopyTarget(Buffer.from("icon-bytes"), "runtime");
  const changed = resolveDevShortcutIconCopyTarget(Buffer.from("icon-bytes-v2"), "runtime");
  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.match(first, /shortcut-icons[\\/][0-9a-f]{8}\.ico$/u);
});

test("prepareDevElectronWindowsBundle records shortcut refresh failure without aborting startup", async () => {
  const testRoot = await mkdtemp(join(tmpdir(), "kayingcode-dev-electron-refresh-"));
  try {
    const electronDistPath = join(testRoot, "electron-dist");
    const runtimeRoot = join(testRoot, "runtime");
    const iconPath = join(testRoot, "icon.ico");
    await mkdir(electronDistPath, { recursive: true });
    await writeFile(join(electronDistPath, "electron.exe"), "electron-binary", "utf8");
    await writeFile(iconPath, "icon", "utf8");

    // 修复依据：快捷方式图标刷新是 best-effort，任何失败都不能阻断 dev 启动。
    const prepared = await prepareDevElectronWindowsBundle({
      electronDistPath,
      runtimeRoot,
      electronVersion: "41.0.3",
      arch: "x64",
      iconPath,
      editExecutable: async () => {},
      refreshShortcutIcons: async () => {
        throw new Error("powershell exploded");
      },
    });
    assert.equal(prepared.shortcutIconRefresh.refreshed.length, 0);
    assert.equal(prepared.shortcutIconRefresh.failed.length, 1);
    assert.equal(prepared.shortcutIconRefresh.failed[0].error, "powershell exploded");
    await access(prepared.executablePath);
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
});

test("macOS dev bundle signs the brand icon and invalidates cached Electron icons", async () => {
  const { prepareDevElectronAppBundle } = await import("./devElectronAppBundle.mjs");
  const root = await mkdtemp(join(tmpdir(), "kayingcode-mac-brand-"));
  try {
    const electronAppPath = join(root, "Electron.app");
    const resources = join(electronAppPath, "Contents/Resources");
    await mkdir(resources, { recursive: true });
    await mkdir(join(electronAppPath, "Contents/MacOS"), { recursive: true });
    const sourcePlist =
      "<plist><dict><key>CFBundleDisplayName</key><string>Electron</string><key>CFBundleIdentifier</key><string>com.github.Electron</string><key>CFBundleName</key><string>Electron</string><key>CFBundleIconFile</key><string>electron.icns</string></dict></plist>";
    await writeFile(join(electronAppPath, "Contents/Info.plist"), sourcePlist);
    await writeFile(join(electronAppPath, "Contents/MacOS/Electron"), "binary");
    await writeFile(join(resources, "electron.icns"), "electron-icon");
    const iconPath = join(root, "icon.icns");
    await writeFile(iconPath, "brand-icon");
    let signs = 0;
    let expectedId = "dev.kayingcode.app.development.rfixture";
    const options = {
      appBundleId: expectedId,
      electronAppPath,
      runtimeRoot: join(root, "runtime"),
      electronVersion: "44.7.0",
      arch: "arm64",
      iconPath,
      signApp: async (appPath) => {
        const plist = await readFile(join(appPath, "Contents/Info.plist"), "utf8");
        assert.ok(plist.includes(`<string>${expectedId}</string>`));
        const file = plist.match(/<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
        assert.match(file, /^kayingcode-[a-f0-9]+\.icns$/);
        assert.equal(
          await readFile(join(appPath, "Contents/Resources", file), "utf8"),
          await readFile(iconPath, "utf8"),
        );
        await assert.rejects(access(join(appPath, "Contents/Resources/electron.icns")));
        signs++;
      },
    };
    const first = await prepareDevElectronAppBundle(options);
    await prepareDevElectronAppBundle(options);
    assert.equal(signs, 1);
    await writeFile(iconPath, "updated-brand");
    await prepareDevElectronAppBundle(options);
    assert.equal(signs, 2);
    assert.equal(await readFile(join(electronAppPath, "Contents/Info.plist"), "utf8"), sourcePlist);
    let failed = true;
    await writeFile(iconPath, "retry-brand");
    const retryOptions = {
      ...options,
      signApp: async (path) => {
        if (failed) {
          failed = false;
          throw new Error("sign failed");
        }
        await options.signApp(path);
      },
    };
    await assert.rejects(prepareDevElectronAppBundle(retryOptions), /sign failed/);
    await prepareDevElectronAppBundle(retryOptions);
    assert.equal(signs, 3);
    assert.equal(first.appPath, (await prepareDevElectronAppBundle(options)).appPath);
    await assert.rejects(
      prepareDevElectronAppBundle({ ...options, appBundleId: undefined }),
      /identity is required/,
    );
    expectedId = "dev.kayingcode.app.development.rdifferent";
    const changed = await prepareDevElectronAppBundle({ ...options, appBundleId: expectedId });
    assert.equal(signs, 4);
    assert.equal(changed.appPath, first.appPath);
    await prepareDevElectronAppBundle({ ...options, appBundleId: expectedId });
    assert.equal(signs, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
