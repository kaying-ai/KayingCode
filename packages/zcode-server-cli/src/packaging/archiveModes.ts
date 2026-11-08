import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip, constants as zlibConstants } from "node:zlib";

const TAR_BLOCK_SIZE = 512;

/**
 * POSIX 权限只存在于 tar header 中。Windows 文件系统没有可执行位，bsdtar 会把所有文件
 * 记成 0666、目录记成 0777，导致在 Windows 上打出的 Linux 归档解包后 `bin/kayingcode`
 * 与 `runtime/node` 没有可执行位，远端安装第一步就 `Permission denied`。
 *
 * 因此按发布目录的固定布局显式声明可执行条目，其余文件保持 0644：
 * - `bin/*`：发行启动脚本
 * - `runtime/node`：随包 Node
 * - `runtime/tools/<tool>/<binary>`：原生搜索工具（无扩展名的那个文件）
 * - `prebuilds/**\/spawn-helper` 与 `*.sh`：原生 helper 与脚本
 */
export function resolveArchiveMode(entryPath: string, isDirectory: boolean): number {
  if (isDirectory) return 0o755;
  const normalizedPath = entryPath.replace(/\\/gu, "/");
  const baseName = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
  if (/^(?:.*\/)?bin\/[^/]+$/u.test(normalizedPath)) return 0o755;
  if (/^(?:.*\/)?runtime\/node$/u.test(normalizedPath)) return 0o755;
  // 原生搜索工具目录里同一层还有 SOURCES.json / THIRD-PARTY-NOTICES.txt，只有无扩展名的
  // 条目是二进制；按 basename 判断，避免把说明文件也标成可执行。
  if (/^(?:.*\/)?runtime\/tools\/[^/]+\/[^/.]+$/u.test(normalizedPath)) return 0o755;
  if (baseName === "spawn-helper" || baseName.endsWith(".sh")) return 0o755;
  return 0o644;
}

function readTarString(header: Buffer, offset: number, length: number): string {
  const end = header.indexOf(0, offset);
  const limit = end === -1 || end > offset + length ? offset + length : end;
  return header.toString("utf8", offset, limit);
}

function readTarOctal(header: Buffer, offset: number, length: number): number {
  const raw = header.toString("ascii", offset, offset + length);
  // 八进制字段是 NUL 结尾的定长文本；用 indexOf 截断，避免正则匹配控制字符。
  const end = raw.indexOf("\u0000");
  const text = (end === -1 ? raw : raw.slice(0, end)).trim();
  if (!text) return 0;
  const value = Number.parseInt(text, 8);
  return Number.isFinite(value) ? value : 0;
}

function writeTarOctal(header: Buffer, offset: number, length: number, value: number): void {
  const text = Math.trunc(value)
    .toString(8)
    .padStart(length - 1, "0");
  header.write(text.slice(-(length - 1)), offset, length - 1, "ascii");
  header[offset + length - 1] = 0;
}

function applyModeToHeader(header: Buffer): void {
  const typeFlagByte = header[156] ?? 0;
  const typeFlag = typeFlagByte === 0 ? "0" : String.fromCharCode(typeFlagByte);
  // PAX/GNU 扩展头（x/g/L/K）与稀疏文件不是真实条目，改权限会破坏读取端解析。
  if (typeFlag !== "0" && typeFlag !== "5") return;
  const name = readTarString(header, 0, 100);
  const prefix = readTarString(header, 345, 155);
  const entryPath = prefix ? `${prefix}/${name}` : name;
  writeTarOctal(header, 100, 8, resolveArchiveMode(entryPath, typeFlag === "5"));
  // checksum 计算必须先把 checksum 字段当空格，再按最终字节求和。
  header.fill(0x20, 148, 156);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = checksum.toString(8).padStart(6, "0");
  header.write(checksumText.slice(-6), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
}

/**
 * 流式改写 tar.gz 里真实文件/目录条目的 mode。归档可能达到数百 MiB，不能整包读入内存；
 * 这里只缓冲 512 字节 header，条目数据原样透传。
 */
class TarModeNormalizer extends Transform {
  private headerBuffer: Buffer = Buffer.alloc(0);
  private remainingDataBytes = 0;
  private finished = false;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    let offset = 0;
    const output: Buffer[] = [];
    while (offset < chunk.length) {
      if (this.finished) {
        output.push(chunk.subarray(offset));
        break;
      }
      if (this.remainingDataBytes > 0) {
        const take = Math.min(this.remainingDataBytes, chunk.length - offset);
        output.push(chunk.subarray(offset, offset + take));
        this.remainingDataBytes -= take;
        offset += take;
        continue;
      }
      const needed = TAR_BLOCK_SIZE - this.headerBuffer.length;
      const take = Math.min(needed, chunk.length - offset);
      this.headerBuffer = Buffer.concat([
        this.headerBuffer,
        chunk.subarray(offset, offset + take),
      ]);
      offset += take;
      if (this.headerBuffer.length < TAR_BLOCK_SIZE) break;
      const header = Buffer.from(this.headerBuffer);
      this.headerBuffer = Buffer.alloc(0);
      if (header.every((byte) => byte === 0)) {
        // 归档结束标记；其后可能还有填充块或第二个 0 块，全部原样透传。
        this.finished = true;
        output.push(header);
        continue;
      }
      applyModeToHeader(header);
      output.push(header);
      const size = readTarOctal(header, 124, 12);
      this.remainingDataBytes = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    }
    callback(null, output.length === 1 ? output[0] : Buffer.concat(output));
  }

  override _flush(callback: (error?: Error | null, data?: Buffer) => void): void {
    callback(null, this.headerBuffer.length > 0 ? this.headerBuffer : undefined);
  }
}

export function createTarModeNormalizer(): Transform {
  return new TarModeNormalizer();
}

/**
 * 原地修正归档权限。只在 Windows 宿主执行：POSIX 宿主的 tar 已记录真实 mode，
 * 再次改写会把刻意设置的 0600 等权限降级成发布默认值。
 */
export async function normalizeArchiveFileModes(
  archivePath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  if (platform !== "win32") return false;
  const temporaryPath = `${archivePath}.modes-${process.pid}`;
  try {
    await pipeline(
      createReadStream(archivePath),
      createGunzip(),
      createTarModeNormalizer(),
      createGzip({ level: zlibConstants.Z_BEST_COMPRESSION }),
      createWriteStream(temporaryPath),
    );
    await rename(temporaryPath, archivePath);
    return true;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
