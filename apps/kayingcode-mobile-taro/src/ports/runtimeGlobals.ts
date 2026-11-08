// 小程序运行时缺失的 Web 全局补齐。
//
// 小程序没有 `TextEncoder` / `TextDecoder` / `btoa` / `atob`，也没有
// `crypto.getRandomValues`，Taro 运行时同样不提供（产物里 grep 不到任何 polyfill）。
// 而这些全局在协议与 RPC 层是被直接构造的：
//   - `packages/shared/src/kayingcode-protocol-v4/wire-codec.ts` 每帧都
//     `new TextEncoder().encode(JSON.stringify(frame))`（帧长核算与帧体编码）；
//   - wire-reassembly / wire-assembler 用 `new TextDecoder("utf-8", { fatal: true })`
//     判定 proto.frameAssemblyInvalidUtf8——注意它在 try/catch 里，缺 polyfill 时
//     会把 ReferenceError 吞成「UTF-8 非法」，坏帧判定被静默污染；
//   - `packages/rpc/src/serialization.ts` 的 base64 分支走 `globalThis.btoa/atob`；
//   - `packages/rpc/src/buffer.ts` 的 `VSBuffer.fromString/toString`；
//   - `packages/shared/src/uuid.ts` 的 `globalThis.crypto.getRandomValues`。
//
// 装在这里而不是 core：core / shared 的 wire 层必须保持平台无关（同 MOB-P-002
// 的 ports 纪律），等价能力由平台应用在启动最早处提供。
//
// 全部按**能力探测**安装：H5 与开发者工具里原生存在就原样用原生的，
// 不覆盖、不 hook；只有在宿主确实缺失时才补。
import {
  configureRandomSource,
  prewarmRandomSource,
  randomBytes,
  type RandomSource,
} from "./randomSource";
import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8 } from "./textCodec";

/** `getRandomValues` 接受的整数类型化数组的公共面。 */
interface RandomTarget {
  length: number;
  set(source: ArrayLike<number>): void;
}

function fillTarget<T extends RandomTarget>(target: T): T {
  target.set(randomBytes(target.length));
  return target;
}

class TextEncoderShim {
  readonly encoding = "utf-8";

  encode(input = ""): Uint8Array {
    return encodeUtf8(input);
  }
}

class TextDecoderShim {
  readonly encoding = "utf-8";
  readonly fatal: boolean;

  constructor(label = "utf-8", options: { fatal?: boolean } = {}) {
    if (label !== "utf-8" && label !== "utf8" && label !== "unicode-1-1-utf-8") {
      throw new RangeError(`TextDecoder: unsupported encoding ${label}`);
    }
    this.fatal = options.fatal === true;
  }

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (input === undefined || input === null) return "";
    if (ArrayBuffer.isView(input)) {
      const view = input as { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };
      return decodeUtf8(
        new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength),
        this.fatal,
      );
    }
    return decodeUtf8(new Uint8Array(input as ArrayBuffer), this.fatal);
  }
}

function installRandom(source: RandomSource | null): void {
  const scope = globalThis as unknown as { crypto?: { getRandomValues?: unknown } };
  if (typeof scope.crypto?.getRandomValues === "function") return;
  // 先接管端口再装全局：shim 内部只会读字节池，不会回读 globalThis.crypto，
  // 因此不存在自引用递归。
  configureRandomSource(source);
  prewarmRandomSource();
  scope.crypto = { getRandomValues: fillTarget };
}

function installTextCodec(): void {
  const scope = globalThis as unknown as { TextEncoder?: unknown; TextDecoder?: unknown };
  if (typeof scope.TextEncoder !== "function") scope.TextEncoder = TextEncoderShim;
  if (typeof scope.TextDecoder !== "function") scope.TextDecoder = TextDecoderShim;
}

function installBase64(): void {
  const scope = globalThis as unknown as { btoa?: unknown; atob?: unknown };
  if (typeof scope.btoa !== "function") {
    scope.btoa = (binary: string): string => {
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        const code = binary.charCodeAt(index);
        // 与原生一致：只接受 Latin-1 字符，超出即非法。
        if (code > 0xff) throw new Error("btoa: the string to be encoded contains characters outside of the Latin1 range");
        bytes[index] = code;
      }
      return bytesToBase64(bytes);
    };
  }
  if (typeof scope.atob !== "function") {
    scope.atob = (base64: string): string => {
      const bytes = base64ToBytes(base64);
      let binary = "";
      for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]!);
      }
      return binary;
    };
  }
}

/**
 * 必须在任何页面 / 协议代码执行前调用一次（app 入口最顶部）。幂等。
 * `randomSource` 是平台异步随机源（小程序传 taroRandomSource()，没有就传 null）；
 * 宿主已有原生 `crypto.getRandomValues` 时会被忽略。
 */
export function installRuntimeGlobals(randomSource: RandomSource | null): void {
  installRandom(randomSource);
  installTextCodec();
  installBase64();
}
