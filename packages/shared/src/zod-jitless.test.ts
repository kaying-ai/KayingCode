// 预置先于 zod：与 app 入口同样的顺序（先副作用模块、后 zod）。
import "./zod-jitless.js";

import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

interface ZodGlobalConfig {
  jitless?: boolean;
}

const globalConfig = (globalThis as unknown as { __zod_globalConfig?: ZodGlobalConfig })
  .__zod_globalConfig;

/** 模拟小程序沙箱：Function(...) 返回的不是可调用值（不抛错，直接调用即 TypeError）。 */
function withBlockedCodegen(run: () => void): void {
  const scope = globalThis as unknown as { Function: unknown };
  const original = scope.Function;
  try {
    scope.Function = function blocked(): unknown {
      return undefined;
    };
    run();
  } finally {
    scope.Function = original;
  }
}

test("预置 __zod_globalConfig 后，禁掉动态求值的宿主照样能构造并解析 schema", () => {
  assert.equal(globalConfig?.jitless, true);
  withBlockedCodegen(() => {
    // 构造发生在 jitless 落地之后 → 不走 codegen。
    assert.deepEqual(z.object({ name: z.string() }).parse({ name: "x" }), { name: "x" });
  });
});

test("顺序反了（schema 先构造、再关 JIT）就来不及——weapp 首次修复无效的原因", () => {
  const previous = globalConfig?.jitless;
  if (globalConfig) globalConfig.jitless = false;
  const premature = z.object({ name: z.string() }); // 构造时快照了 jit=true
  if (globalConfig) globalConfig.jitless = true;
  withBlockedCodegen(() => {
    assert.throws(() => premature.parse({ name: "x" }), /factory is not a function/);
  });
  if (globalConfig) globalConfig.jitless = previous;
});
