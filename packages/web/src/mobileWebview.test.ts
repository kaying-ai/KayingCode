import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyMobileProject, readMobileShellProjectKey } from "./mobileWebview.js";
afterEach(() => vi.unstubAllGlobals());
describe("mobile project bridge", () => {
  it("only scopes explicit mobile project entries and preserves their identity", () => {
    const key = "remote-agent:relay:host:project:%2Fgame";
    expect(
      readMobileShellProjectKey(`?kayingShell=1&kayingWorkspace=${encodeURIComponent(key)}`),
    ).toBe(key);
    expect(readMobileShellProjectKey("?kayingWorkspace=/game")).toBeUndefined();
    expect(readMobileShellProjectKey("?kayingShell=1&kayingWorkspace=%20")).toBeUndefined();
  });
  it("does nothing outside an explicit shell", () => {
    vi.stubGlobal("location", { search: "" });
    notifyMobileProject({ workspacePath: "/game" });
  });
  it("only sends project metadata to the specified shell origin", () => {
    const native = vi.fn();
    const parent = vi.fn();
    vi.stubGlobal("location", {
      search: "?kayingShell=1&kayingParentOrigin=https%3A%2F%2Fshell.test",
    });
    vi.stubGlobal("window", {
      KayingProjects: { postMessage: native },
      parent: { postMessage: parent },
    });
    notifyMobileProject({
      workspacePath: "/game",
      workspaceIdentity: "remote-a",
      token: "secret",
    } as { workspacePath: string });
    const value = {
      type: "kayingcode.project-opened.v1",
      workspacePath: "/game",
      workspaceIdentity: "remote-a",
    };
    expect(native).toHaveBeenCalledWith(JSON.stringify(value));
    expect(parent).toHaveBeenCalledWith(value, "https://shell.test");
  });
});
