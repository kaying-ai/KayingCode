// 小程序侧的随机字节池（纯实现，不 import 平台 SDK —— 平台随机源由
// taroRandomSource.ts 注入，这样本模块与 runtimeGlobals.ts 都能在 Node 里测）。
//
// 微信的 `wx.getRandomValues`（Taro 映射为 `Taro.getRandomValues`）是**异步回调**
// 形态，无法直接支撑 `crypto.getRandomValues` 的同步签名。所以这里维护一个字节池：
// 启动即预热，取用时同步排空，低于水位时异步续满。池空（首帧、预热还没回来）时
// 退化为 Math.random——与修复前行为一致，不会比现状更差。
//
// 随机性的用途只有两类：ID（uuidv7 的随机段）与设备指纹展示值，都是唯一性诉求，
// 不是任何凭据的密钥材料（凭据走 Relay 的 claim/token 流程）。
// H5 有原生 crypto，`installRuntimeGlobals` 会直接跳过，本模块只在缺随机源的宿主生效。

/** 平台异步随机源：H5 等没有该能力的宿主注入 null。 */
export type RandomSource = (byteLength: number) => Promise<Uint8Array>;

const POOL_BYTES = 1024;
/** 低于这个水位就续池：一次取用最多几十字节，留足余量避免退化成 Math.random。 */
const REFILL_WATERMARK = 256;

let source: RandomSource | null = null;
let pool = new Uint8Array(0);
let fetching = false;

export function configureRandomSource(next: RandomSource | null): void {
  source = next;
}

function refill(): void {
  if (fetching || source === null) return;
  fetching = true;
  void source(POOL_BYTES).then(
    (bytes) => {
      const next = new Uint8Array(pool.length + bytes.length);
      next.set(pool);
      next.set(bytes, pool.length);
      pool = next;
      fetching = false;
    },
    () => {
      // 基础库过低 / 接口不可用：保持 Math.random 兜底，不再重试。
      fetching = false;
    },
  );
}

/** 同步取随机字节：先排空池，不足的部分退化为 Math.random。 */
export function randomBytes(byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  const pooled = Math.min(byteLength, pool.length);
  if (pooled > 0) {
    out.set(pool.subarray(0, pooled));
    pool = pool.slice(pooled);
  }
  for (let index = pooled; index < byteLength; index += 1) {
    out[index] = Math.floor(Math.random() * 256);
  }
  if (pool.length < REFILL_WATERMARK) refill();
  return out;
}

export function randomHex(byteLength: number): string {
  return Array.from(randomBytes(byteLength), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 启动预热：让首个 ID/指纹尽量落在池上而不是 Math.random 分支。 */
export function prewarmRandomSource(): void {
  refill();
}
