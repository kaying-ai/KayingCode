import assert from "node:assert/strict";
import { test } from "vitest";
import { parsePluginBrowserComparePublicationV1 } from "./plugin-browser-compare.js";

const validReceipt = {
  schemaVersion: 1,
  pluginId: "fixture@fixture-marketplace",
  contributionId: "transcription-compare",
  operationId: "compare-1",
  workspaceKey: "workspace-a",
  sessionId: "session-a",
  projectRoot: "/workspace/a/game",
  sourceUrl: "http://127.0.0.1:4173/game/",
  targetUrl: "https://maker.taptap.cn/app/example",
  viewport: { width: 1280, height: 720 },
  targetPublication: { operationId: "publish-1", revision: 3 },
  publishedAt: "2026-09-28T00:00:00.000Z",
  revision: 2,
};

test("parses and canonicalizes a comparison receipt", () => {
  const parsed = parsePluginBrowserComparePublicationV1(validReceipt);
  assert.equal(parsed.sourceUrl, "http://127.0.0.1:4173/game/");
  assert.match(parsed.targetUrl, /localDev=1/u);
  assert.match(parsed.targetUrl, /tab=preview/u);
});

test("rejects credential-bearing source URLs", () => {
  assert.throws(
    () =>
      parsePluginBrowserComparePublicationV1({
        ...validReceipt,
        sourceUrl: "https://user:secret@example.com/game",
      }),
    /untrusted sourceUrl/u,
  );
});

test("rejects non-playable target URLs", () => {
  assert.throws(
    () =>
      parsePluginBrowserComparePublicationV1({
        ...validReceipt,
        targetUrl: "https://example.com/game",
      }),
    /untrusted targetUrl/u,
  );
});
