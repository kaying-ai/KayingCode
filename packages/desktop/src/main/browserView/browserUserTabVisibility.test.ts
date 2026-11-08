import assert from "node:assert/strict";
import { test } from "vitest";
import {
  evaluateUserTabClaim,
  isDiscoverableUserPage,
  isProductShellTab,
  isSameClaimScope,
  resolveUserTabDisplayUrl,
  type UserTabIdentity,
} from "./browserUserTabVisibility.js";

const owner = {
  windowId: 1,
  workspaceKey: "/ws",
  sessionId: "sess_1",
};

function tab(overrides: Partial<UserTabIdentity> = {}): UserTabIdentity {
  return {
    tabId: "plugin-compare:p:c:sess_1:target:uuid",
    tabGroup: "plugin-compare:p:c:sess_1",
    lifecycle: "active",
    origin: "user",
    claimable: true,
    owner,
    ...overrides,
  };
}

test("product shell tabs are discoverable even while live URL is still blank", () => {
  const target = tab({ liveUrl: "about:blank", cachedUrl: "" });
  assert.equal(isProductShellTab(target), true);
  assert.equal(isDiscoverableUserPage(target), true);
});

test("human tabs still require a real page URL", () => {
  const human = tab({
    tabId: "browser:human",
    tabGroup: undefined,
    liveUrl: "about:blank",
    cachedUrl: "",
  });
  assert.equal(isProductShellTab(human), false);
  assert.equal(isDiscoverableUserPage(human), false);
});

test("cached non-blank URL keeps a reloaded tab discoverable", () => {
  const reloaded = tab({
    tabId: "browser:human",
    tabGroup: undefined,
    liveUrl: "about:blank",
    cachedUrl: "https://example.com/game",
  });
  assert.equal(isDiscoverableUserPage(reloaded), true);
  assert.equal(resolveUserTabDisplayUrl(reloaded), "https://example.com/game");
});

test("claim is idempotent for the same scope owner", () => {
  const claimed = tab({ claimable: false, origin: "user" });
  const decision = evaluateUserTabClaim(claimed, owner, { alreadyOwnedByCaller: true });
  assert.equal(decision.ok, true);
  assert.equal(decision.alreadyOwnedByCaller, true);
});

test("claim rejects tabs owned by another session", () => {
  const foreign = tab({ owner: { ...owner, sessionId: "sess_other" } });
  const decision = evaluateUserTabClaim(foreign, owner);
  assert.equal(decision.ok, false);
  assert.equal(decision.code, "tab_scope_mismatch");
});

test("claim rejects already-claimed agent tabs", () => {
  const agentOwned = tab({ origin: "agent", claimable: false });
  const decision = evaluateUserTabClaim(agentOwned, owner);
  assert.equal(decision.ok, false);
  assert.equal(decision.code, "tab_claimed_elsewhere");
});

test("claim rejects closed tombstones", () => {
  const closed = tab({ lifecycle: "closed" });
  const decision = evaluateUserTabClaim(closed, owner);
  assert.equal(decision.ok, false);
  assert.equal(decision.code, "tab_closed");
});

test("claim rejects blank human tabs with a distinct code", () => {
  const blank = tab({
    tabId: "browser:human",
    tabGroup: undefined,
    liveUrl: "about:blank",
    cachedUrl: "",
  });
  const decision = evaluateUserTabClaim(blank, owner);
  assert.equal(decision.ok, false);
  assert.equal(decision.code, "tab_not_ready");
});

test("same claim scope ignores undefined remote session", () => {
  assert.equal(isSameClaimScope(owner, { ...owner, remoteSessionId: undefined }), true);
  assert.equal(
    isSameClaimScope({ ...owner, remoteSessionId: "r1" }, { ...owner, remoteSessionId: "r1" }),
    true,
  );
  assert.equal(
    isSameClaimScope({ ...owner, remoteSessionId: "r1" }, { ...owner, remoteSessionId: "r2" }),
    false,
  );
});
