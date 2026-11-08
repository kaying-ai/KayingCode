import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { stageUpstreamWeb } from "./stage-upstream-web.mjs";
import { stageUpstreamWebNotices } from "../../../scripts/third-party-notices.mjs";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(webRoot, "../..");
const digest = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
function command(bin, args, cwd = repoRoot, env = process.env) {
  return new Promise((done, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? done() : reject(new Error(`${bin} exited ${code}`))));
  });
}

// 官方源码导出与补丁由 stage-upstream-web 统一负责；web-share 构建复用同一份 stage。
const { source, stage, relayOrigin, workbenchHashes, branding, mobileWebview, workspaceIdentity } =
  await stageUpstreamWeb({ webRoot, repoRoot });
const target = resolve(stage, "packages/web");
await command(
  process.execPath,
  process.argv.includes("--dev")
    ? [resolve(repoRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"]
    : [
        resolve(repoRoot, "node_modules/vite/bin/vite.js"),
        "build",
        "--base=/remote/",
        "--outDir",
        resolve(webRoot, "dist"),
        "--emptyOutDir",
      ],
  target,
  {
    ...process.env,
    ZCODE_ENV: "production",
    ZCODE_BASE_URL: relayOrigin,
    VITE_ZCODE_BASE_URL: relayOrigin,
  },
);
for (const [path, expected] of Object.entries(workbenchHashes)) {
  const brand = branding.files.find((file) => file.path === path);
  if (brand && brand.upstreamSha256 !== expected)
    throw new Error(`Official workbench changed before branding: ${path}`);
  if (
    (await digest(resolve(stage, path))) !==
    (path === mobileWebview.path ? mobileWebview.sha256 : (brand?.sha256 ?? expected))
  )
    throw new Error(`Official workbench modified: ${path}`);
}
for (const { path, sha256 } of mobileWebview.projectFiles) {
  if ((await digest(resolve(stage, path))) !== sha256)
    throw new Error(`Mobile project workbench modified: ${path}`);
}
const notices = await stageUpstreamWebNotices(resolve(webRoot, "dist"), repoRoot);
const builtHtmlPath = resolve(webRoot, "dist/index.html");
const builtHtml = await readFile(builtHtmlPath, "utf8");
if (!builtHtml.includes("</head>")) throw new Error("Missing HTML head for license metadata");
await writeFile(
  builtHtmlPath,
  builtHtml.replace(
    "</head>",
    '<link rel="license" href="/remote/UPSTREAM-THIRD-PARTY-NOTICES.md">\n</head>',
  ),
);
await writeFile(
  resolve(webRoot, "dist/mobile-web-manifest.json"),
  JSON.stringify(
    {
      upstream: source,
      notices,
      entryVersion: 2,
      auth: "desktop-invitation",
      relayOrigin,
      workbenchHashes,
      branding,
      mobileWebview,
      workspaceIdentity,
      dependencyLockSha256: await digest(resolve(repoRoot, "pnpm-lock.yaml")),
      adapterHashes: Object.fromEntries(
        await Promise.all(
          source.overrides.map(async (path) => [
            path,
            await digest(resolve(stage, "packages/web", path)),
          ]),
        ),
      ),
      overrides: [
        ...source.overrides,
        "index.html bootstrap",
        "src/mobileWebview.ts",
        "mobile project notification/navigation in main.tsx",
        ...mobileWebview.projectFiles.map((file) => file.path),
        ...workspaceIdentity.map((file) => file.path),
        ...branding.files.map((file) => file.path),
      ],
    },
    null,
    2,
  ),
);
console.log(`Official Web ${source.version} built from ${source.commit}`);
