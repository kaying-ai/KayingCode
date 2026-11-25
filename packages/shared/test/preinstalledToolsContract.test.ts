import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PlatformChannels } from "../src/channels.js";
import {
  KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE_ENV,
  PREINSTALLED_TOOL_ARCHIVE_IDENTITY_FILE,
  preinstalledToolInstallationSchema,
  preinstalledToolsCatalogSchema,
  preinstalledToolsStateSchema,
  resolvePreinstalledToolsCatalog,
  resolvePreinstalledToolsRelease,
} from "../src/preinstalled-tools/contract.js";
import {
  PreinstalledToolRewriteError,
  resolvePreinstalledToolPaths,
  resolvePreinstalledToolsBinDir,
  resolvePreinstalledToolsPaths,
  rewritePreinstalledToolBytes,
} from "../src/preinstalled-tools/node.js";

const SHA = "a".repeat(64);

function entry(name: string, target: string) {
  return { name, target, args: [], env: [] };
}

function resource(overrides: Record<string, unknown> = {}) {
  return {
    toolId: "python",
    resourceId: "python-3.12.16-resource",
    version: "3.12.16",
    platforms: [{ platform: "darwin", arch: "arm64" }],
    binaryArch: "arm64",
    installedSizeBytes: 1024,
    requiredFiles: ["bin/python3"],
    entries: [entry("python", "bin/python3")],
    runtimeChecks: [
      { entry: "python", args: ["--version"], expectedOutput: "Python 3", timeoutMs: 1000 },
    ],
    archive: {
      format: "tar.gz",
      sizeBytes: 512,
      sha256: SHA,
      path: "python/python-3.12.16-resource/resource.tar.gz",
    },
    ...overrides,
  };
}

function catalog(overrides: Record<string, unknown> = {}) {
  return [{ toolId: "python", displayName: "Python", resources: [resource()], ...overrides }];
}

describe("预装工具共享契约", () => {
  it("使用 KayingCode 环境变量、频道与归档身份文件", () => {
    expect(KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE_ENV).toBe(
      "KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE",
    );
    expect(PREINSTALLED_TOOL_ARCHIVE_IDENTITY_FILE).toBe("zcode-tool-resource.json");
    expect(PlatformChannels.ExecutePreinstalledToolsCommand).toBe(
      "kayingcode:preinstalled-tools:command",
    );
    expect(PlatformChannels.GetPreinstalledToolsState).toBe(
      "kayingcode:preinstalled-tools:get-state",
    );
    expect(PlatformChannels.PreinstalledToolsState).toBe("kayingcode:preinstalled-tools:state");
  });

  it("按平台选择资源并把相对路径拼到有序去重的下载基址", () => {
    const { tools, downloadBaseUrlsError } = resolvePreinstalledToolsCatalog(
      catalog(),
      "darwin",
      "arm64",
      ["https://a.example/tools/", "https://a.example/tools"],
    );
    expect(downloadBaseUrlsError).toBeUndefined();
    expect(tools).toHaveLength(1);
    const manifest = tools[0]?.manifest;
    expect(manifest?.resourceId).toBe("python-3.12.16-resource");
    expect(manifest?.downloadUrls).toEqual([
      "https://a.example/tools/python/python-3.12.16-resource/resource.tar.gz",
    ]);
  });

  it("没有匹配资源时保留工具但 target 为 null", () => {
    const { tools } = resolvePreinstalledToolsCatalog(catalog(), "win32", "x64", [
      "https://a.example/tools",
    ]);
    expect(tools).toEqual([{ toolId: "python", displayName: "Python", manifest: null }]);
  });

  it("基址非法时全部工具没有目标并返回基址错误", () => {
    const { tools, downloadBaseUrlsError } = resolvePreinstalledToolsCatalog(
      catalog(),
      "darwin",
      "arm64",
      ["ftp://a.example/tools"],
    );
    expect(tools[0]?.manifest).toBeNull();
    expect(downloadBaseUrlsError).toBeTruthy();
  });

  it("拒绝重复工具、重叠平台资源与跨工具入口重名", () => {
    expect(() =>
      preinstalledToolsCatalogSchema.parse([
        catalog()[0],
        { toolId: "python", displayName: "Python 2", resources: [] },
      ]),
    ).toThrow();

    expect(() =>
      preinstalledToolsCatalogSchema.parse(
        catalog({
          resources: [
            resource(),
            resource({
              resourceId: "python-other",
              platforms: [{ platform: "darwin", arch: "arm64" }],
            }),
          ],
        }),
      ),
    ).toThrow();

    expect(() =>
      preinstalledToolsCatalogSchema.parse([
        ...catalog(),
        {
          toolId: "qpdf",
          displayName: "qpdf",
          resources: [
            resource({
              toolId: "qpdf",
              resourceId: "qpdf-resource",
              archive: {
                format: "tar.gz",
                sizeBytes: 1,
                sha256: SHA,
                path: "qpdf/resource.tar.gz",
              },
            }),
          ],
        },
      ]),
    ).toThrow();
  });

  it("拒绝缺少入口目标、外部运行检查与完整下载地址", () => {
    expect(() =>
      preinstalledToolsCatalogSchema.parse(
        catalog({ resources: [resource({ requiredFiles: ["other"] })] }),
      ),
    ).toThrow();

    expect(() =>
      preinstalledToolsCatalogSchema.parse(
        catalog({
          resources: [
            resource({
              runtimeChecks: [{ entry: "missing", args: [], expectedOutput: "x", timeoutMs: 1000 }],
            }),
          ],
        }),
      ),
    ).toThrow();

    expect(() =>
      preinstalledToolsCatalogSchema.parse(
        catalog({
          resources: [
            resource({
              archive: {
                format: "tar.gz",
                sizeBytes: 1,
                sha256: SHA,
                path: "https://cdn.example.com/resource.tar.gz",
              },
            }),
          ],
        }),
      ),
    ).toThrow();
  });

  it("Windows 资源不能声明目录前缀改写", () => {
    const windowsResource = resource({
      platforms: [{ platform: "win32", arch: "x64" }],
      rewrite: [
        { path: "lib/poppler.dll", placeholder: "/placeholder", mode: "binary-dir-prefix" },
      ],
    });
    expect(() =>
      preinstalledToolsCatalogSchema.parse(catalog({ resources: [windowsResource] })),
    ).toThrow();

    const posixResource = resource({
      rewrite: [
        { path: "lib/libpoppler.dylib", placeholder: "/placeholder", mode: "binary-dir-prefix" },
      ],
    });
    expect(() =>
      preinstalledToolsCatalogSchema.parse(catalog({ resources: [posixResource] })),
    ).not.toThrow();
  });

  it("发布身份跟随运行时环境与安装包身份", () => {
    expect(
      resolvePreinstalledToolsRelease({ runtimeEnv: "development", productFlavor: "production" }),
    ).toBe("development");
    expect(
      resolvePreinstalledToolsRelease({ runtimeEnv: "production", productFlavor: "preview" }),
    ).toBe("preview");
    expect(
      resolvePreinstalledToolsRelease({ runtimeEnv: "test", productFlavor: "production" }),
    ).toBe("production");
  });
});

describe("预装工具发布路径", () => {
  it("安装根固定为 <dataRoot>/preinstalled-tools/<release>/{bin,tools}", () => {
    const dataRoot = join(tmpdir(), ".kayingcode");
    const paths = resolvePreinstalledToolsPaths({ dataRoot, release: "production" });
    expect(paths.rootDir).toBe(join(dataRoot, "preinstalled-tools", "production"));
    expect(paths.binDir).toBe(join(dataRoot, "preinstalled-tools", "production", "bin"));
    expect(paths.toolsDir).toBe(join(dataRoot, "preinstalled-tools", "production", "tools"));
    expect(resolvePreinstalledToolsBinDir({ dataRoot, release: "preview" })).toBe(
      join(dataRoot, "preinstalled-tools", "preview", "bin"),
    );
  });

  it("每工具只写自己的发布点、版本和 staging 目录", () => {
    const dataRoot = join(tmpdir(), ".kayingcode");
    const paths = resolvePreinstalledToolPaths({
      dataRoot,
      release: "production",
      toolId: "python",
    });
    expect(paths.rootDir).toBe(
      join(dataRoot, "preinstalled-tools", "production", "tools", "python"),
    );
    expect(paths.recordPath).toBe(
      join(dataRoot, "preinstalled-tools", "production", "tools", "python", "installation.json"),
    );
    expect(paths.versionsDir.endsWith("versions")).toBe(true);
    expect(paths.stagingDir.endsWith("staging")).toBe(true);
    expect(paths.binDir).toBe(join(dataRoot, "preinstalled-tools", "production", "bin"));
  });

  it("拒绝相对数据根与非法发布身份", () => {
    expect(() =>
      resolvePreinstalledToolsPaths({ dataRoot: "relative/.kayingcode", release: "production" }),
    ).toThrow();
    expect(() =>
      resolvePreinstalledToolsPaths({
        dataRoot: join(tmpdir(), ".kayingcode"),
        release: "beta" as never,
      }),
    ).toThrow();
  });
});

describe("预装工具纯字节改写", () => {
  it("text 模式替换全部占位符，允许安装路径更长", () => {
    const input = Buffer.from("home=/__install__\nagain=/__install__\n", "utf8");
    const output = rewritePreinstalledToolBytes(
      input,
      { path: "pyvenv.cfg", placeholder: "/__install__", mode: "text" },
      "/a/very/long/installation/directory",
    );
    expect(output.toString("utf8")).toBe(
      "home=/a/very/long/installation/directory\nagain=/a/very/long/installation/directory\n",
    );
  });

  it("binary 模式在 NUL 结尾补零，保持总字节数与路径后缀", () => {
    const placeholder = "/__install__";
    const suffix = "/share/fonts";
    const input = Buffer.concat([
      Buffer.from("prefix\0", "utf8"),
      Buffer.from(placeholder + suffix + "\0", "utf8"),
      Buffer.from("tail", "utf8"),
    ]);
    const output = rewritePreinstalledToolBytes(
      input,
      { path: "bin/qpdf", placeholder, mode: "binary" },
      "/opt/tools",
    );
    expect(output.length).toBe(input.length);
    expect(output.includes(Buffer.from(`/opt/tools${suffix}\0`, "utf8"))).toBe(true);
  });

  it("binary 模式拒绝超过占位槽的安装路径", () => {
    expect(() =>
      rewritePreinstalledToolBytes(
        Buffer.from("/__x__\0", "utf8"),
        { path: "bin/qpdf", placeholder: "/__x__", mode: "binary" },
        "/a/longer/path",
      ),
    ).toThrow(PreinstalledToolRewriteError);
  });

  it("binary-dir-prefix 用 / 填满目录槽并保持后缀偏移", () => {
    const placeholder = "/Users/placeholder_env";
    const input = Buffer.from(`${placeholder}/lib/libpoppler.dylib\0`, "utf8");
    const output = rewritePreinstalledToolBytes(
      input,
      { path: "lib/libpoppler.dylib", placeholder, mode: "binary-dir-prefix" },
      "/install/dir",
    );
    expect(output.length).toBe(input.length);
    expect(output.subarray(0, placeholder.length).toString("utf8")).toBe(
      `/install/dir${"/".repeat(placeholder.length - "/install/dir".length)}`,
    );
    expect(output.subarray(placeholder.length).toString("utf8")).toBe("/lib/libpoppler.dylib\0");
  });

  it("binary-dir-prefix 拒绝非目录边界的占位符出现", () => {
    const placeholder = "/Users/placeholder_env";
    expect(() =>
      rewritePreinstalledToolBytes(
        Buffer.from(`${placeholder}extra/lib.dylib\0`, "utf8"),
        { path: "lib/libpoppler.dylib", placeholder, mode: "binary-dir-prefix" },
        "/install",
      ),
    ).toThrow(PreinstalledToolRewriteError);
  });
});

describe("预装工具安装记录与状态", () => {
  it("安装记录接受绝对安装目录并拒绝相对目录", () => {
    const record = {
      schemaVersion: 1,
      toolId: "python",
      resourceId: "python-3.12.16-resource",
      version: "3.12.16",
      platform: "darwin",
      arch: "arm64",
      installationDir: "/home/u/.kayingcode/preinstalled-tools/production/tools/python/versions/r",
      installedSizeBytes: 1024,
      requiredFiles: ["bin/python3"],
      entries: [entry("python", "bin/python3")],
      installedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(preinstalledToolInstallationSchema.parse(record).installationDir).toBe(
      record.installationDir,
    );
    expect(() =>
      preinstalledToolInstallationSchema.parse({ ...record, installationDir: "relative/dir" }),
    ).toThrow();
  });

  it("状态投影要求 target/installed 的版本与体积字段", () => {
    const state = {
      autoInstallEnabled: true,
      tools: [
        {
          agentEnabled: true,
          entryOutOfSync: false,
          toolId: "python",
          displayName: "Python",
          status: "ready",
          target: null,
          installed: { resourceId: "r1", version: "3.12.16", installedSizeBytes: 1024 },
        },
      ],
    };
    expect(preinstalledToolsStateSchema.parse(state).tools[0]?.installed?.version).toBe("3.12.16");
    expect(() =>
      preinstalledToolsStateSchema.parse({
        ...state,
        tools: [{ ...state.tools[0], status: "unknown" }],
      }),
    ).toThrow();
  });
});
