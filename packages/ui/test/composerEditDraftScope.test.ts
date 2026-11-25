// 草稿 scope 隔离（docs/ui/composer-edit-mode.md）：只有传入 editScopeId 时才偏离 session 草稿，
// 未传入时与现有 session/draft scope 行为完全一致。
import { describe, expect, it } from "vitest";
import {
  resolveComposerDraftScopeId,
  shouldPersistComposerDraftScope,
} from "../src/v4/composer/useDraftConfigControl.js";

describe("composer draft scope", () => {
  it("未传 editScopeId：session scope 与草稿 scope 行为不变", () => {
    expect(resolveComposerDraftScopeId({ sessionId: "s1" })).toBe("s1");
    expect(resolveComposerDraftScopeId({ sessionId: null })).toBe("__draft__");
    expect(shouldPersistComposerDraftScope({ sessionId: "s1" })).toBe(true);
    expect(shouldPersistComposerDraftScope({ sessionId: null })).toBe(true);
  });

  it("传入 editScopeId：只在 session 内切到 edit scope，且不写 localStorage", () => {
    expect(
      resolveComposerDraftScopeId({ sessionId: "s1", editScopeId: "s1::composer-edit:1" }),
    ).toBe("s1::composer-edit:1");
    expect(
      shouldPersistComposerDraftScope({ sessionId: "s1", editScopeId: "s1::composer-edit:1" }),
    ).toBe(false);
  });

  it("draft 态不会被 editScopeId 改写", () => {
    expect(
      resolveComposerDraftScopeId({ sessionId: null, editScopeId: "x::composer-edit:1" }),
    ).toBe("__draft__");
    expect(shouldPersistComposerDraftScope({ sessionId: null, editScopeId: "x" })).toBe(true);
  });
});
