import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, chmod, readFile, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test(
  "stdio E2E: actual server process, fake adb executable, visual action, reports and EOF checkpoint",
  { skip: process.platform === "win32", timeout: 20000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "playtest-protocol-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const bin = join(root, "bin");
    await mkdir(bin);
    const adb = join(bin, "adb");
    await writeFile(
      adb,
      `#!/usr/bin/env node
const a=process.argv.slice(2);
if(a[0]==='devices') process.stdout.write('List of devices attached\\nemulator-5554\\tdevice model:Demo\\n');
else if(a.includes('screencap')) process.stdout.write(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=','base64'));
else if(a.includes('dumpsys')) process.stdout.write('mResumedActivity: com.example.game/.Main');
else if(a.includes('pidof')) process.stdout.write('123');
else if(a.includes('resolve-activity')) process.stdout.write('com.example.game/.Main');
else process.stdout.write('OK');
`,
    );
    await chmod(adb, 0o755);
    const apk = join(root, "demo.apk");
    await writeFile(apk, Buffer.from([80, 75, 3, 4, 0]));
    const server = fileURLToPath(new URL("../dist/mcp/server.js", import.meta.url));
    const child = spawn(process.execPath, [server], {
      env: { ...process.env, PATH: bin + delimiter + process.env.PATH },
      stdio: ["pipe", "pipe", "pipe"],
    });
    t.after(() => child.kill());
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    const pending = new Map();
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      const response = JSON.parse(line);
      const callback = pending.get(response.id);
      if (callback) {
        pending.delete(response.id);
        callback(response);
      }
    });
    let id = 0;
    function request(method, params) {
      const requestId = ++id;
      return new Promise((resolve) => {
        pending.set(requestId, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
      });
    }
    const initialized = await request("initialize", { protocolVersion: "2024-11-05" });
    assert.equal(initialized.result.serverInfo.name, "kaying-game-playtest");
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
    assert.equal((await request("tools/list")).result.tools.length, 16);
    const base = { workspacePath: root };
    async function tool(name, args) {
      const response = await request("tools/call", { name, arguments: { ...base, ...args } });
      assert.ok(!response.result.isError, response.result.content[0].text);
      return { data: JSON.parse(response.result.content[0].text), response };
    }
    const bad = await request("tools/call", {
      name: "playtest_start",
      arguments: { ...base, source: { kind: "web", url: "file:///secret" } },
    });
    assert.equal(bad.result.isError, true);
    assert.equal((await request("ping")).jsonrpc, "2.0");
    const start = await tool("playtest_start", {
      source: { kind: "android", path: apk, packageName: "com.example.game" },
    });
    const sessionId = start.data.id;
    const shot = await tool("device_observe", { sessionId });
    assert.equal(shot.response.result.content[1].type, "image");
    const combined = await tool("device_act", {
      sessionId,
      observationId: shot.data.observation.id,
      action: { type: "tap", x: 0, y: 0 },
      observe: true,
      waitForChangeMs: 0,
    });
    assert.equal(combined.response.result.content[1].type, "image");
    assert.ok(combined.data.observation.id !== shot.data.observation.id);
    const goal = await tool("playtest_goal", {
      sessionId,
      goalId: "loop",
      status: "partial",
      reason: "输入发送成功，但没有关卡结束证据",
      evidenceIds: [combined.data.artifact.id],
    });
    assert.equal(goal.data.goal.status, "partial");
    await tool("report_generate", {
      sessionId,
      review: {
        gameName: "Demo Game",
        lede: "A colorful puzzle game.",
        sections: [
          {
            key: "mechanics",
            text: "仅验证输入反馈",
            certainty: "observed",
            evidenceIds: [combined.data.artifact.id],
            media: [{ artifactId: combined.data.artifact.id, caption: "观察棋盘与目标" }],
          },
        ],
      },
    });
    const report = await tool("report_generate", { sessionId });
    const reportData = JSON.parse(await readFile(report.data.json, "utf8"));
    assert.equal(reportData.sections.length, 12);
    assert.equal(reportData.title, "Demo Game｜新游戏试玩报告");
    assert.equal(reportData.lede, "A colorful puzzle game.");
    assert.match(reportData.sections.find((s) => s.key === "mechanics").text, /输入反馈/);
    const html = await readFile(report.data.html, "utf8");
    assert.ok(!html.includes("覆盖 0%"));
    assert.ok(html.includes('class="chapter"'));
    assert.equal(reportData.coverage.goals.partial, 1);
    const exited = once(child, "exit");
    child.stdin.end();
    const [code] = await exited;
    assert.equal(code, 0, stderr);
    const state = JSON.parse(await readFile(join(start.data.directory, "session.json"), "utf8"));
    assert.equal(state.status, "paused");
    assert.equal(state.actions[0].status, "succeeded");
  },
);
