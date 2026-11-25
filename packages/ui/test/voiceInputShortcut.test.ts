import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SHORTCUT_COMMANDS } from "@zcode/shared";
import { resolveEffectiveShortcutBindings } from "../src/shortcuts/bindings.js";
import { checkShortcutBindingConflict } from "../src/shortcuts/conflicts.js";

describe("toggleVoiceInput shortcut binding", () => {
  it("is on the window channel with the upstream default", () => {
    const entry = SHORTCUT_COMMANDS.find((command) => command.id === "toggleVoiceInput");
    expect(entry).toMatchObject({
      id: "toggleVoiceInput",
      channel: "window",
      defaultBindings: ["CmdOrCtrl+Shift+d"],
    });
    expect(entry?.scope).toBeUndefined();
    expect(resolveEffectiveShortcutBindings(undefined).toggleVoiceInput).toEqual([
      "CmdOrCtrl+Shift+d",
    ]);
  });

  it("is unassigned when the user explicitly clears it", () => {
    expect(resolveEffectiveShortcutBindings({ toggleVoiceInput: [] }).toggleVoiceInput).toEqual([]);
  });

  it("is reported as the owner when another command tries to steal its default keys", () => {
    const conflict = checkShortcutBindingConflict("findInTask", "CmdOrCtrl+Shift+d", undefined, {
      platformInfo: { platform: "Win32", userAgent: "Windows" },
    });
    expect(conflict).toMatchObject({
      kind: "occupied",
      ownerCommandId: "toggleVoiceInput",
      binding: "CmdOrCtrl+Shift+d",
    });
  });
});

describe("voice input shortcut ownership", () => {
  it("is not dispatched by useAppKeyboard (voice-input owns the window listener)", async () => {
    const keyboard = await readFile(new URL("../src/hooks/useAppKeyboard.ts", import.meta.url));
    expect(keyboard.includes("toggleVoiceInput")).toBe(false);
  });

  it("is not passed as an AppKeyboard handler from the app shell", async () => {
    const app = await readFile(new URL("../src/App.tsx", import.meta.url));
    expect(app.includes("toggleVoiceInput")).toBe(false);
  });
});
