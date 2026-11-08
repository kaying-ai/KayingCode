import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const packageRoot = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "kayingcode-taptap-artifact-"));
const stagedRoot = join(temporaryRoot, "plugin");
const workspaceRoot = join(temporaryRoot, "workspace");
const dataRoot = join(temporaryRoot, "data");

try {
  await Promise.all([mkdir(stagedRoot), mkdir(workspaceRoot), mkdir(dataRoot)]);
  for (const sourceName of [
    ".kayingcode-plugin",
    "bin",
    "commands",
    "dist",
    "package.json",
    "skills",
    "vendor",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    await cp(join(packageRoot, sourceName), join(stagedRoot, basename(sourceName)), {
      recursive: true,
    });
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(stagedRoot, "dist", "mcp", "server.js")],
    cwd: workspaceRoot,
    env: {
      ...process.env,
      KAYINGCODE_PLUGIN_DATA: dataRoot,
      KAYINGCODE_PLUGIN_ID: "kaying-for-taptap@artifact-smoke",
      KAYINGCODE_PLUGIN_ROOT: stagedRoot,
    },
    stderr: "pipe",
  });
  let serverStderr = "";
  transport.stderr?.on("data", (chunk) => {
    serverStderr += chunk.toString();
  });
  const client = new Client(
    { name: "kaying-for-taptap-artifact-smoke", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    try {
      await client.connect(transport);
    } catch (error) {
      throw new Error(
        `Staged MCP connection failed${serverStderr ? `: ${serverStderr.trim()}` : ""}`,
        { cause: error },
      );
    }
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [
        "kaying-for-taptap_project",
        "kaying-for-taptap_doctor",
        "kaying-for-taptap_game_command",
        "kaying-for-taptap_publish",
        "kaying-for-taptap_transcription",
        "prepare_visual_comparison",
      ],
    );

    const metadata = {
      session_id: "artifact-smoke-session",
      workspace_key: workspaceRoot,
      workspace_path: workspaceRoot,
    };
    const doctor = await client.callTool({
      name: "kaying-for-taptap_doctor",
      arguments: { action: "project", projectRoot: workspaceRoot },
      _meta: metadata,
    });
    assert.notEqual(doctor.isError, true, "staged doctor call failed");

    const escaped = await client.callTool({
      name: "kaying-for-taptap_doctor",
      arguments: { action: "project", projectRoot: dataRoot },
      _meta: metadata,
    });
    assert.equal(escaped.isError, true, "workspace escape was not rejected");

    const commands = await client.callTool({
      name: "kaying-for-taptap_game_command",
      arguments: { action: "search", projectRoot: workspaceRoot, limit: 1 },
      _meta: metadata,
    });
    assert.notEqual(commands.isError, true, "staged native command discovery failed");

    const transcription = await client.callTool({
      name: "kaying-for-taptap_transcription",
      arguments: { command: "doctor" },
      _meta: metadata,
    });
    assert.notEqual(transcription.isError, true, "staged transcription runtime failed");
    assert.match(transcription.content[0]?.text ?? "", /t3m 0\.2\.6/u);
  } finally {
    await client.close();
  }

  process.stdout.write(
    `[kaying-for-taptap] staged artifact smoke passed for ${process.platform}-${process.arch}\n`,
  );
} finally {
  // Windows keeps a child cwd locked for a short interval after stdio close; retrying here
  // keeps the smoke test deterministic without weakening its staged-artifact isolation.
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
