import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

export const BRAND_SOURCE_FILES = [
  "packages/web/index.html",
  "packages/web/src/main.tsx",
  "packages/web/src/web-remote-control/ui/webRemoteControlBrand.tsx",
  "packages/ui/src/root/RootStartupLoading.tsx",
  "packages/ui/src/components/ui/ZCodeAboutLogo.tsx",
  "packages/ui/src/components/mobile-ui/ZCodeAppLogo.tsx",
  "packages/ui/src/v4/ConversationDraftEmptyState.tsx",
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
function exact(source, before, after) {
  if (source.split(before).length !== 2)
    throw new Error(`Branding anchor changed: ${before.slice(0, 60)}`);
  return source.replace(before, after);
}
function findFunction(source, name) {
  const ast = ts.createSourceFile(
    "brand.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const matches = ast.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  if (matches.length !== 1) throw new Error(`Branding function changed: ${name}`);
  const node = matches[0];
  return { start: node.getStart(ast), end: node.end, text: node.getText(ast) };
}
function replaceFunction(source, name, replacement) {
  const node = findFunction(source, name);
  return source.slice(0, node.start) + replacement + source.slice(node.end);
}
function brandTitles(source) {
  const ast = ts.createSourceFile(
    "main.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const changes = [];
  function visit(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(ast) === "document.title"
    ) {
      function titleLiteral(child) {
        if (ts.isStringLiteral(child) && child.text.startsWith("ZCode"))
          changes.push({
            start: child.getStart(ast),
            end: child.end,
            text: JSON.stringify(`KayingCode${child.text.slice(5)}`),
          });
        else ts.forEachChild(child, titleLiteral);
      }
      titleLiteral(node.right);
    } else ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!changes.length) throw new Error("Branding title assignments changed");
  for (const change of changes.sort((a, b) => b.start - a.start))
    source = source.slice(0, change.start) + change.text + source.slice(change.end);
  return source;
}

/** 只改已列明的品牌叶子与字面量，不覆盖官方页面、数据或连接实现。 */
export async function applyUpstreamBranding({ stage, repoRoot }) {
  const originals = new Map(
    await Promise.all(
      BRAND_SOURCE_FILES.map(async (path) => [path, await readFile(resolve(stage, path), "utf8")]),
    ),
  );
  const [mark, favicon, about, startup, draft] = await Promise.all([
    readFile(resolve(repoRoot, "packages/ui/src/assets/KayingCode-mark.png")),
    readFile(resolve(repoRoot, "public/logo/icons/32x32.png")),
    readFile(resolve(repoRoot, "packages/ui/src/components/ui/KayingCodeAboutLogo.tsx"), "utf8"),
    readFile(resolve(repoRoot, "packages/ui/src/root/RootStartupLoading.tsx"), "utf8"),
    readFile(resolve(repoRoot, "packages/ui/src/v4/ConversationDraftEmptyState.tsx"), "utf8"),
  ]);
  const transformed = new Map(originals);
  const htmlPath = BRAND_SOURCE_FILES[0];
  let html = originals.get(htmlPath);
  // 修复原因：上游 HTML 内嵌旧图形，覆盖 public/favicon 或 React 组件无法更换 JS 前的首帧。
  const oldLogo = html.match(/<svg\b[^>]*class="zcode-boot-loading__logo"[\s\S]*?<\/svg>/g);
  if (oldLogo?.length !== 1) throw new Error("Branding boot logo changed");
  html = exact(
    html,
    oldLogo[0],
    `<img class="zcode-boot-loading__logo" data-brand="kayingcode" src="data:image/png;base64,${mark.toString("base64")}" alt="" aria-hidden="true" draggable="false" />`,
  );
  const oldFavicon = html.match(/href="data:image\/png;base64,[^"]+"/g);
  if (oldFavicon?.length !== 1) throw new Error("Branding favicon changed");
  html = exact(html, oldFavicon[0], `href="data:image/png;base64,${favicon.toString("base64")}"`);
  html = exact(html, "<title>ZCode</title>", "<title>KayingCode</title>");
  html = exact(
    html,
    "    </style>",
    "      @keyframes kayingcode-boot-breathe { 50% { opacity: 0.4; } }\n      @media (prefers-reduced-motion: no-preference) { .zcode-boot-loading__logo { animation: kayingcode-boot-breathe 1.8s ease-in-out infinite; } }\n    </style>",
  );
  transformed.set(htmlPath, html);
  transformed.set(BRAND_SOURCE_FILES[1], brandTitles(originals.get(BRAND_SOURCE_FILES[1])));
  transformed.set(
    BRAND_SOURCE_FILES[2],
    exact(originals.get(BRAND_SOURCE_FILES[2]), ">ZCode</span>", ">KayingCode</span>"),
  );
  const startupLeaf = findFunction(startup, "KayingCodeStartupLogo")
    .text.replace("function KayingCodeStartupLogo", "export function ZCodeStartupLogo")
    .replace('"startup-logo-breathe"', '"motion-safe:animate-pulse"');
  transformed.set(
    BRAND_SOURCE_FILES[3],
    'import kayingCodeMarkUrl from "@/assets/KayingCode-mark.png";\n' +
      replaceFunction(originals.get(BRAND_SOURCE_FILES[3]), "ZCodeStartupLogo", startupLeaf),
  );
  transformed.set(
    BRAND_SOURCE_FILES[4],
    about
      .replaceAll("KayingCodeAboutLogo", "ZCodeAboutLogo")
      .replaceAll("KayingCodeWordmarkLogo", "ZCodeWordmarkLogo"),
  );
  transformed.set(
    BRAND_SOURCE_FILES[5],
    exact(
      exact(
        originals.get(BRAND_SOURCE_FILES[5]),
        '"@/assets/provider-icons/logo-zai.svg"',
        '"@/assets/KayingCode-app-badge.png"',
      ),
      'data-app-logo="zcode"',
      'data-app-logo="kayingcode"',
    ),
  );
  // 上游 Tailwind dark: 当前按系统媒体条件生成；品牌水印必须跟随 useTheme 写入的根类。
  const draftLeaf = findFunction(draft, "KayingCodeEmptyStateLogo")
    .text.replace("function KayingCodeEmptyStateLogo", "function ZCodeEmptyStateLogo")
    .replace("dark:hidden", "[html.dark_&]:hidden")
    .replace("dark:block", "[html.dark_&]:block");
  transformed.set(
    BRAND_SOURCE_FILES[6],
    exact(
      replaceFunction(originals.get(BRAND_SOURCE_FILES[6]), "ZCodeEmptyStateLogo", draftLeaf),
      '"@/assets/Z.svg"',
      '"@/assets/KayingCode-empty-dark.png"',
    ),
  );
  const assets = [
    ...["mark", "app-badge", "empty-dark"].map((name) => ({
      source: `packages/ui/src/assets/KayingCode-${name}.png`,
      target: `packages/ui/src/assets/KayingCode-${name}.png`,
    })),
    { source: "packages/web/public/favicon.ico", target: "packages/web/public/favicon.ico" },
  ];
  // 全部结构校验完成后才写入，避免上游改动时产生半份品牌制品。
  const files = await Promise.all(
    [...transformed].map(async ([path, text]) => {
      await writeFile(resolve(stage, path), text);
      return { path, upstreamSha256: hash(originals.get(path)), sha256: hash(text) };
    }),
  );
  const assetRecords = await Promise.all(
    assets.map(async (asset) => {
      await mkdir(dirname(resolve(stage, asset.target)), { recursive: true });
      await copyFile(resolve(repoRoot, asset.source), resolve(stage, asset.target));
      return { ...asset, sha256: hash(await readFile(resolve(repoRoot, asset.source))) };
    }),
  );
  return {
    name: "KayingCode",
    master: "assets/brand/kayingcode.png",
    masterSha256: hash(await readFile(resolve(repoRoot, "assets/brand/kayingcode.png"))),
    files,
    assets: [
      ...assetRecords,
      {
        source: "public/logo/icons/32x32.png",
        target: "index.html inline favicon",
        sha256: hash(favicon),
      },
    ],
  };
}
