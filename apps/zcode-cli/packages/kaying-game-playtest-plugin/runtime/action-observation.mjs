import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { confined } from "./io.mjs";
import { AndroidDevice } from "./android.mjs";
import { FrameStability, sampleFrame, validateRegion } from "./image-observation.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** 同一 owner/锁内合并输入与观察，不增加第二条动作提交路径。 */
export async function actAndObserve(runtime, session, directory, args) {
  runtime.active(session, true);
  if (session.source.kind !== "android") throw new Error("Combined observation requires Android");
  const before = runtime.observed(session, args.observationId);
  const region = validateRegion(args.settleRegion, before);
  const item = session.artifacts.find((candidate) => candidate.id === before.artifactId);
  const reference = digest(await readFile(await confined(directory, join(directory, item.path))));
  const started = performance.now();
  const result = await runtime.act(session, directory, args);
  const actionEnd = performance.now();
  let observationResult;
  try {
    const device = new AndroidDevice(runtime.run, session.device.serial);
    const stability = new FrameStability();
    let frame,
      frameChanged = false,
      settled = false,
      observationLimitation,
      attempts = 0;
    // 等待真实帧变化，不添加固定 sleep；最多 16 次、指定观察预算内采样。
    do {
      frame = await device.observe();
      attempts++;
      frameChanged = digest(frame.bytes) !== reference;
      if (args.waitFor === "stable") {
        try {
          settled = stability.push(
            await sampleFrame(runtime.run, directory, frame, region),
            performance.now(),
          );
        } catch {
          observationLimitation =
            "区域稳定性分析不可用（检查 ffmpeg）；仅返回真实截图，不判定落定。";
          break;
        }
      }
    } while (
      !(args.waitFor === "stable" ? settled : frameChanged) &&
      attempts < 16 &&
      performance.now() - actionEnd < (args.waitForChangeMs ?? 1500)
    );
    observationResult = {
      ...(await runtime.observe(session, directory, frame, args)),
      frameChanged,
      observationAttempts: attempts,
      ...(args.waitFor === "stable" ? { settled, settleRegion: region } : {}),
      ...(observationLimitation ? { observationLimitation } : {}),
    };
    result.action.afterArtifactId = observationResult.artifact.id;
  } catch (error) {
    // 输入已成功落盘，随后截图失败不能改写其结果，否则调用方可能错误重放点击。
    observationResult = {
      observationError: error.message,
      next: "Input was sent; observe again without replaying it",
    };
    if (args.waitFor === "stable") observationResult.settled = false;
  }
  const finished = performance.now();
  result.action.timings = {
    actionMs: Math.round(actionEnd - started),
    observationMs: Math.round(finished - actionEnd),
    totalMs: Math.round(finished - started),
  };
  await runtime.save(directory, session);
  return {
    ...result,
    next: "Inspect the returned screenshot; frame change or stability is not gameplay success",
    ...observationResult,
    timings: result.action.timings,
  };
}
