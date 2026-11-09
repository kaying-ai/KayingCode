import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RemoteAccounts,
  resolveRemoteInvitePolicy,
  type RemoteInvitePolicy,
} from "./remoteAccounts.js";
function setup(policy?: RemoteInvitePolicy) {
  const values = new Map<string, unknown>();
  let now = 1000;
  const storage = {
    async get<T>(key: string) {
      return values.get(key) as T | undefined;
    },
    async put(key: string, value: unknown) {
      values.set(key, structuredClone(value));
    },
    async delete(key: string) {
      return values.delete(key);
    },
  };
  const accounts = new RemoteAccounts(storage, () => now, policy);
  return {
    accounts,
    advance: (ms: number) => {
      now += ms;
    },
    values,
  };
}
const secret = "a".repeat(43);
test("owner registration is idempotent; storage contains digests, not credentials", async () => {
  const { accounts, values } = setup();
  const first = await accounts.register(secret);
  assert.deepEqual(await accounts.register(secret), first);
  assert.equal((await accounts.authenticate(secret))?.role, "owner");
  assert.equal(JSON.stringify([...values.values()]).includes(secret), false);
  await assert.rejects(accounts.register("short"));
});
test("invitation is one-time and creates separate terminal authority", async () => {
  const { accounts } = setup();
  const owner = await accounts.register(secret);
  const identity = (await accounts.authenticate(secret))!;
  const invitation = await accounts.invite(identity);
  const terminal = await accounts.claim(invitation.invitation);
  assert.equal(terminal.userId, owner.userId);
  assert.notEqual(terminal.token, secret);
  const authority = (await accounts.authenticate(terminal.token))!;
  assert.equal(authority.role, "terminal");
  await assert.rejects(accounts.claim(invitation.invitation));
  await assert.rejects(accounts.invite(authority));
  await accounts.logout(terminal.token);
  assert.equal(await accounts.authenticate(terminal.token), null);
  assert.equal((await accounts.authenticate(secret))?.role, "owner");
});
test("expiry and unknown credentials fail closed", async () => {
  const { accounts, advance } = setup();
  await accounts.register(secret);
  const owner = (await accounts.authenticate(secret))!;
  const invitation = await accounts.invite(owner);
  advance(300001);
  await assert.rejects(accounts.claim(invitation.invitation));
  const next = await accounts.invite(owner);
  const terminal = await accounts.claim(next.invitation);
  advance(30 * 86400000 + 1);
  assert.equal(await accounts.authenticate(terminal.token), null);
  assert.equal(await accounts.authenticate("invalid"), null);
});
test("controlled deployment can extend invitation and terminal lifetimes", async () => {
  const day = 86400000;
  const { accounts, advance } = setup({
    inviteTtlMs: 30 * day,
    inviteMaxClaims: 1,
    terminalTtlMs: 60 * day,
  });
  await accounts.register(secret);
  const owner = (await accounts.authenticate(secret))!;
  const invitation = await accounts.invite(owner);
  advance(6 * 60 * 1000);
  const terminal = await accounts.claim(invitation.invitation);
  advance(59 * day);
  assert.equal((await accounts.authenticate(terminal.token))?.role, "terminal");
  advance(2 * day);
  assert.equal(await accounts.authenticate(terminal.token), null);
});
test("invitation can be configured for multiple reviewers", async () => {
  const { accounts } = setup({
    inviteTtlMs: 30 * 86400000,
    inviteMaxClaims: 2,
    terminalTtlMs: 30 * 86400000,
  });
  await accounts.register(secret);
  const owner = (await accounts.authenticate(secret))!;
  const invitation = await accounts.invite(owner);
  const first = await accounts.claim(invitation.invitation);
  const second = await accounts.claim(invitation.invitation);
  assert.notEqual(first.token, second.token);
  await assert.rejects(accounts.claim(invitation.invitation));
});
test("legacy invitation records without remainingClaims stay one-time", async () => {
  const { accounts, values } = setup();
  await accounts.register(secret);
  const owner = (await accounts.authenticate(secret))!;
  const invitation = await accounts.invite(owner);
  const key = [...values.keys()].find((candidate) => candidate.startsWith("invitation:"))!;
  const stored = values.get(key) as { userId: string; expiresAt: number };
  values.set(key, { userId: stored.userId, expiresAt: stored.expiresAt });
  await accounts.claim(invitation.invitation);
  await assert.rejects(accounts.claim(invitation.invitation));
});
test("invite policy resolver keeps defaults for invalid or out-of-range values", () => {
  assert.deepEqual(resolveRemoteInvitePolicy({}), {
    inviteTtlMs: 300000,
    inviteMaxClaims: 1,
    terminalTtlMs: 30 * 86400000,
  });
  assert.deepEqual(
    resolveRemoteInvitePolicy({
      KAYINGCODE_REMOTE_INVITE_TTL_DAYS: " 30 ",
      KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS: "10",
      KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS: "90",
    }),
    {
      inviteTtlMs: 30 * 86400000,
      inviteMaxClaims: 10,
      terminalTtlMs: 90 * 86400000,
    },
  );
  assert.deepEqual(
    resolveRemoteInvitePolicy({
      KAYINGCODE_REMOTE_INVITE_TTL_DAYS: "0.5",
      KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS: "1.5",
    }),
    {
      inviteTtlMs: 12 * 3600000,
      inviteMaxClaims: 1,
      terminalTtlMs: 36 * 3600000,
    },
  );
  assert.deepEqual(
    resolveRemoteInvitePolicy({
      KAYINGCODE_REMOTE_INVITE_TTL_DAYS: "0",
      KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS: "1.5",
      KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS: "not-a-number",
    }),
    {
      inviteTtlMs: 300000,
      inviteMaxClaims: 1,
      terminalTtlMs: 30 * 86400000,
    },
  );
});
