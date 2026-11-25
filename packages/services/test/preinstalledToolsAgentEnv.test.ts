import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE_ENV } from "@zcode/shared/preinstalled-tools";
import { resolvePreinstalledToolsAgentEnv } from "../src/runtime-tools/preinstalledToolsAgentEnv.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kayingcode-preinstalled-tools-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("preinstalled tools agent env", () => {
  it("prepends the bin dir and marks availability when the dir has an entry", () => {
    const binDir = join(makeTempDir(), "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "zcode-python"), "#!/bin/sh\n");

    const env = resolvePreinstalledToolsAgentEnv({
      binDir,
      basePath: ["/usr/local/bin", "/usr/bin", "/bin"].join(delimiter),
    });

    expect(env).toEqual({
      [KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE_ENV]: "1",
      PATH: [binDir, "/usr/local/bin", "/usr/bin", "/bin"].join(delimiter),
    });
  });

  it("does not change PATH when the bin dir does not exist", () => {
    const missingBinDir = join(makeTempDir(), "preinstalled-tools", "production", "bin");

    expect(
      resolvePreinstalledToolsAgentEnv({
        binDir: missingBinDir,
        basePath: "/usr/local/bin:/usr/bin",
      }),
    ).toEqual({});
  });

  it("does not change PATH when the bin dir is empty", () => {
    const binDir = join(makeTempDir(), "bin");
    mkdirSync(binDir, { recursive: true });

    expect(
      resolvePreinstalledToolsAgentEnv({
        binDir,
        basePath: "/usr/local/bin:/usr/bin",
      }),
    ).toEqual({});
  });

  it("ignores hidden entries such as the Windows .retired directory", () => {
    const binDir = join(makeTempDir(), "bin");
    mkdirSync(join(binDir, ".retired"), { recursive: true });
    writeFileSync(join(binDir, ".retired", "zcode-python-1.exe"), "");

    expect(resolvePreinstalledToolsAgentEnv({ binDir, basePath: "/usr/bin" })).toEqual({});
  });

  it("keeps a single copy when the bin dir is already on PATH", () => {
    const binDir = join(makeTempDir(), "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "pandoc"), "#!/bin/sh\n");

    const env = resolvePreinstalledToolsAgentEnv({
      binDir,
      basePath: ["/usr/local/bin", binDir, "/usr/bin", binDir].join(delimiter),
    });

    expect(env.PATH).toBe([binDir, "/usr/local/bin", "/usr/bin"].join(delimiter));
  });

  it("sets only the bin dir when there is no inherited PATH", () => {
    const binDir = join(makeTempDir(), "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "qpdf"), "#!/bin/sh\n");

    const env = resolvePreinstalledToolsAgentEnv({ binDir });

    expect(env.PATH).toBe(binDir);
  });

  it("trims whitespace and treats a blank bin dir as absent", () => {
    expect(resolvePreinstalledToolsAgentEnv({ binDir: "   ", basePath: "/usr/bin" })).toEqual({});
    expect(resolvePreinstalledToolsAgentEnv({ basePath: "/usr/bin" })).toEqual({});
  });
});
