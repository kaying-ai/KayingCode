import { describe, expect, it } from "vitest";
import type { ExtensionLogEntry, StaticView } from "@zcode/shared/extension-host";
import {
  appendExtensionLogs,
  filterExtensionLogs,
} from "@/extension-slots/domain/logSelectors.js";
import {
  buildFileViewerTab,
  resolveLocalizedText,
} from "@/extension-slots/domain/slotSelectors.js";

function log(seq: number, level: ExtensionLogEntry["level"] = "info"): ExtensionLogEntry {
  return { seq, ts: seq, level, gen: 1, message: `line ${seq}` };
}

const view: StaticView = {
  id: "demo/panel",
  pluginId: "demo",
  title: { "zh-CN": "面板", "en-US": "Panel" },
};

describe("extension slots domain", () => {
  it("resolves localized titles by exact locale, language, en-US and first entry", () => {
    expect(resolveLocalizedText(view.title, "zh-CN")).toBe("面板");
    expect(resolveLocalizedText(view.title, "zh-TW")).toBe("面板");
    expect(resolveLocalizedText(view.title, "fr-FR")).toBe("Panel");
    expect(resolveLocalizedText({ "fr-FR": "Panneau" }, "de-DE")).toBe("Panneau");
    expect(resolveLocalizedText(undefined, "en-US")).toBe("");
  });

  it("builds a stable file viewer tab with a workspace-relative path", () => {
    const tab = buildFileViewerTab(view, {
      path: "docs/spec.md",
      workspace: { workspacePath: "/workspace" },
    });

    expect(tab).toMatchObject({
      id: "extension-view:demo/panel:file:docs/spec.md",
      type: "extension-view",
      viewId: "demo/panel",
      title: "spec.md",
      input: {
        kind: "file",
        path: "docs/spec.md",
        workspace: { workspacePath: "/workspace" },
      },
    });
  });

  it("caps the log projection and filters by level/source", () => {
    const entries = appendExtensionLogs([], [log(1), log(2), log(3, "error")], 2);
    expect(entries.map((entry) => entry.seq)).toEqual([2, 3]);
    expect(filterExtensionLogs(entries, "all", "error").map((entry) => entry.seq)).toEqual([3]);
    expect(filterExtensionLogs(entries, "host", "all").map((entry) => entry.seq)).toEqual([2, 3]);
    expect(filterExtensionLogs(entries, "plugin:demo", "all")).toEqual([]);
  });
});
