import { buildTapTapMakerPlugin } from "./build.mjs";
import { buildTapTapNativeRuntime } from "./build-native.mjs";
import { ensureVendorAssets } from "./sync-vendor.mjs";

// vendor dist 不入库，构建前按 upstream-lock 幂等补齐，避免新机器缺 TapTap 运行时。
const vendorState = await ensureVendorAssets();
process.stdout.write(`[kaying-for-taptap] vendor ${vendorState.status}\n`);

const serverPath = await buildTapTapMakerPlugin();
const nativePaths = await buildTapTapNativeRuntime();
process.stdout.write(
  `[kaying-for-taptap] runtime built: ${serverPath}; ${nativePaths.core}; ${nativePaths.transcription}\n`,
);
