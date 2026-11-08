import { test } from "node:test";
import assert from "node:assert/strict";
import { RemoteAccounts } from "./remoteAccounts.js";
function setup() {
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
  const accounts = new RemoteAccounts(storage, () => now);
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
