import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  normalizeArchiveFileModes,
  resolveArchiveMode,
} from "../src/packaging/archiveModes.js";

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const text = Math.trunc(value)
    .toString(8)
    .padStart(length - 1, "0");
  buffer.write(text.slice(-(length - 1)), offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function buildHeader(
  name: string,
  options: { mode: number; size: number; typeFlag: "0" | "5" },
): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, options.mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, options.size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write(options.typeFlag, 156, 1, "ascii");
  header.write("ustar", 257, 5, "ascii");
  header[262] = 0;
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = checksum.toString(8).padStart(6, "0");
  header.write(checksumText.slice(-6), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function buildTarGzip(): Buffer {
  const fileData = Buffer.from("#!/bin/sh\necho ok\n", "utf8");
  const padded = Buffer.alloc(Math.ceil(fileData.length / 512) * 512, 0);
  fileData.copy(padded);
  const tar = Buffer.concat([
    buildHeader("release/bin/kayingcode", {
      mode: 0o666,
      size: fileData.length,
      typeFlag: "0",
    }),
    padded,
    buildHeader("release/runtime/node", {
      mode: 0o666,
      size: fileData.length,
      typeFlag: "0",
    }),
    padded,
    buildHeader("release/runtime/kayingcode.cjs", {
      mode: 0o666,
      size: fileData.length,
      typeFlag: "0",
    }),
    padded,
    buildHeader("release/runtime/tools/ripgrep/", {
      mode: 0o777,
      size: 0,
      typeFlag: "5",
    }),
    buildHeader("release/runtime/tools/ripgrep/rg", {
      mode: 0o666,
      size: fileData.length,
      typeFlag: "0",
    }),
    padded,
    buildHeader("release/runtime/tools/ripgrep/SOURCES.json", {
      mode: 0o666,
      size: fileData.length,
      typeFlag: "0",
    }),
    padded,
    Buffer.alloc(1024, 0),
  ]);
  return gzipSync(tar);
}

function readOctalField(header: Buffer, offset: number, length: number): number {
  const raw = header.toString("ascii", offset, offset + length);
  const end = raw.indexOf("\u0000");
  return Number.parseInt((end === -1 ? raw : raw.slice(0, end)).trim() || "0", 8);
}

function readEntryModes(tar: Buffer): Record<string, number> {
  const modes: Record<string, number> = {};
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.toString("utf8", 0, header.indexOf(0, 0));
    const mode = readOctalField(header, 100, 8);
    const size = readOctalField(header, 124, 12);
    const typeFlag = header[156] === 0 ? "0" : String.fromCharCode(header[156]);
    modes[`${typeFlag}:${name}`] = mode;
    // checksum 必须仍然有效，否则远端 tar 会直接拒绝整个归档。
    let checksum = 0;
    for (let index = 0; index < 512; index += 1) {
      checksum += index >= 148 && index < 156 ? 0x20 : header[index];
    }
    expect(Number.parseInt(header.toString("ascii", 148, 154).trim(), 8)).toBe(checksum);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return modes;
}

describe("resolveArchiveMode", () => {
  it("只给启动脚本、随包 Node 与原生工具开可执行位", () => {
    expect(resolveArchiveMode("release/bin/kayingcode", false)).toBe(0o755);
    expect(resolveArchiveMode("release/runtime/node", false)).toBe(0o755);
    expect(resolveArchiveMode("release/runtime/tools/ripgrep/rg", false)).toBe(0o755);
    expect(resolveArchiveMode("./runtime/node_modules/node-pty/prebuilds/linux-x64/spawn-helper", false)).toBe(0o755);
    expect(resolveArchiveMode("release/runtime/kayingcode.cjs", false)).toBe(0o644);
    expect(resolveArchiveMode("release/runtime/tools/ripgrep/SOURCES.json", false)).toBe(0o644);
    expect(resolveArchiveMode("release/bin/", true)).toBe(0o755);
  });
});

describe("normalizeArchiveFileModes", () => {
  it("Windows 宿主把 0666/0777 归一为发布所需权限并重算 checksum", async () => {
    const root = await mkdtemp(join(tmpdir(), "kayingcode-archive-modes-"));
    try {
      const archivePath = join(root, "kayingcode-server-linux-x64.tar.gz");
      await writeFile(archivePath, buildTarGzip());
      const applied = await normalizeArchiveFileModes(archivePath, "win32");
      expect(applied).toBe(true);
      const modes = readEntryModes(gunzipSync(await readFile(archivePath)));
      expect(modes["0:release/bin/kayingcode"]).toBe(0o755);
      expect(modes["0:release/runtime/node"]).toBe(0o755);
      expect(modes["0:release/runtime/tools/ripgrep/rg"]).toBe(0o755);
      expect(modes["0:release/runtime/kayingcode.cjs"]).toBe(0o644);
      expect(modes["0:release/runtime/tools/ripgrep/SOURCES.json"]).toBe(0o644);
      expect(modes["5:release/runtime/tools/ripgrep/"]).toBe(0o755);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("非 Windows 宿主不改写归档（保持 POSIX 真实 mode）", async () => {
    const root = await mkdtemp(join(tmpdir(), "kayingcode-archive-modes-noop-"));
    try {
      const archivePath = join(root, "archive.tar.gz");
      const original = buildTarGzip();
      await writeFile(archivePath, original);
      const applied = await normalizeArchiveFileModes(archivePath, "darwin");
      expect(applied).toBe(false);
      expect(await readFile(archivePath)).toEqual(original);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
