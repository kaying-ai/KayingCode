import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
  collectTapMakerCandidateDirectories,
  ensureTapMakerLocalProject,
} from "../src/game-features/tapMakerProjectAssociation.js";

test("candidate directories merge workspace tabs with project roots and dedupe", () => {
  assert.deepEqual(
    collectTapMakerCandidateDirectories({
      tabDirectories: ["/games/a", " /games/b "],
      projects: [
        { deleted: false, roots: [{ rootPath: "/games/a" }, { rootPath: "/games/c" }] },
        { deleted: true, roots: [{ rootPath: "/games/deleted" }] },
      ],
    }),
    ["/games/a", "/games/b", "/games/c"],
  );
});

test("candidate directories stay within the protocol limit", () => {
  const tabDirectories = Array.from({ length: 501 }, (_, index) => `/games/${index}`);
  assert.equal(collectTapMakerCandidateDirectories({ tabDirectories, projects: [] }).length, 500);
});

test("restore registration reuses an existing project by root atomically", async () => {
  const saveProject = vi.fn(async () => ({ id: "project-1" }));
  const result = await ensureTapMakerLocalProject(
    { saveProject },
    { projectRoot: "/games/restored" },
  );
  assert.deepEqual(result, { id: "project-1" });
  // reuseExistingRoot 只接受 roots；名称/主目录由项目服务按目录规则生成。
  assert.deepEqual(saveProject.mock.calls[0]?.[0], {
    reuseExistingRoot: true,
    roots: ["/games/restored"],
  });
});
