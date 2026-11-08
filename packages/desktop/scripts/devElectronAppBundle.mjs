import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import { promisify } from "node:util";

export const DEV_ELECTRON_PROTOCOL_SCHEME = "kayingcode";
export const DEV_ELECTRON_APP_NAME = "KayingCode Dev";
// 副本布局版本，见 prepareDevElectronAppBundle 中的指纹说明。
export const DEV_ELECTRON_BUNDLE_FORMAT = 5;
export const DEV_ELECTRON_WINDOWS_EXE_NAME = "electron.exe";
export const DEV_ELECTRON_WINDOWS_BUNDLE_FORMAT = 3;

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

// 3.17.2 合并时上游新增了该签名步骤，但本地手工合并只带入了 signApp 默认参数而漏掉函数定义，
// dev 启动会在参数求值阶段抛 ReferenceError。Electron 42 起通知要求有效签名；原 npm runtime
// 签名可能不完整，修改产品身份后也必须重签。这里只对 ignored 的开发副本做 ad-hoc 签名，
// 正式发布仍走现有证书、公证流程。
async function signDevElectronApp(appPath) {
  await execFileAsync("/usr/bin/codesign", [
    "--deep",
    "--force",
    "--sign",
    "-",
    "--preserve-metadata=entitlements,flags,runtime",
    appPath,
  ]);
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function replacePlistString(plist, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`, "u");
  if (!pattern.test(plist)) {
    throw new Error(`Dev Electron Info.plist is missing ${key}`);
  }
  return plist.replace(
    pattern,
    (_match, prefix, suffix) => `${prefix}${escapeXml(value)}${suffix}`,
  );
}

function appendProtocolDeclaration(plist) {
  if (plist.includes(`<string>${DEV_ELECTRON_PROTOCOL_SCHEME}</string>`)) {
    return plist;
  }

  const closingDictIndex = plist.lastIndexOf("</dict>");
  if (closingDictIndex < 0) {
    throw new Error("Dev Electron Info.plist is missing its root dict");
  }

  const protocolDeclaration = `\n\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>${DEV_ELECTRON_APP_NAME}</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${DEV_ELECTRON_PROTOCOL_SCHEME}</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>\n`;
  return `${plist.slice(0, closingDictIndex)}${protocolDeclaration}${plist.slice(closingDictIndex)}`;
}

/**
 * 为 macOS 本地 Dev runtime 写入产品身份和 kayingcode URL scheme。
 * raw Electron 的 Info.plist 没有 CFBundleURLTypes，系统只能把 kayingcode 交给
 * com.github.Electron；这里仅修改启动副本，避免污染 node_modules 中的 Electron。
 */
export function patchDevElectronInfoPlist(plist, iconFile, appBundleId) {
  let patched = replacePlistString(plist, "CFBundleDisplayName", DEV_ELECTRON_APP_NAME);
  patched = replacePlistString(patched, "CFBundleIdentifier", appBundleId);
  patched = replacePlistString(patched, "CFBundleName", DEV_ELECTRON_APP_NAME);
  patched = replacePlistString(patched, "CFBundleIconFile", iconFile);
  return appendProtocolDeclaration(patched);
}

export function resolveDevElectronAppBundlePath({ runtimeRoot, electronVersion, arch }) {
  return posix.join(runtimeRoot, `${electronVersion}-${arch}`, `${DEV_ELECTRON_APP_NAME}.app`);
}

export async function prepareDevElectronAppBundle({
  electronAppPath,
  runtimeRoot,
  electronVersion,
  arch,
  iconPath,
  appBundleId,
  signApp = signDevElectronApp,
}) {
  if (!appBundleId?.trim()) throw new Error("macOS development app bundle identity is required");
  const appPath = resolveDevElectronAppBundlePath({ runtimeRoot, electronVersion, arch });
  const infoPlistPath = posix.join(appPath, "Contents", "Info.plist");
  const sourceExecutablePath = posix.join(electronAppPath, "Contents", "MacOS", "Electron");
  const existingExecutablePath = posix.join(appPath, "Contents", "MacOS", "Electron");
  // 源二进制的身份指纹，写在 .app 外面：放进 Contents 会污染 bundle 结构。
  const sourceStampPath = posix.join(dirname(appPath), ".kayingcode-dev-electron-source.json");
  // Dock#setIcon 不会改变系统通知的应用身份图标；必须在签名前写入 .app 资源与 plist。
  // 内容哈希路径同时让图标更新可被系统识别，不依赖清空用户的全局图标缓存。
  const iconBytes = await readFile(iconPath);
  const iconSha256 = createHash("sha256").update(iconBytes).digest("hex");
  const iconFile = `kayingcode-${iconSha256.slice(0, 16)}.icns`;
  const bundledIconPath = posix.join(appPath, "Contents", "Resources", iconFile);
  // 修复原因：这里原本把两个 Electron 可执行文件（各 ~100MB+）整份读进内存做 equals，
  // 每次 dev 启动都要付一次全量读盘。源二进制由 npm 包解压产出，记录它的 size+mtime
  // 即可判定是否需要重拷，语义等价而开销是常数级。
  //
  // 不直接比较「源与副本」的 mtime：cp 即使开 preserveTimestamps 也会把 mtime
  // 四舍五入到毫秒，源的亚毫秒精度必然丢失，两边永远不相等 —— 那等于没有缓存。
  //
  // format 字段记录副本的布局版本：布局修复（例如符号链接策略变更）时递增，
  // 让已存在的旧副本在源二进制没变的情况下也能被判定为需要重拷。
  const sourceStats = await stat(sourceExecutablePath).catch(() => undefined);
  const sourceStamp = sourceStats
    ? JSON.stringify({
        format: DEV_ELECTRON_BUNDLE_FORMAT,
        size: sourceStats.size,
        mtimeMs: sourceStats.mtimeMs,
        iconSha256,
        appBundleId,
      })
    : undefined;
  let needsCopy = true;
  try {
    const existingInfoPlist = await readFile(infoPlistPath, "utf8");
    await access(existingExecutablePath);
    const existingStamp = await readFile(sourceStampPath, "utf8");
    needsCopy =
      !existingInfoPlist.includes(`<string>${appBundleId}</string>`) ||
      !existingInfoPlist.includes(`<string>${DEV_ELECTRON_PROTOCOL_SCHEME}</string>`) ||
      !existingInfoPlist.includes(`<string>${iconFile}</string>`) ||
      createHash("sha256")
        .update(await readFile(bundledIconPath))
        .digest("hex") !== iconSha256 ||
      sourceStamp === undefined ||
      existingStamp !== sourceStamp;
  } catch {
    // 目录不存在、来源不是本工具生成的 bundle，下面走一次完整复制。
  }

  if (needsCopy) {
    // 只删除本次生成的 ignored runtime 目录，绝不触碰 node_modules 或用户数据。
    await rm(appPath, { recursive: true, force: true });
    await rm(sourceStampPath, { force: true });
    await mkdir(dirname(appPath), { recursive: true });
    // verbatimSymlinks 必须开：Electron Framework.framework 内部靠相对符号链接
    // （Resources -> Versions/Current/Resources、Current -> A）组织。fs.cp 默认会把
    // 相对链接改写成指向 node_modules 的绝对路径，主进程仍能读到，但 GPU / network
    // 等 macOS 沙箱子进程只允许读本 bundle 目录，顺链接出去会被拦，表现为
    // "icudtl.dat not found in bundle" 然后 "GPU process isn't usable. Goodbye."。
    await cp(electronAppPath, appPath, { recursive: true, verbatimSymlinks: true });
    const copiedInfoPlist = await readFile(infoPlistPath, "utf8");
    const previousIcon = copiedInfoPlist.match(
      /<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/u,
    )?.[1];
    // 与正式打包一致，移除原应用图标资源，避免原生图标解析仍选到残留的 Electron 资源。
    if (previousIcon && basename(previousIcon) === previousIcon && previousIcon !== iconFile) {
      await rm(posix.join(appPath, "Contents", "Resources", previousIcon), { force: true });
    }
    await writeFile(bundledIconPath, iconBytes);
    const patchedInfoPlist = patchDevElectronInfoPlist(copiedInfoPlist, iconFile, appBundleId);
    await writeFile(infoPlistPath, patchedInfoPlist, "utf8");
    await signApp(appPath);
    // 指纹最后写：中途失败时下次仍会判定为需要重拷，不会留下半成品缓存。
    if (sourceStamp !== undefined) await writeFile(sourceStampPath, sourceStamp, "utf8");
  }

  return {
    appPath,
    executablePath: posix.join(appPath, "Contents", "MacOS", "Electron"),
  };
}

export function resolveDevElectronWindowsBundlePath({ runtimeRoot, electronVersion, arch }) {
  return join(runtimeRoot, `${electronVersion}-${arch}`, "win32");
}

async function editDevElectronWindowsExecutable(executablePath, iconPath, electronVersion) {
  const { appBuilderPath } = require("app-builder-bin");
  if (typeof appBuilderPath !== "string" || appBuilderPath.length === 0) {
    throw new Error("app-builder-bin did not provide a Windows resource editor");
  }

  const resourceArgs = [
    executablePath,
    "--set-icon",
    iconPath,
    "--set-file-version",
    electronVersion,
    "--set-product-version",
    electronVersion,
    "--set-version-string",
    "FileDescription",
    DEV_ELECTRON_APP_NAME,
    "--set-version-string",
    "ProductName",
    DEV_ELECTRON_APP_NAME,
    "--set-version-string",
    "InternalName",
    DEV_ELECTRON_APP_NAME,
    "--set-version-string",
    "OriginalFilename",
    DEV_ELECTRON_WINDOWS_EXE_NAME,
  ];
  await execFileAsync(appBuilderPath, ["rcedit", "--args", JSON.stringify(resourceArgs)], {
    windowsHide: true,
  });
}

/**
 * 为 Windows 本地 Dev runtime 创建带 KY 可执行文件资源的副本。
 *
 * BrowserWindow#setIcon 只保证窗口级 WM_SETICON；Windows 任务栏仍可能按启动 exe 的资源
 * 解析图标。开发命令直接运行原始 electron.exe 时因此会显示 Electron 默认图标。这里按
 * Electron 官方重品牌方式编辑隔离副本，既覆盖 Shell 的来源，也不污染 node_modules。
 *
 * 修复依据：不能把副本改名成产品名；Electron 会据此把默认开发壳判成 packaged runtime。
 * 保留 electron.exe，只改它的图标和版本资源，维持 process.defaultApp / app.isPackaged 语义。
 * rcedit 写入字符串资源后还必须显式重写 FileVersion/ProductVersion；否则 Electron 41 在
 * Windows 上会读出带尾随 NUL 的版本号，electron-updater 会把它判为非法 semver。
 */
export async function prepareDevElectronWindowsBundle({
  electronDistPath,
  runtimeRoot,
  electronVersion,
  arch,
  iconPath,
  editExecutable = editDevElectronWindowsExecutable,
  refreshShortcutIcons = refreshDevShortcutIconSources,
}) {
  const bundlePath = resolveDevElectronWindowsBundlePath({
    runtimeRoot,
    electronVersion,
    arch,
  });
  const sourceExecutablePath = join(electronDistPath, "electron.exe");
  const executablePath = join(bundlePath, DEV_ELECTRON_WINDOWS_EXE_NAME);
  const sourceStampPath = join(bundlePath, ".kayingcode-dev-electron-source.json");
  const [sourceStats, iconStats] = await Promise.all([stat(sourceExecutablePath), stat(iconPath)]);
  const sourceStamp = JSON.stringify({
    format: DEV_ELECTRON_WINDOWS_BUNDLE_FORMAT,
    executable: { size: sourceStats.size, mtimeMs: sourceStats.mtimeMs },
    icon: { size: iconStats.size, mtimeMs: iconStats.mtimeMs },
  });

  let needsCopy = true;
  try {
    await access(executablePath);
    needsCopy = (await readFile(sourceStampPath, "utf8")) !== sourceStamp;
  } catch {
    // 缓存不存在或上次复制/资源编辑未完成，下面重建完整副本。
  }

  if (needsCopy) {
    await rm(bundlePath, { recursive: true, force: true });
    await mkdir(dirname(bundlePath), { recursive: true });
    await cp(electronDistPath, bundlePath, { recursive: true });
    await editExecutable(executablePath, iconPath, electronVersion);
    // 完成指纹最后写入；rcedit 失败时下次启动必须重新准备，不能复用半成品。
    await writeFile(sourceStampPath, sourceStamp, "utf8");
  }

  // 修复依据：Win11 任务栏图标由与运行 exe 关联（AUMID 或目标路径匹配）的开始菜单
  // 快捷方式决定，窗口 HICON 与 exe 资源都会被其缓存图标覆盖。指向开发副本的既有
  // 用户快捷方式因此会把任务栏冻结在旧图标。这里在每次准备副本后刷新它们的图标源。
  // 刷新是 best-effort：任何失败都折算成 failed 列表返回，绝不阻断 dev 启动。
  let shortcutIconRefresh;
  try {
    shortcutIconRefresh = await refreshShortcutIcons({ executablePath, iconPath, runtimeRoot });
  } catch (error) {
    shortcutIconRefresh = {
      refreshed: [],
      failed: [
        { path: executablePath, error: error instanceof Error ? error.message : String(error) },
      ],
    };
  }

  return { bundlePath, executablePath, shortcutIconRefresh };
}

const DEV_SHORTCUT_ICON_DIR_NAME = "shortcut-icons";
const DEV_SHORTCUT_ICON_HASH_LENGTH = 8;
const DEV_SHORTCUT_REFRESH_TIMEOUT_MS = 15_000;

/**
 * 计算开发快捷方式图标源的落盘路径：runtimeRoot/shortcut-icons/<sha256 前 8 位>.ico。
 * 哈希取自图标内容——icon.ico 每次再生成内容变化都会得到新文件名，重写 IconLocation
 * 后 Shell 的图标缓存键（路径）必然变化，刷新因此是确定性的，不依赖 mtime 缓存语义。
 */
export function resolveDevShortcutIconCopyTarget(iconBytes, runtimeRoot) {
  const hash = createHash("sha256")
    .update(iconBytes)
    .digest("hex")
    .slice(0, DEV_SHORTCUT_ICON_HASH_LENGTH);
  return join(runtimeRoot, DEV_SHORTCUT_ICON_DIR_NAME, `${hash}.ico`);
}

function buildShortcutRefreshScript(executablePath, hashedIconPath) {
  const exeArg = Buffer.from(executablePath, "utf8").toString("base64");
  const icoArg = Buffer.from(hashedIconPath, "utf8").toString("base64");
  return [
    "$ErrorActionPreference='Continue'",
    `$exe=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${exeArg}'))`,
    `$ico=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${icoArg}'))`,
    "$dirs=@(",
    "  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),",
    "  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),",
    "  (Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar')",
    ")",
    "$ws=New-Object -ComObject WScript.Shell",
    "$exeNorm=$exe.ToLowerInvariant()",
    "foreach($d in $dirs){",
    "  if(-not (Test-Path $d)){continue}",
    "  $files=Get-ChildItem -Path $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue",
    "  foreach($f in $files){",
    "    try{",
    "      $s=$ws.CreateShortcut($f.FullName)",
    "      $t=[string]$s.TargetPath",
    "      if(-not $t){continue}",
    "      if($t.ToLowerInvariant() -ne $exeNorm){continue}",
    "      $icon=[string]$s.IconLocation",
    "      $iconPath=$icon",
    "      $idx=$icon.LastIndexOf(',')",
    "      if($idx -ge 0){$iconPath=$icon.Substring(0,$idx)}",
    "      if($iconPath -eq $ico){continue}",
    '      $s.IconLocation="$ico,0"',
    "      $s.Save()",
    '      Write-Output ("REFRESHED`t" + $f.FullName)',
    "    }catch{",
    '      Write-Output ("FAILED`t" + $f.FullName + "`t" + $_.Exception.Message)',
    "    }",
    "  }",
    "}",
  ].join("\n");
}

async function pruneOtherShortcutIcons(iconDir, keepFileName) {
  const entries = await readdir(iconDir).catch(() => []);
  await Promise.all(
    entries
      .filter((name) => name.endsWith(".ico") && name !== keepFileName)
      .map((name) => rm(join(iconDir, name), { force: true }).catch(() => undefined)),
  );
}

async function runWindowsShortcutRefresh({ executablePath, hashedIconPath }) {
  const script = buildShortcutRefreshScript(executablePath, hashedIconPath);
  let stdout = "";
  try {
    const result = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: DEV_SHORTCUT_REFRESH_TIMEOUT_MS },
    );
    stdout = result.stdout ?? "";
  } catch (error) {
    // PowerShell 本身不可用/超时属环境问题：不阻断启动，仅作为失败项交由调用方告警。
    const reason = error instanceof Error ? error.message : String(error);
    return { refreshed: [], failed: [{ path: hashedIconPath, error: reason }] };
  }
  const refreshed = [];
  const failed = [];
  for (const line of stdout.split(/\r?\n/u)) {
    if (line.startsWith("REFRESHED\t")) {
      refreshed.push(line.slice("REFRESHED\t".length));
    } else if (line.startsWith("FAILED\t")) {
      const [, path, ...rest] = line.split("\t");
      failed.push({ path, error: rest.join("\t") });
    }
  }
  return { refreshed, failed };
}

/**
 * 刷新指向开发副本的既有快捷方式的图标源（Windows）。
 *
 * 只做就地 IconLocation 改写：扫描用户/公共开始菜单与任务栏固定区，目标等于开发副本
 * electron.exe 的 .lnk 被重定向到 runtimeRoot 下的哈希 ico；不创建、不删除快捷方式，
 * 不改写目标路径等其他属性（WScript Save 保留 lnk 属性存储中的 AUMID，已实测）。
 * 全程 best-effort：任何失败都进入 failed 列表交由调用方告警，绝不阻断 dev 启动。
 */
export async function refreshDevShortcutIconSources({
  executablePath,
  iconPath,
  runtimeRoot,
  runShortcutRefresh = runWindowsShortcutRefresh,
}) {
  if (process.platform !== "win32") {
    return { hashedIconPath: undefined, refreshed: [], failed: [] };
  }
  const hashedIconPath = resolveDevShortcutIconCopyTarget(await readFile(iconPath), runtimeRoot);
  try {
    await mkdir(dirname(hashedIconPath), { recursive: true });
    await copyFile(iconPath, hashedIconPath);
    await pruneOtherShortcutIcons(dirname(hashedIconPath), basename(hashedIconPath));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { hashedIconPath, refreshed: [], failed: [{ path: hashedIconPath, error: reason }] };
  }
  try {
    const { refreshed, failed } = await runShortcutRefresh({ executablePath, hashedIconPath });
    return { hashedIconPath, refreshed, failed };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { hashedIconPath, refreshed: [], failed: [{ path: hashedIconPath, error: reason }] };
  }
}
