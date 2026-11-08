import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TOOLS, validate } from "./tools.mjs";
import {
  run,
  workspace,
  locked,
  loadSession,
  assertDeviceFree,
  apkInfo,
  atomicJson,
  projections,
  confined,
} from "./io.mjs";
import { AndroidDevice, validateAction } from "./android.mjs";
import { actAndObserve } from "./action-observation.mjs";
import { Recordings, artifact, observation, attach, highlight } from "./media.mjs";
import { validateEvidence } from "./review.mjs";
import { reportSession } from "./report-session.mjs";
import { defaultGoals, initializeGoals, updateGoal, sessionMetrics } from "./session-updates.mjs";
import { EmulatorManager } from "./emulator.mjs";
import { preview } from "./image-observation.mjs";

export class PlaytestRuntime {
  constructor({ run: executor = run, now = Date.now } = {}) {
    this.run = executor;
    this.now = now;
    this.tail = Promise.resolve();
    this.recordings = new Recordings(executor);
    this.owned = new Map();
    this.emulator = new EmulatorManager({ run: executor });
  }
  call(name, args) {
    const task = this.tail.then(async () => {
      const tool = TOOLS.find((item) => item.name === name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      validate(tool.inputSchema, args);
      const ws = await workspace(args);
      return locked(ws.root, async () => {
        const started = performance.now();
        try {
          return await this.dispatch(name, args, ws);
        } finally {
          if (args.sessionId) {
            const { session, directory } = await loadSession(ws, args.sessionId);
            if (session.ownerPid === process.pid) {
              session.toolTimings ??= [];
              session.toolTimings.push({
                name,
                at: new Date(this.now()).toISOString(),
                durationMs: Math.round(performance.now() - started),
              });
              await this.save(directory, session);
            }
          }
        }
      });
    });
    this.tail = task.catch(() => {});
    return task;
  }
  async prepare(args) {
    const { source } = args;
    if (source.kind === "web") {
      if (!source.url) throw new Error("Web source requires URL");
      const url = new URL(source.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw new Error("Expected HTTP(S) game URL without credentials");
      return {
        source: { kind: "web", url: url.href },
        limitations: [
          "Browser Use owns Web execution; import actual screenshots/recordings and record operation receipts.",
        ],
      };
    }
    if (
      !source.path ||
      !source.packageName ||
      !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(source.packageName)
    )
      throw new Error("Android requires local APK path and valid packageName");
    if (!source.path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(source.path))
      throw new Error("APK path must be absolute");
    const apk = await apkInfo(source.path);
    const device = await AndroidDevice.select(this.run, args.serial);
    const optional = {};
    for (const tool of ["scrcpy", "ffmpeg", "ffprobe"]) {
      try {
        await this.run(tool, [tool === "scrcpy" ? "--version" : "-version"], { timeoutMs: 5000 });
        optional[tool] = true;
      } catch {
        optional[tool] = false;
      }
    }
    return {
      source: { kind: "android", path: apk.path, packageName: source.packageName },
      apk,
      device,
      optional,
      limitations: [
        "APK inspection checks size, ZIP signature and SHA-256 only; use a dedicated test device. ABI/GPU/services can differ from player hardware.",
        "Single touch and no-audio recording only; high-frequency action games and frame-level performance are not measured.",
        ...Object.entries(optional)
          .filter(([, available]) => !available)
          .map(([tool]) => `${tool} unavailable; related media capability is not covered`),
      ],
    };
  }
  async save(directory, session) {
    session.updatedAt = new Date(this.now()).toISOString();
    await atomicJson(join(directory, "session.json"), session);
  }
  async start(args, ws) {
    if (args.strategy === "objective" && !args.objective?.trim())
      throw new Error("Objective strategy requires objective");
    const prepared = await this.prepare(args);
    if (prepared.device) await assertDeviceFree(ws, prepared.device.serial);
    const id = `session-${randomUUID()}`;
    const directory = join(ws.root, id);
    await mkdir(directory);
    for (const name of ["screenshots", "recordings", "highlights", "logs"])
      await mkdir(join(directory, name));
    const depth = args.depth ?? "standard";
    const session = {
      schemaVersion: 1,
      timingVersion: 1,
      id,
      workspaceIdentity: ws.identity,
      title: args.title ?? prepared.source.packageName ?? prepared.source.url,
      status: "starting",
      ownerPid: process.pid,
      createdAt: new Date(this.now()).toISOString(),
      source: prepared.source,
      apk: prepared.apk,
      device: prepared.device,
      depth,
      strategy: args.strategy ?? "explore",
      objective: args.objective,
      focus: args.focus ?? ["gameplay", "onboarding", "visual", "stability"],
      budgetMinutes: args.budgetMinutes ?? { quick: 10, standard: 30, deep: 60 }[depth],
      maxActions: args.maxActions ?? 300,
      reportKind: args.reportKind ?? "evaluation",
      goals: initializeGoals(args.goals ?? defaultGoals(args.reportKind, args.objective)),
      relatedSessionIds: args.relatedSessionIds ?? [],
      actions: [],
      events: [],
      artifacts: [],
      limitations: prepared.limitations,
    };
    await this.save(directory, session);
    try {
      if (prepared.device)
        session.launchReceipt = await new AndroidDevice(this.run, prepared.device.serial).install(
          prepared.apk.path,
          prepared.source.packageName,
        );
      session.status = "running";
      session.deadline = this.now() + session.budgetMinutes * 60000;
      await this.save(directory, session);
      this.owned.set(id, { ...args, sessionId: id });
      return this.status(session, directory);
    } catch (error) {
      session.status = "failed";
      session.limitations.push(`Installation/launch failed: ${error.message}`);
      await this.save(directory, session);
      throw error;
    }
  }
  status(session, directory) {
    return {
      id: session.id,
      directory,
      status: session.status,
      title: session.title,
      source: session.source,
      device: session.device,
      depth: session.depth,
      strategy: session.strategy,
      remainingSeconds: Math.max(
        0,
        Math.round(
          (session.status === "paused"
            ? session.remainingMs
            : (session.deadline ?? this.now()) - this.now()) / 1000,
        ),
      ),
      actions: {
        total: session.actions.length,
        succeeded: session.actions.filter((item) => item.status === "succeeded").length,
        failed: session.actions.filter((item) => item.status === "failed").length,
        unknown: session.actions.filter((item) => ["pending", "unknown"].includes(item.status))
          .length,
      },
      observation: session.observation,
      events: session.events,
      artifacts: session.artifacts,
      recording: this.recordings.status(session),
      limitations: session.limitations,
      goals: session.goals ?? [],
      metrics: sessionMetrics(session, this.now()),
    };
  }
  active(session, budget = false) {
    if (session.status !== "running")
      throw new Error("Session is not running; explicitly resume a paused session");
    if (session.ownerPid !== process.pid)
      throw new Error("Session belongs to another process; resume after its owner exits");
    if (budget && (this.now() >= session.deadline || session.actions.length >= session.maxActions))
      throw new Error("Playtest time/action budget exhausted; collect evidence and stop/report");
  }
  observed(session, id) {
    if (!session.observation || session.observation.id !== id)
      throw new Error("Fresh unconsumed observation required");
    const shot = session.observation;
    if (this.now() - Date.parse(shot.capturedAt) > 60000)
      throw new Error("Observation expired; capture a fresh screenshot");
    return shot;
  }
  async resume(session, directory, ws, args) {
    if (["stopped", "failed", "starting"].includes(session.status))
      throw new Error("Session cannot resume; create a new session");
    if (session.ownerPid !== process.pid && session.status === "running") {
      try {
        process.kill(session.ownerPid, 0);
        throw new Error("Session owner still running");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    if (session.device) {
      await assertDeviceFree(ws, session.device.serial, session.id);
      session.device = await AndroidDevice.select(this.run, session.device.serial);
    }
    for (const action of session.actions)
      if (action.status === "pending") action.status = "unknown";
    if (session.recording?.status === "recording" || this.recordings.jobs.has(session.id)) {
      if (this.recordings.jobs.has(session.id))
        throw new Error("Pause/stop active recording before resuming");
      session.recording.status = "interrupted";
      session.limitations.push(
        "Recording interrupted by runtime exit; unfinished media is not evidence.",
      );
    }
    session.observation = null;
    session.ownerPid = process.pid;
    if (session.pausedAt)
      session.pausedMs =
        (session.pausedMs ?? 0) + Math.max(0, this.now() - Date.parse(session.pausedAt));
    delete session.pausedAt;
    session.status = "running";
    // 恢复只使用原预算剩余时间，不通过 resume 重置耗尽的预算。
    session.deadline =
      this.now() + (session.remainingMs ?? Math.max(0, session.deadline - this.now()));
    delete session.remainingMs;
    await this.save(directory, session);
    this.owned.set(session.id, args);
    return this.status(session, directory);
  }
  async observe(session, directory, captured, args = {}) {
    this.active(session);
    if (!session.device)
      throw new Error("Use Browser Use screenshot, then playtest_attach for Web");
    const shot = captured ?? (await new AndroidDevice(this.run, session.device.serial).observe());
    const path = `screenshots/${randomUUID()}.png`;
    await writeFile(join(directory, path), shot.bytes, { flag: "wx" });
    const item = artifact(session, "screenshot", path, "Android observation", this.now(), {
      bytes: shot.bytes.length,
    });
    const observed = observation(
      session,
      item,
      { width: shot.width, height: shot.height },
      this.now(),
    );
    await this.save(directory, session);
    const imagePath = join(directory, path);
    return {
      artifact: item,
      observation: observed,
      imagePath,
      ...(await preview(this.run, imagePath, shot, args.previewMaxWidth)),
    };
  }
  async act(session, directory, args, external = false) {
    this.active(session, true);
    if (external !== (session.source.kind === "web"))
      throw new Error("Wrong action adapter for source");
    const shot = this.observed(session, args.observationId);
    if (!external) validateAction(args.action, shot);
    const item = {
      id: randomUUID(),
      at: new Date(this.now()).toISOString(),
      observationId: shot.id,
      beforeArtifactId: shot.artifactId,
      action: external ? { type: "external", description: args.description } : args.action,
      status: "pending",
      execution: external ? "Browser Use receipt supplied by Agent" : "adb",
    };
    session.actions.push(item);
    // 非幂等输入先记 pending 并消费截图；进程中断无法确认时只标记 unknown，绝不重放。
    session.observation = null;
    await this.save(directory, session);
    try {
      if (!external)
        await new AndroidDevice(this.run, session.device.serial).act(
          args.action,
          shot,
          session.source.packageName,
        );
      item.status = external && args.outcome === "failed" ? "failed" : "succeeded";
      item.completedAt = new Date(this.now()).toISOString();
      await this.save(directory, session);
      return { action: item, next: "Capture and inspect a new screenshot to verify the result" };
    } catch (error) {
      item.status = "failed";
      item.error = error.message;
      await this.save(directory, session);
      throw error;
    }
  }
  async stop(session, directory, pause) {
    if (session.ownerPid !== process.pid && session.status === "running") {
      try {
        process.kill(session.ownerPid, 0);
        throw new Error("Session owner still running");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    if (session.status === "stopped") return this.status(session, directory);
    if (!["running", "paused"].includes(session.status))
      throw new Error("Only running/paused sessions can stop");
    if (session.recording?.status === "recording" || this.recordings.jobs.has(session.id)) {
      try {
        await this.recordings.stop(session, directory, this.now());
      } catch (error) {
        session.limitations.push(error.message);
      }
    }
    if (session.device) {
      try {
        const logs = await new AndroidDevice(this.run, session.device.serial).logs(
          session.source.packageName,
        );
        const path = `logs/${randomUUID()}.txt`;
        await writeFile(join(directory, path), logs);
        artifact(session, "log", path, "Android logcat (review/redact before sharing)", this.now());
      } catch (error) {
        session.limitations.push(`Log collection unavailable: ${error.message}`);
      }
    }
    session.remainingMs =
      session.status === "paused"
        ? session.remainingMs
        : Math.max(0, session.deadline - this.now());
    session.status = pause ? "paused" : "stopped";
    if (pause) session.pausedAt ??= new Date(this.now()).toISOString();
    else if (session.pausedAt) {
      session.pausedMs =
        (session.pausedMs ?? 0) + Math.max(0, this.now() - Date.parse(session.pausedAt));
      delete session.pausedAt;
    }
    if (!pause) session.endedAt = new Date(this.now()).toISOString();
    session.observation = null;
    await this.save(directory, session);
    await projections(directory, session);
    this.owned.delete(session.id);
    return this.status(session, directory);
  }
  async dispatch(name, args, ws) {
    if (name === "android_emulator") return this.emulator.call(args);
    if (name === "playtest_prepare") return this.prepare(args);
    if (name === "playtest_start") return this.start(args, ws);
    const { session, directory } = await loadSession(ws, args.sessionId);
    if (
      !["playtest_status", "playtest_resume", "playtest_stop", "report_compare"].includes(name) &&
      session.status === "running" &&
      session.ownerPid !== process.pid
    )
      throw new Error("Session belongs to another process; resume after its owner exits");
    switch (name) {
      case "playtest_status":
        return this.status(session, directory);
      case "playtest_resume":
        return this.resume(session, directory, ws, args);
      case "device_observe":
        return this.observe(session, directory, undefined, args);
      case "device_act":
        return args.observe
          ? actAndObserve(this, session, directory, args)
          : this.act(session, directory, args);
      case "playtest_external_action":
        return this.act(session, directory, args, true);
      case "playtest_record": {
        validateEvidence(session, args.evidenceIds, args.certainty !== "unverified");
        const event = {
          id: randomUUID(),
          at: new Date(this.now()).toISOString(),
          offsetSeconds: (this.now() - Date.parse(session.createdAt)) / 1000,
          kind: args.kind,
          summary: args.summary,
          certainty: args.certainty,
          evidenceIds: args.evidenceIds,
          ...(args.section ? { section: args.section } : {}),
        };
        session.events.push(event);
        await this.save(directory, session);
        return event;
      }
      case "playtest_goal": {
        const goal = updateGoal(session, args, this.now());
        await this.save(directory, session);
        return { goal };
      }
      case "playtest_attach": {
        if (args.kind === "screenshot" && session.source.kind === "web") this.active(session);
        const result = await attach(ws, directory, session, args, this.now(), this.run);
        await this.save(directory, session);
        return result;
      }
      case "capture_recording": {
        if (args.operation === "start") this.active(session, true);
        let result;
        try {
          result = await this.recordings[args.operation === "finalize" ? "stop" : args.operation](
            session,
            directory,
            this.now(),
            args,
          );
        } finally {
          await this.save(directory, session);
        }
        return result;
      }
      case "capture_highlight": {
        const result = await highlight(this.run, directory, session, args, this.now());
        await this.save(directory, session);
        return result;
      }
      case "playtest_stop":
        return this.stop(session, directory, args.pause);
      case "report_generate": {
        return reportSession(this, args, ws, session, directory);
      }
      case "report_compare": {
        const previous = await loadSession(ws, args.previousSessionId);
        const reports = [];
        for (const entry of [previous, { session, directory }])
          reports.push(
            JSON.parse(
              await readFile(
                await confined(entry.directory, join(entry.directory, "report.json")),
                "utf8",
              ),
            ),
          );
        const [before, after] = reports;
        return {
          before: before.sessionId,
          after: after.sessionId,
          comparableEnvironment: JSON.stringify(before.device) === JSON.stringify(after.device),
          caveat:
            "Differences in environment, explored progress and coverage may affect scores; this comparison does not prove improvement.",
          dimensions: after.scoring.dimensions.map((item) => {
            const old = before.scoring.dimensions.find(
              (candidate) => candidate.dimension === item.dimension,
            );
            return {
              dimension: item.dimension,
              before: old?.score ?? null,
              after: item.score,
              delta: old?.score != null && item.score !== null ? item.score - old.score : null,
            };
          }),
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  async close() {
    await this.tail;
    for (const args of this.owned.values()) {
      try {
        await this.call("playtest_stop", {
          workspacePath: args.workspacePath,
          ...(args.workspaceIdentity === undefined
            ? {}
            : { workspaceIdentity: args.workspaceIdentity }),
          sessionId: args.sessionId,
          pause: true,
        });
      } catch (error) {
        process.stderr.write(`[game-playtest] cleanup: ${error.message}\n`);
      }
    }
  }
}
