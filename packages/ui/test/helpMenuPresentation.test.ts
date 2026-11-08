import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";

test("help menu removes unavailable links and keeps forms plus working desktop actions", async () => {
  const source = await readFile(
    new URL("../src/WorkspaceHelpMenuButton.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /workspaceHeader\.help\.(?:docs|community)/u);
  assert.doesNotMatch(source, /openProductDocs|openCommunity/u);
  assert.match(source, /workspaceHeader\.help\.issueReport/u);
  assert.match(source, /workspaceHeader\.help\.productRequest/u);
  assert.match(source, /DesktopCommandIds\.OpenResourceManager/u);
  assert.match(source, /DesktopCommandIds\.ShowAbout/u);
  assert.match(source, /checkForUpdates/u);
});

test("feedback success copy identifies the local mock", () => {
  for (const messages of [zhCN, enUS]) {
    assert.match(messages["feedback.featureRequest.submittedToast"], /(?:本地 Mock|local mock)/iu);
    assert.match(messages["feedback.submission.submittedDetail"], /(?:本地 Mock|local mock)/iu);
    assert.match(messages["feedback.submission.submittedToast"], /(?:本地 Mock|local mock)/iu);
  }
});
