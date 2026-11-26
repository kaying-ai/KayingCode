import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preinstalledToolManifestSchema,
  type PreinstalledToolManifest,
} from "@zcode/shared/preinstalled-tools";
import { validatePreinstalledFiles } from "../src/preinstalled-tools/archive.js";
import { loadPreinstalledToolsCatalog } from "../src/preinstalled-tools/catalog.js";
import {
  PreinstalledToolFailure,
  classifyPreinstalledToolFailure,
} from "../src/preinstalled-tools/download.js";
import {
  expandPreinstalledValue,
  preinstalledEntryExecutable,
  preinstalledEntryFiles,
} from "../src/preinstalled-tools/entries.js";
import { PreinstalledToolOwner } from "../src/preinstalled-tools/installation.js";

const SHA = "b".repeat(64);
const temporaryDirectories: string[] = [];

function manifest(): PreinstalledToolManifest {
  return preinstalledToolManifestSchema.parse({
    toolId: "python",
    resourceId: "python-3.12.16-resource",
    version: "3.12.16",
    platforms: [{ platform: process.platform, arch: process.arch }],
    binaryArch: process.arch === "arm64" ? "arm64" : "x64",
    installedSizeBytes: 1024,
    requiredFiles: ["bin/python3"],
    entries: [{ name: "python", target: "bin/python3", args: [], env: [] }],
    runtimeChecks: [
      { entry: "python", args: ["--version"], expectedOutput: "Python 3", timeoutMs: 1000 },
    ],
    archive: {
      format: "tar.gz",
      sizeBytes: 512,
      sha256: SHA,
      path: "python/resource.tar.gz",
    },
    downloadUrls: ["https://tools.example/kayingcode/python/resource.tar.gz"],
  });
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "kayingcode-preinstalled-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("预装工具 catalog 装配", () => {
  it("未配置覆盖基址时保留全部工具但没有下载目标", async () => {
    vi.stubEnv("KAYINGCODE_PREINSTALLED_TOOLS_CDN_BASE_URL", "");
    const tools = await loadPreinstalledToolsCatalog({ error: vi.fn() });
    expect(tools).not.toBeNull();
    expect(tools?.map((tool) => tool.toolId)).toEqual([
      "python",
      "qpdf",
      "pandoc",
      "poppler",
      "libreoffice",
    ]);
    expect(tools?.every((tool) => tool.manifest === null)).toBe(true);
  });

  it("覆盖基址按书写顺序生成下载候选", async () => {
    vi.stubEnv(
      "KAYINGCODE_PREINSTALLED_TOOLS_CDN_BASE_URL",
      "https://a.example/tools, https://b.example/tools",
    );
    const tools = await loadPreinstalledToolsCatalog({ error: vi.fn() });
    const match = tools?.find((tool) => tool.manifest !== null);
    // 当前平台没有 catalog 资源时（例如未发布的平台组合），只验证装配不抛错。
    if (!match) return;
    expect(match.manifest?.downloadUrls[0]?.startsWith("https://a.example/tools/")).toBe(true);
    expect(match.manifest?.downloadUrls).toHaveLength(2);
  });

  it("非法覆盖基址时全部工具没有目标并记录错误", async () => {
    vi.stubEnv("KAYINGCODE_PREINSTALLED_TOOLS_CDN_BASE_URL", "ftp://tools.example");
    const error = vi.fn();
    const tools = await loadPreinstalledToolsCatalog({ error });
    expect(tools?.every((tool) => tool.manifest === null)).toBe(true);
    expect(error).toHaveBeenCalled();
  });
});

describe("预装工具失败分类", () => {
  it("ENOSPC 始终优先为 disk-space", () => {
    const error = new AggregateError([
      new PreinstalledToolFailure("checksum", "bad"),
      Object.assign(new Error("no space"), { code: "ENOSPC" }),
    ]);
    expect(classifyPreinstalledToolFailure(error, "network")).toBe("disk-space");
  });

  it("保留嵌套原因中的已分类失败", () => {
    const error = new PreinstalledToolFailure("checksum", "bad", {
      cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }),
    });
    expect(classifyPreinstalledToolFailure(error, "network")).toBe("checksum");
    expect(classifyPreinstalledToolFailure(new Error("plain"), "extract")).toBe("extract");
  });
});

describe("预装工具入口展开", () => {
  it("展开安装目录与检查目录占位符", () => {
    expect(
      expandPreinstalledValue("${INSTALL_DIR}/bin/${CHECK_TEMP_DIR}/x", "/install", "/check"),
    ).toBe("/install/bin//check/x");
    expect(expandPreinstalledValue("${INSTALL_DIR_URL}", "C:\\tools", undefined)).toContain(
      "file:///",
    );
  });

  it("缺少占位符上下文时拒绝展开", () => {
    expect(() => expandPreinstalledValue("${CHECK_TEMP_DIR}", "/install", undefined)).toThrow();
  });

  it("Windows 入口是 shim 副本，其他平台是脚本", () => {
    if (process.platform === "win32") {
      expect(preinstalledEntryExecutable("python")).toBe("python.exe");
      expect(preinstalledEntryFiles("python")).toEqual(["python.exe", "python.shim"]);
    } else {
      expect(preinstalledEntryExecutable("python")).toBe("python");
      expect(preinstalledEntryFiles("python")).toEqual(["python"]);
    }
  });
});

describe("预装工具 owner 状态投影", () => {
  function createOwner(input: {
    manifest: PreinstalledToolManifest | null;
    agentEnabled: boolean;
  }): PreinstalledToolOwner {
    return new PreinstalledToolOwner({
      paths: {
        rootDir: "/data/preinstalled-tools/production/tools/python",
        binDir: "/data/preinstalled-tools/production/bin",
        recordPath: "/data/preinstalled-tools/production/tools/python/installation.json",
        versionsDir: "/data/preinstalled-tools/production/tools/python/versions",
        stagingDir: "/data/preinstalled-tools/production/tools/python/staging",
      },
      toolId: "python",
      displayName: "Python",
      manifest: input.manifest,
      appStartup: false,
      schedule: async (operation) => operation(),
      createNetwork: (() => {
        throw new Error("not used");
      }) as never,
      agentEnabled: () => input.agentEnabled,
      publish: () => {},
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never,
    });
  }

  it("target 来自 manifest 身份，installed 在发布前为 null", () => {
    const owner = createOwner({ manifest: manifest(), agentEnabled: true });
    expect(owner.snapshot()).toEqual({
      agentEnabled: true,
      entryOutOfSync: false,
      toolId: "python",
      displayName: "Python",
      status: "not-installed",
      target: {
        resourceId: "python-3.12.16-resource",
        version: "3.12.16",
        archiveSizeBytes: 512,
        installedSizeBytes: 1024,
      },
      installed: null,
    });
  });

  it("无当前平台资源时 target 为 null，但仍保留工具与开关", () => {
    const owner = createOwner({ manifest: null, agentEnabled: false });
    expect(owner.snapshot().target).toBeNull();
    expect(owner.snapshot().agentEnabled).toBe(false);
  });
});

describe("预装工具必需文件校验", () => {
  it("接受目录内的必需文件并拒绝缺失文件", async () => {
    const directory = await createTemporaryDirectory();
    await mkdir(join(directory, "bin"), { recursive: true });
    await writeFile(join(directory, "bin", "python3"), "binary");
    await expect(
      validatePreinstalledFiles(directory, { requiredFiles: ["bin/python3"] }),
    ).resolves.toBeUndefined();
    await expect(
      validatePreinstalledFiles(directory, { requiredFiles: ["bin/missing"] }),
    ).rejects.toThrow();
  });
});
