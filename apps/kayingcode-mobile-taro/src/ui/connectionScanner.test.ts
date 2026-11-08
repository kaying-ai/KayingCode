import assert from "node:assert/strict";
import test from "node:test";
import { createConnectionScanner } from "./connectionScanner";

function setup() {
  let calls = 0;
  let pending = Promise.withResolvers<{ result: string }>();
  const values: string[] = [];
  const errors: string[] = [];
  const scanner = createConnectionScanner({
    scan: () => {
      calls += 1;
      return pending.promise;
    },
    onResult: (value) => values.push(value),
    onError: (message) => errors.push(message),
  });
  return {
    scanner,
    values,
    errors,
    calls: () => calls,
    resolve: (value: string) => pending.resolve({ result: value }),
    reject: (error: unknown) => pending.reject(error),
    next: () => {
      pending = Promise.withResolvers<{ result: string }>();
    },
  };
}

test("同一入口只启动一次扫码，结果交付一次，完成后可重试", async () => {
  const s = setup();
  const first = s.scanner.scan();
  await s.scanner.scan();
  assert.equal(s.calls(), 1);
  s.resolve("https://relay.example.com#pairing#secret");
  await first;
  assert.deepEqual(s.values, ["https://relay.example.com#pairing#secret"]);
  s.next();
  const retry = s.scanner.scan();
  s.resolve("https://example.com/remote/v4?sid=id&hash=hash&t=1");
  await retry;
  assert.equal(s.calls(), 2);
  assert.equal(s.values.length, 2);
});

test("主动取消扫码不报错、不交付结果，并允许重试", async () => {
  const s = setup();
  const first = s.scanner.scan();
  s.reject({ errMsg: "scanCode:fail cancel" });
  await first;
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.values, []);
  s.next();
  const retry = s.scanner.scan();
  s.resolve("connection");
  await retry;
  assert.deepEqual(s.values, ["connection"]);
});

test("失败和空扫描结果提示可粘贴，不把权限错误当作主动取消", async () => {
  for (const error of [{ errMsg: "scanCode:fail auth deny" }, new Error("not supported")]) {
    const s = setup();
    const attempt = s.scanner.scan();
    s.reject(error);
    await attempt;
    assert.deepEqual(s.errors, ["扫码失败，请重试或粘贴连接信息"]);
    assert.deepEqual(s.values, []);
  }
  const s = setup();
  const attempt = s.scanner.scan();
  s.resolve("  ");
  await attempt;
  assert.equal(s.errors.length, 1);
  assert.deepEqual(s.values, []);
});

test("界面关闭后成功与失败均丢弃，旧控制器不能再次扫码", async () => {
  for (const outcome of ["success", "error"]) {
    const s = setup();
    const attempt = s.scanner.scan();
    s.scanner.dispose();
    if (outcome === "success") s.resolve("late connection");
    else s.reject(new Error("late error"));
    await attempt;
    await s.scanner.scan();
    assert.equal(s.calls(), 1);
    assert.deepEqual(s.values, []);
    assert.deepEqual(s.errors, []);
  }
});
