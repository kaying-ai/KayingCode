import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { confined, pngDimensions } from "./io.mjs";

export function artifact(session, kind, path, label, now, extra = {}) {
  const item = {
    id: randomUUID(),
    kind,
    path,
    label,
    createdAt: new Date(now).toISOString(),
    offsetSeconds: (now - Date.parse(session.createdAt)) / 1000,
    ...extra,
  };
  session.artifacts.push(item);
  return item;
}

export function observation(session, item, dimensions, now) {
  session.observation = {
    id: randomUUID(),
    artifactId: item.id,
    ...dimensions,
    capturedAt: new Date(now).toISOString(),
  };
  return session.observation;
}

export async function attach(ws, directory, session, args, now, run) {
  const source = await confined(ws.path, args.path);
  const info = await stat(source);
  const extension = extname(source).toLowerCase();
  const extensions = { screenshot: [".png"], recording: [".mp4", ".webm"], log: [".txt", ".log"] };
  const maximum = args.kind === "recording" ? 2 * 1024 ** 3 : 8 * 1024 ** 2;
  if (
    !info.isFile() ||
    info.size === 0 ||
    info.size > maximum ||
    !extensions[args.kind].includes(extension)
  )
    throw new Error("Unsupported evidence file type/size");
  const folder =
    args.kind === "screenshot" ? "screenshots" : args.kind === "recording" ? "recordings" : "logs";
  const path = `${folder}/${randomUUID()}${extension}`;
  const bytes = args.kind === "recording" ? undefined : await readFile(source);
  let dimensions;
  let video = {};
  if (args.kind === "screenshot") dimensions = pngDimensions(bytes);
  if (args.kind === "recording") {
    if (args.startedAt && !Number.isFinite(Date.parse(args.startedAt)))
      throw new Error("Invalid recording startedAt");
    const probe = JSON.parse(
      (
        await run("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=codec_type",
          "-of",
          "json",
          source,
        ])
      ).toString(),
    );
    const durationSeconds = Number(probe.format?.duration);
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      !probe.streams?.some((s) => s.codec_type === "video")
    )
      throw new Error("Imported recording has no playable video");
    video = {
      durationSeconds,
      ...(args.startedAt ? { startedAt: new Date(args.startedAt).toISOString() } : {}),
      timebase: args.startedAt ? "declared" : "unknown",
    };
  }
  const target = join(directory, path);
  // 异步流复制录像，避免把长视频整体读入 Agent 进程内存。
  if (args.kind === "recording") {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(source, target);
  } else await writeFile(target, bytes, { flag: "wx" });
  const item = artifact(session, args.kind, path, args.label ?? `Imported ${args.kind}`, now, {
    origin: "workspace-import",
    bytes: info.size,
    ...video,
  });
  const shot =
    dimensions && session.source.kind === "web"
      ? observation(session, item, dimensions, now)
      : undefined;
  return { artifact: item, ...(shot ? { observation: shot } : {}) };
}

export class Recordings {
  constructor(run, spawnRecording = spawn) {
    this.run = run;
    this.spawnRecording = spawnRecording;
    this.jobs = new Map();
  }
  status(session) {
    const job = this.jobs.get(session.id);
    if (!job?.result) return session.recording;
    return {
      ...session.recording,
      status: job.result.code === 0 ? "awaiting-finalization" : "failed",
      diagnostic: job.error,
    };
  }
  async start(session, directory, now, args = {}) {
    if (session.source.kind !== "android")
      throw new Error("Web recording uses Browser Use; import its finalized media");
    if (this.jobs.has(session.id)) throw new Error("Recording already running");
    await this.run("scrcpy", ["--version"]);
    await this.run("ffprobe", ["-version"]);
    const path = `recordings/${randomUUID()}.mp4`;
    const child = this.spawnRecording(
      "scrcpy",
      [
        "--serial",
        session.device.serial,
        "--no-playback",
        "--no-audio",
        "--max-fps=15",
        `--time-limit=${args.durationSeconds ?? 60}`,
        `--record=${join(directory, path)}`,
      ],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    const job = { child, path, startedAt: now, error: "" };
    child.stderr.on("data", (bytes) => {
      job.error = (job.error + bytes.toString()).slice(-4000);
    });
    const closed = new Promise((resolve) => {
      child.on("error", (error) => {
        job.error = error.message;
        job.result = { code: -1 };
        resolve(job.result);
      });
      child.on("close", (code, signal) => {
        job.result = { code, signal };
        resolve(job.result);
      });
    });
    job.closed = closed;
    await once(child, "spawn");
    this.jobs.set(session.id, job);
    session.recording = {
      path,
      startedAt: new Date(now).toISOString(),
      ownerPid: process.pid,
      status: "recording",
      audio: false,
      durationLimitSeconds: args.durationSeconds ?? 60,
    };
    return session.recording;
  }
  async stop(session, directory, now) {
    const job = this.jobs.get(session.id);
    if (!job) {
      if (session.recording?.status === "recording") session.recording.status = "interrupted";
      return { limitation: "No active recording in this process" };
    }
    // 限时录制自然退出时不再发送信号；避免干扰已完成的 MP4 封装。
    if (!job.result) job.child.kill("SIGINT");
    let timer;
    const result = await Promise.race([
      job.closed,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 10000);
      }),
    ]);
    clearTimeout(timer);
    this.jobs.delete(session.id);
    if (!result) {
      job.child.kill("SIGKILL");
      await job.closed;
      session.recording.status = "failed";
      throw new Error("Recording finalization timed out; media was not registered");
    }
    try {
      const file = await confined(directory, join(directory, job.path));
      const info = await stat(file);
      if (info.size < 32 || (result.code !== 0 && result.signal !== "SIGINT"))
        throw new Error(`Recording failed: ${job.error}`);
      const probe = JSON.parse(
        (
          await this.run("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            file,
          ])
        ).toString(),
      );
      const durationSeconds = Number(probe.format?.duration);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
        throw new Error("Recording has no playable duration");
      const item = artifact(
        session,
        "recording",
        job.path,
        "Android session recording (no audio)",
        now,
        {
          bytes: info.size,
          durationSeconds,
          startedAt: new Date(job.startedAt).toISOString(),
          audio: false,
        },
      );
      session.recording.status = "finalized";
      return { artifact: item };
    } catch (error) {
      session.recording.status = "failed";
      throw error;
    }
  }
}

export async function highlight(run, directory, session, args, now) {
  const source = session.artifacts.find((item) => item.id === args.artifactId);
  if (source?.kind !== "recording") throw new Error("A registered recording is required");
  const input = await confined(directory, join(directory, source.path));
  const probe = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    input,
  ]);
  const duration = Number(JSON.parse(probe.toString()).format?.duration);
  if (!Number.isFinite(duration) || args.startSeconds + args.durationSeconds > duration)
    throw new Error("Highlight interval exceeds recording duration");
  const path = `highlights/${randomUUID()}.mp4`;
  await run(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-ss",
      String(args.startSeconds),
      "-i",
      input,
      "-t",
      String(args.durationSeconds),
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      join(directory, path),
    ],
    { timeoutMs: 120000 },
  );
  const info = await stat(join(directory, path));
  if (!info.size) throw new Error("FFmpeg produced empty output");
  return {
    artifact: artifact(session, "highlight", path, args.label ?? "Gameplay highlight", now, {
      sourceArtifactId: source.id,
      startSeconds: args.startSeconds,
      durationSeconds: args.durationSeconds,
      bytes: info.size,
    }),
  };
}
