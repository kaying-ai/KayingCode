import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { applyUpstreamBranding, BRAND_SOURCE_FILES } from "../scripts/apply-upstream-branding.mjs";
const exec = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../../..");
const config = JSON.parse(
  await readFile(resolve(repoRoot, "packages/web/upstream-web.json"), "utf8"),
);
test("brands official startup and workbench art while preserving behavior and provider identity", async () => {
  const stage = await mkdtemp(resolve(tmpdir(), "upstream-branding-"));
  try {
    const originals = new Map<string, string>();
    for (const file of BRAND_SOURCE_FILES) {
      const { stdout } = await exec("git", ["show", `${config.commit}:${file}`], {
        cwd: repoRoot,
        maxBuffer: 4e6,
      });
      await mkdir(dirname(resolve(stage, file)), { recursive: true });
      await writeFile(resolve(stage, file), stdout);
      originals.set(file, stdout);
    }
    const mainBefore = await readFile(resolve(stage, "packages/web/src/main.tsx"), "utf8");
    const draftBefore = await readFile(
      resolve(stage, "packages/ui/src/v4/ConversationDraftEmptyState.tsx"),
      "utf8",
    );
    const brand = await applyUpstreamBranding({ stage, repoRoot });
    const html = await readFile(resolve(stage, "packages/web/index.html"), "utf8");
    expect(html).toContain("<title>KayingCode</title>");
    expect(html).toContain('data-brand="kayingcode"');
    expect(html).not.toContain("M134.4 0.130152");
    expect(html).toContain("data:image/png;base64,");
    const main = await readFile(resolve(stage, "packages/web/src/main.tsx"), "utf8");
    expect(main.replaceAll('"KayingCode', '"ZCode')).toBe(mainBefore);
    const draft = await readFile(
      resolve(stage, "packages/ui/src/v4/ConversationDraftEmptyState.tsx"),
      "utf8",
    );
    expect(
      draft.slice(draft.indexOf("export function"), draft.indexOf("function ZCodeEmptyStateLogo")),
    ).toBe(
      draftBefore.slice(
        draftBefore.indexOf("export function"),
        draftBefore.indexOf("function ZCodeEmptyStateLogo"),
      ),
    );
    expect(draft).not.toContain('stroke="currentColor"');
    expect(draft).toContain('data-v4-draft-logo="light"');
    expect(draft).toContain('data-v4-draft-logo="dark"');
    expect(draft).toContain("[html.dark_&]:block");
    expect(draft).toContain("[html.dark_&]:hidden");
    const startup = await readFile(
      resolve(stage, "packages/ui/src/root/RootStartupLoading.tsx"),
      "utf8",
    );
    expect(startup).toContain("motion-safe:animate-pulse");
    expect(startup).toContain('data-testid="root-startup-loading"');
    expect(brand.files.length).toBe(BRAND_SOURCE_FILES.length);
    for (const asset of brand.assets) expect(asset.sha256).toHaveLength(64);
    const app = await readFile(
      resolve(stage, "packages/ui/src/components/mobile-ui/ZCodeAppLogo.tsx"),
      "utf8",
    );
    expect(app).toContain('data-app-logo="kayingcode"');
    expect(app).not.toContain("logo-zai.svg");
    // 供应商图标不属于品牌替换名单；不通过覆盖 logo-zai.svg 偷换第三方身份。
    expect(
      brand.assets.some((asset: { target: string }) => asset.target.endsWith("logo-zai.svg")),
    ).toBe(false);
    await Promise.all(
      [...originals].map(([file, source]) => writeFile(resolve(stage, file), source)),
    );
    await writeFile(
      resolve(stage, "packages/web/src/web-remote-control/ui/webRemoteControlBrand.tsx"),
      "export const changedUpstream = true;",
    );
    await expect(applyUpstreamBranding({ stage, repoRoot })).rejects.toThrow(
      "Branding anchor changed: >ZCode</span>",
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});
