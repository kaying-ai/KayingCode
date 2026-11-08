import assert from "node:assert/strict";
import test from "node:test";
import { resolveMcpWorkspaceKey, resolveMcpWorkspacePath } from "../src/mcp/workspace-scope.js";

test("MCP workspace scope stays anchored when Bash changes the working directory", () => {
  assert.equal(
    resolveMcpWorkspacePath({
      workingDirectory: "D:/workspace/convert_game/dest/scripts",
      workspaceRoot: "D:/workspace",
    }),
    "D:/workspace",
  );
});

test("MCP workspaceKey falls back to workspaceRoot, not the mutable workingDirectory", () => {
  // 修复依据：Agent cd 进子目录后，workingDirectory 会变成 convert_game 路径；
  // 若把它当作 workspaceKey 写入 comparison receipt，UI 校验会判为「属于其他任务」。
  assert.equal(
    resolveMcpWorkspaceKey({
      workspaceIdentity: undefined,
      workspaceRoot: "/Users/me/ws/20260928",
    }),
    "/Users/me/ws/20260928",
  );
});

test("MCP workspaceKey prefers trimmed workspaceIdentity over workspaceRoot", () => {
  assert.equal(
    resolveMcpWorkspaceKey({
      workspaceIdentity: "  remote:example:/workspace  ",
      workspaceRoot: "/Users/me/ws",
    }),
    "remote:example:/workspace",
  );
});

test("MCP workspaceKey ignores blank workspaceIdentity", () => {
  assert.equal(
    resolveMcpWorkspaceKey({
      workspaceIdentity: "   ",
      workspaceRoot: "/Users/me/ws",
    }),
    "/Users/me/ws",
  );
});
