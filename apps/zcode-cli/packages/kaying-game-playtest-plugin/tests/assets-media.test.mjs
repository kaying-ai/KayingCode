import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import test from "node:test";
import { collectSeaOfficialPluginAssets } from "../../../apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs";
import { PlaytestRuntime } from "../runtime/playtest.mjs";
import { run, locked } from "../runtime/io.mjs";

test("release catalog includes runnable bundle, skill, command and references in SEA assets", async (t) => {
  const repository = resolve(import.meta.dirname, "../../..");
  const root = await mkdtemp(join(tmpdir(), "playtest-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const catalog = JSON.parse(
    await readFile(join(repository, "config/official-plugins.json"), "utf8"),
  );
  const plugin = catalog.plugins.find((item) => item.name === "kaying-game-playtest");
  assert.equal(plugin.defaultEnabled, true);
  await mkdir(join(root, "config"));
  await mkdir(join(root, "plugins"));
  await symlink(
    join(repository, plugin.sourceRoot),
    join(root, plugin.sourceRoot),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(
    join(root, "config/official-plugins.json"),
    JSON.stringify({ schemaVersion: 1, marketplace: catalog.marketplace, plugins: [plugin] }),
  );
  const result = await collectSeaOfficialPluginAssets({
    root,
    stagingDirectory: join(root, "stage"),
    requireRuntime: true,
  });
  const packaged = result.manifest.plugins[0];
  for (const path of plugin.requiredSeedPaths)
    assert.ok(
      packaged.files.some((file) => file.path === path),
      path,
    );
  const installed = join(root, "installed");
  for (const file of packaged.files) {
    const target = join(installed, file.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repository, plugin.sourceRoot, file.path), target);
  }
  const manifest = JSON.parse(
    await readFile(join(installed, ".kayingcode-plugin/plugin.json"), "utf8"),
  );
  assert.equal(
    manifest.mcpServers.kaying_game_playtest.args[0],
    "${KAYINGCODE_PLUGIN_ROOT}/dist/mcp/server.js",
  );
  assert.ok(!packaged.files.some((file) => file.path.startsWith("runtime/")));
});

test("workspace lock rejects concurrent writers and stale locks fail closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "playtest-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await locked(root, async () => {
    await assert.rejects(
      locked(root, async () => {}),
      /busy/,
    );
  });
  await writeFile(join(root, ".writer-lock"), "invalid");
  await assert.rejects(
    locked(root, async () => {}),
    /Invalid/,
  );
});

test("interrupted pending inputs become unknown and old observations cannot execute after resume", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "playtest-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = new PlaytestRuntime();
  const base = { workspacePath: root };
  const session = await runtime.call("playtest_start", {
    ...base,
    source: { kind: "web", url: "https://example.com/game" },
  });
  const path = join(session.directory, "session.json");
  const state = JSON.parse(await readFile(path, "utf8"));
  state.actions.push({ id: "interrupted", status: "pending" });
  state.observation = { id: "old", capturedAt: new Date().toISOString() };
  await writeFile(path, JSON.stringify(state));
  const resumed = await new PlaytestRuntime().call("playtest_resume", {
    ...base,
    sessionId: session.id,
  });
  assert.equal(resumed.actions.unknown, 1);
  assert.equal(resumed.observation, null);
  assert.equal(JSON.parse(await readFile(path, "utf8")).actions[0].status, "unknown");
});

test(
  "real FFmpeg media fixture: import video, bounded clip, playable offline report and comparison",
  { timeout: 20000 },
  async (t) => {
    try {
      await run("ffmpeg", ["-version"]);
      await run("ffprobe", ["-version"]);
    } catch {
      t.skip("FFmpeg/ffprobe unavailable");
      return;
    }
    const root = await mkdtemp(join(tmpdir(), "playtest-video-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const video = join(root, "source.mp4");
    await run("ffmpeg", [
      "-nostdin",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x240:rate=10",
      "-t",
      "3",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      video,
    ]);
    const runtime = new PlaytestRuntime();
    const base = { workspacePath: root };
    const first = await runtime.call("playtest_start", {
      ...base,
      source: { kind: "web", url: "https://example.com/game" },
    });
    const args = { ...base, sessionId: first.id };
    const evidence = await runtime.call("playtest_attach", {
      ...args,
      path: video,
      kind: "recording",
      label: "Synthetic test fixture, not gameplay",
    });
    await assert.rejects(
      runtime.call("capture_highlight", {
        ...args,
        artifactId: evidence.artifact.id,
        startSeconds: 2,
        durationSeconds: 3,
      }),
      /exceeds/,
    );
    const clip = await runtime.call("capture_highlight", {
      ...args,
      artifactId: evidence.artifact.id,
      startSeconds: 1,
      durationSeconds: 1,
    });
    const probe = JSON.parse(
      (
        await run("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "json",
          join(first.directory, clip.artifact.path),
        ])
      ).toString(),
    );
    assert.ok(Number(probe.format.duration) >= 0.9);
    await runtime.call("playtest_stop", args);
    const report = await runtime.call("report_generate", args);
    assert.ok((await readFile(report.html, "utf8")).includes("<video controls"));
    const second = await runtime.call("playtest_start", {
      ...base,
      source: { kind: "web", url: "https://example.com/game-v2" },
    });
    await runtime.call("report_generate", { ...base, sessionId: second.id });
    const comparison = await runtime.call("report_compare", {
      ...base,
      sessionId: second.id,
      previousSessionId: first.id,
    });
    assert.ok(comparison.dimensions.every((item) => item.delta === null));
    await runtime.close();
  },
);
