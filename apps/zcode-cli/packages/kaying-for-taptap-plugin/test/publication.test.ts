import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  parseTapTapPreviewPublicationV1,
  TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH,
} from "@zcode/shared";
import { writeTapTapPreviewPublication } from "../src/mcp/publication.js";
import { KAYING_FOR_TAPTAP_PUBLIC_TOOLS } from "../src/tools/public-tools.js";

test("the official MCP surface exposes the stable TapTap tools and built-in transcription", () => {
  assert.deepEqual(
    KAYING_FOR_TAPTAP_PUBLIC_TOOLS.map((tool) => tool.name),
    [
      "kaying-for-taptap_project",
      "kaying-for-taptap_doctor",
      "kaying-for-taptap_game_command",
      "kaying-for-taptap_publish",
      "kaying-for-taptap_transcription",
    ],
  );
});

test("publication receipt is atomic, strictly parsed and advances for the same URL", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "kayingcode-taptap-publication-"));
  const projectRoot = join(workspaceRoot, "games", "example");
  try {
    const input = {
      previewUrl: "https://maker.taptap.cn/app/example",
      projectRoot,
      receiptRoot: workspaceRoot,
      workspaceKey: "remote:example:/workspace",
      sessionId: "task-publisher",
    };
    const first = await writeTapTapPreviewPublication(input);
    const second = await writeTapTapPreviewPublication(input);

    assert.equal(first.revision, 1);
    assert.equal(first.sessionId, "task-publisher");
    assert.equal(second.revision, 2);
    assert.notEqual(first.operationId, second.operationId);
    assert.equal(second.previewUrl, "https://maker.taptap.cn/app/example?localDev=1");

    const receiptPath = join(workspaceRoot, ...TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH.split("/"));
    const persisted = parseTapTapPreviewPublicationV1(
      JSON.parse(await readFile(receiptPath, "utf8")),
    );
    assert.deepEqual(persisted, second);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("legacy publications remain readable without guessing a task owner", async () => {
  const receipt = {
    schemaVersion: 1,
    operationId: "legacy",
    workspaceKey: "workspace",
    projectRoot: "/workspace/game",
    previewUrl: "https://maker.taptap.cn/app/example",
    publishedAt: "2026-10-18T00:00:00.000Z",
    revision: 1,
  };
  assert.equal(parseTapTapPreviewPublicationV1(receipt).sessionId, undefined);
  assert.equal(
    parseTapTapPreviewPublicationV1({ ...receipt, sessionId: "task" }).sessionId,
    "task",
  );
  assert.throws(() => parseTapTapPreviewPublicationV1({ ...receipt, sessionId: " " }));
  for (const previewMode of ["standalone", "transcription-compare"] as const) {
    assert.equal(
      parseTapTapPreviewPublicationV1({ ...receipt, previewMode }).previewMode,
      previewMode,
    );
  }
  assert.throws(() => parseTapTapPreviewPublicationV1({ ...receipt, previewMode: "unknown" }));
});

test("transcription publications select comparison before its first receipt and on every revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-taptap-transcription-"));
  const conversion = join(root, "conversion");
  const projectRoot = join(conversion, "output", "maker");
  try {
    await mkdir(projectRoot, { recursive: true });
    const info = {
      t3m_version: "1.0",
      source_url: "https://example.com/game",
      paths: { dest: "output/maker" },
    };
    await writeFile(join(conversion, "project-info.json"), JSON.stringify(info));
    const input = {
      previewUrl: "https://maker.taptap.cn/app/game",
      projectRoot,
      receiptRoot: root,
      workspaceKey: "identity-a",
      sessionId: "task-a",
    };
    const first = await writeTapTapPreviewPublication(input);
    const second = await writeTapTapPreviewPublication(input);
    assert.equal(first.previewMode, "transcription-compare");
    assert.equal(second.previewMode, "transcription-compare");
    assert.equal(second.revision, first.revision + 1);
    const ordinary = await writeTapTapPreviewPublication({
      ...input,
      projectRoot: join(root, "ordinary"),
      sessionId: "task-b",
    });
    assert.equal(ordinary.previewMode, "standalone");
    // 元数据必须属于发布项目且位于当前工作区内，不能仅凭文件名或 source_url 抑制普通预览。
    for (const invalid of [
      { ...info, paths: { dest: "another" } },
      { source_url: info.source_url, paths: info.paths },
    ]) {
      await writeFile(join(conversion, "project-info.json"), JSON.stringify(invalid));
      assert.equal((await writeTapTapPreviewPublication(input)).previewMode, "standalone");
    }
    await writeFile(join(conversion, "project-info.json"), JSON.stringify(info));
    assert.equal(
      (await writeTapTapPreviewPublication({ ...input, receiptRoot: projectRoot })).previewMode,
      "standalone",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication rejects credentials and non-preview TapTap routes without touching disk", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "kayingcode-taptap-untrusted-"));
  try {
    await assert.rejects(
      writeTapTapPreviewPublication({
        previewUrl: "https://user:secret@maker.taptap.cn/app/example",
        projectRoot,
        workspaceKey: projectRoot,
      }),
      /untrusted preview URL/u,
    );
    await assert.rejects(
      writeTapTapPreviewPublication({
        previewUrl: "https://maker.taptap.cn/account/login",
        projectRoot,
        workspaceKey: projectRoot,
      }),
      /untrusted preview URL/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
