import { describe, expect, it } from "vitest";
import { buildNodeArchiveExtractCommand } from "../src/packaging/nodeArchiveExtract.js";

const request = {
  archivePath: "C:\\Temp\\kayingcode-server-node-abc\\node-v22.16.0-linux-x64.tar.xz",
  memberPath: "node-v22.16.0-linux-x64/bin/node",
  stripComponents: 2,
  destinationDir: "D:\\repo\\node_modules\\.cache\\kayingcode-server-cli\\node-v22.16.0-linux-x64",
  cwd: "D:\\repo",
  tarCommand: "C:\\Windows\\System32\\tar.exe",
};

describe("buildNodeArchiveExtractCommand", () => {
  it("Windows 宿主用相对归档名 + 正斜杠 -C，避免 GNU tar 把盘符当远程主机", () => {
    const command = buildNodeArchiveExtractCommand(request, "win32");
    expect(command.command).toBe("C:\\Windows\\System32\\tar.exe");
    // 回归：过去直接把 `C:\...` 传给 -f，Git Bash 的 GNU tar 报 "Cannot connect to C"。
    expect(command.args).toContain("node-v22.16.0-linux-x64.tar.xz");
    expect(command.args).not.toContain(request.archivePath);
    expect(command.args).toContain(
      "D:/repo/node_modules/.cache/kayingcode-server-cli/node-v22.16.0-linux-x64",
    );
    expect(command.args).not.toContain(request.destinationDir);
    expect(command.args).toContain("--strip-components=2");
    expect(command.cwd).toBe("C:\\Temp\\kayingcode-server-node-abc");
  });

  it("非 Windows 宿主保持原命令形状与调用方 cwd", () => {
    const command = buildNodeArchiveExtractCommand({ ...request, tarCommand: "tar" }, "darwin");
    expect(command.command).toBe("tar");
    expect(command.args).toEqual([
      "-xJf",
      request.archivePath,
      "--strip-components=2",
      "-C",
      request.destinationDir,
      request.memberPath,
    ]);
    expect(command.cwd).toBe("D:\\repo");
  });

  it("Windows 目标的 zip 归档沿用 strip 1 与 node.exe 成员路径", () => {
    const command = buildNodeArchiveExtractCommand(
      {
        archivePath: "C:\\Temp\\node-v22.16.0-win-x64.zip",
        memberPath: "node-v22.16.0-win-x64/node.exe",
        stripComponents: 1,
        destinationDir: "D:\\repo\\cache\\node-v22.16.0-win32-x64",
        cwd: "D:\\repo",
        tarCommand: "C:\\Windows\\System32\\tar.exe",
      },
      "win32",
    );
    expect(command.args).toContain("-xf");
    expect(command.args).toContain("node-v22.16.0-win-x64.zip");
    expect(command.args).toContain("--strip-components=1");
  });
});
