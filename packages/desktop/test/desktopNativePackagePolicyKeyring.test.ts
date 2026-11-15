import { describe, expect, it } from "vitest";
import {
  createDesktopNativePackagePrunePatterns,
  findDesktopNativePackageViolations,
} from "../scripts/desktop-native-package-policy.mjs";

describe("desktop keyring native package policy", () => {
  it("prunes non-target keyring variants and keeps the target package", () => {
    const patterns = createDesktopNativePackagePrunePatterns("win32-x64");
    expect(patterns).toContain("!node_modules/@napi-rs/keyring-darwin-x64/**");
    expect(patterns).toContain("!node_modules/@napi-rs/keyring-linux-arm64-gnu/**");
    expect(patterns).toContain("!node_modules/@napi-rs/keyring-linux-x64-musl/**");
    expect(patterns).toContain("!node_modules/@napi-rs/keyring-linux-arm64-musl/**");
    expect(patterns).not.toContain("!node_modules/@napi-rs/keyring-win32-x64-msvc/**");
  });

  it("prunes musl variants for a linux gnu target", () => {
    const patterns = createDesktopNativePackagePrunePatterns("linux-x64");
    expect(patterns).toContain("!node_modules/@napi-rs/keyring-linux-x64-musl/**");
    expect(patterns).not.toContain("!node_modules/@napi-rs/keyring-linux-x64-gnu/**");
  });

  it("fails closed on a non-target keyring variant", () => {
    expect(
      findDesktopNativePackageViolations(
        [
          {
            packState: "unpack",
            path: "/node_modules/@napi-rs/keyring-linux-x64-gnu/keyring.linux-x64-gnu.node",
          },
        ],
        "win32-x64",
      ),
    ).toEqual([
      "keyring 包含非目标平台变体: @napi-rs/keyring-linux-x64-gnu /node_modules/@napi-rs/keyring-linux-x64-gnu/keyring.linux-x64-gnu.node",
    ]);
  });

  it("requires the target native file to be unpacked", () => {
    expect(
      findDesktopNativePackageViolations(
        [
          {
            packState: "pack",
            path: "/node_modules/@napi-rs/keyring-win32-x64-msvc/keyring.win32-x64-msvc.node",
          },
        ],
        "win32-x64",
      ),
    ).toEqual([
      "native 文件仍作为 packed payload 留在 app.asar: /node_modules/@napi-rs/keyring-win32-x64-msvc/keyring.win32-x64-msvc.node",
    ]);
  });
});
