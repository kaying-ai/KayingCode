// 关掉 zod 的 JIT：**纯副作用模块，不能 import zod，必须在 zod 之前求值**。
//
// 为什么不能事后调 `z.config({ jitless: true })`：`$ZodObject`（zod/v4/core/schemas.ts）在
// **构造时**读一次 `const jit = !core.globalConfig.jitless` 再把它闭包进 `_zod.parse`，
// 所以开关只对「此后新建的 schema」生效。本仓库的 schema 都在各包 import 求值时构造完，
// 事后调用等于没调——这正是 weapp 首次修复「改了却没效果」的原因。
//
// 为什么小程序必须关：JIT 走 `zod/v4/core/doc.ts` 的 codegen（`new Function(...)` 生成校验
// 函数后直接调用）。微信小程序沙箱禁掉动态代码求值，生成物不是可调用值，首次 parse 抛
// `factory is not a function`（压缩后即 `n is not a function`；H5/Node 允许求值所以不炸）。
// 关掉只是改走解释器路径，本仓库的 schema 体量下开销可忽略。
//
// 用法：在应用入口**第一个 import 位置**引入（`import "@zcode/shared/zod-jitless";`）。
// ESM/webpack 按源码顺序求值依赖，因此本模块先于 zod 模块体执行；zod 把配置挂在
// `globalThis.__zod_globalConfig`（CJS/ESM 与多份副本共享），预置该对象即等价于
// zod 注释里说的「inline script 先跑」。
interface ZodGlobalConfig {
  jitless?: boolean;
}

const scope = globalThis as unknown as { __zod_globalConfig?: ZodGlobalConfig };
scope.__zod_globalConfig ??= {};
scope.__zod_globalConfig.jitless = true;
