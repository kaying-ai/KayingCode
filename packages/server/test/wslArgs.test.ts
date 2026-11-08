import { describe, expect, it } from "vitest";
import { buildWslArgs } from "../src/remote/wsl-backend.js";

describe("buildWslArgs", () => {
  it("使用 --exec 直接传 argv，避免 wsl.exe 在 Windows 侧展开后端脚本变量", () => {
    // 回归：缺 --exec 时 `tar_tool=` 这类变量在到达 bash 前被清空，
    // 远端 preflight 会误报“缺少 tar”。
    expect(buildWslArgs(["bash", "-lc", "tar_tool=; echo $tar_tool"], "Ubuntu-22.04", "root")).toEqual(
      ["-d", "Ubuntu-22.04", "-u", "root", "--exec", "bash", "-lc", "tar_tool=; echo $tar_tool"],
    );
  });

  it("未解析出用户时只带发行版", () => {
    expect(buildWslArgs(["bash", "-lc", "true"], "Ubuntu-22.04", null)).toEqual([
      "-d",
      "Ubuntu-22.04",
      "--exec",
      "bash",
      "-lc",
      "true",
    ]);
  });

  it("没有发行版时仍保留 --exec", () => {
    expect(buildWslArgs(["bash", "-lc", "true"])).toEqual(["--exec", "bash", "-lc", "true"]);
  });
});
