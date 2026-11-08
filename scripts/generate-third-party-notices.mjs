import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { collectNpmNotices, hashBytes } from "./third-party-npm.mjs";
import {
  noticesFileName,
  readNativeSearchNotices,
  repositoryRoot,
} from "./third-party-notices.mjs";

export function selectNpmNoticeOverrides(overrides, currentPackages, pruneStaleOverrides = false) {
  const staleOverrides = overrides.filter((item) => !currentPackages.has(item.package));
  if (staleOverrides.length && !pruneStaleOverrides)
    throw new Error(
      `Stale npm notice overrides: ${staleOverrides.map((item) => item.package).join(", ")}`,
    );
  return {
    overrides: overrides.filter((item) => currentPackages.has(item.package)),
    staleOverrides,
  };
}

export async function readNpmOverrideEvidence(overrides, readInput) {
  for (const record of overrides) {
    if (record.file) await readInput(record.file);
    // 后补通知的版本关联也属于生成输入，不能只记录 URL 后漏掉源码身份材料漂移。
    for (const evidence of record.reviewEvidence?.files ?? []) {
      if (hashBytes(await readInput(evidence.file)) !== evidence.sha256)
        throw new Error(`Changed npm version evidence: ${record.package}`);
    }
  }
}

export async function generateThirdPartyNotices(
  root = repositoryRoot,
  { pruneStaleOverrides = false } = {},
) {
  const inputs = {};
  const readInput = async (file) => {
    const bytes = await readFile(join(root, file));
    inputs[file] = hashBytes(bytes.toString("utf8").replaceAll("\r\n", "\n"));
    return bytes;
  };
  const readJson = async (file) => JSON.parse(await readInput(file));
  let overrides = await readJson("third-party/npm-overrides.json");
  const licenseReviews = await readJson("third-party/license-reviews.json");
  for (const review of licenseReviews) {
    if (hashBytes(await readInput(review.evidence.file)) !== review.evidence.sha256)
      throw new Error(`Changed license review evidence: ${review.package}`);
  }
  const copied = await readJson("third-party/copied-components.json");
  const embedded = await readJson("third-party/embedded-components.json");
  const runtimes = await readJson("third-party/runtime/sources.json");
  for (const runtime of runtimes.node) {
    if (hashBytes(await readInput(runtime.file)) !== runtime.sha256)
      throw new Error(`Changed Node ${runtime.version} license`);
  }
  const pkg = await readJson("package.json");
  await readInput("pnpm-lock.yaml");
  await readInput("pnpm-workspace.yaml");
  await readInput("third-party/native-search/sources.json");
  const { packages, notInstalled, workspaceManifests } = await collectNpmNotices(root, overrides);
  // 修复：递归扫描会把 bundled-agents/mock-cdn 的可删除缓存当作源码输入，重建立即失效。
  // workspace 边界由 pnpm-lock.yaml 登记的工程集合解析，同一份项目集合用于依赖图和 manifest 新鲜度检查。
  for (const file of workspaceManifests) await readInput(file);
  const currentPackages = new Set(
    [...packages, ...notInstalled].map((item) => `${item.name}@${item.version}`),
  );
  const productionReviews = licenseReviews.filter((review) => currentPackages.has(review.package));
  const selected = selectNpmNoticeOverrides(overrides, currentPackages, pruneStaleOverrides);
  const staleOverrides = selected.staleOverrides;
  if (staleOverrides.length) {
    // 旧版或仅开发依赖仍可能出现在锁文件；以已核对的完整生产图清理源登记，再重新计算真实输入哈希。
    overrides = selected.overrides;
    await writeFile(
      join(root, "third-party/npm-overrides.json"),
      `${JSON.stringify(overrides, null, 2)}\n`,
    );
    await readInput("third-party/npm-overrides.json");
    console.log(`Removed ${staleOverrides.length} stale npm notice overrides`);
  }
  const textRecords = new Map();
  function addText(bytes, owner, origin) {
    const sha256 = hashBytes(bytes);
    const record = textRecords.get(sha256) ?? { bytes, references: [] };
    record.references.push({ owner, origin });
    textRecords.set(sha256, record);
    return sha256;
  }
  await readNpmOverrideEvidence(overrides, readInput);
  const packageInventory = packages.map(({ notices, ...item }) => ({
    ...item,
    notices: notices.map(({ member, bytes }) => ({
      member,
      sha256: addText(bytes, `${item.name}@${item.version}`, member),
    })),
  }));
  async function copiedFiles(file, files) {
    if ((await stat(join(root, file))).isDirectory()) {
      for (const child of (await readdir(join(root, file))).sort())
        await copiedFiles(`${file}/${child}`, files);
    } else {
      const bytes = await readInput(file);
      files.push({ file, sha256: hashBytes(bytes) });
    }
  }
  const copiedInventory = [];
  for (const record of copied) {
    if (record.file) {
      const bytes = await readInput(record.file);
      if (hashBytes(bytes) !== record.sha256)
        throw new Error(`Changed copied-source license: ${record.id}`);
      addText(bytes, record.id, record.source);
    } else if (!record.reviewRequired) {
      throw new Error(`Missing copied-source license or review: ${record.id}`);
    }
    const files = [];
    for (const file of record.roots) await copiedFiles(file, files);
    for (const file of record.modifiedFiles ?? []) {
      // 修复：集中 NOTICE 不能替代 Apache 4(b) 的文件内修改声明，重新生成时也不能抹掉这一义务。
      if (!files.some((entry) => entry.file === file))
        throw new Error(`Modified source outside copied roots: ${file}`);
      if (!(await readFile(join(root, file), "utf8")).includes("Modified by KayingCode:"))
        throw new Error(`Missing file-local modification notice: ${file}`);
    }
    copiedInventory.push({ ...record, files });
  }
  for (const component of embedded) {
    if (!packages.some((item) => `${item.name}@${item.version}` === component.parentPackage))
      throw new Error(`Stale embedded component: ${component.parentPackage}`);
    for (const evidence of component.buildEvidence ?? []) {
      if (hashBytes(await readInput(evidence.file)) !== evidence.sha256)
        throw new Error(`Changed embedded build provenance: ${component.id}`);
    }
    for (const notice of component.notices) {
      const bytes = await readInput(notice.file);
      if (hashBytes(bytes) !== notice.sha256)
        throw new Error(`Changed embedded notice: ${component.id}`);
      addText(
        bytes,
        `${notice.component ?? component.id} (inside ${component.parentPackage})`,
        notice.source,
      );
    }
  }
  // 上游 AI Elements 的 LICENSE 是短版授权头，还需随包提供 Apache 2.0 全文。
  addText(
    await readInput("scripts/license-texts/Apache-2.0.txt"),
    "Apache-2.0 licensed components",
    "Apache License, Version 2.0",
  );
  const patches = [];
  // 工作区已迁到 pnpm；继续读 Bun 顶层字段会漏掉所有当前依赖补丁的修改声明。
  for (const [name, file] of Object.entries(pkg.pnpm?.patchedDependencies ?? {})) {
    patches.push({ package: name, file, sha256: hashBytes(await readInput(file)) });
  }
  const native = await readNativeSearchNotices(root, { verify: true });
  for (const file of Object.keys(native.inventory.inputs)) await readInput(file);
  for (const component of native.inventory.components) {
    for (const notice of component.notices) await readInput(notice.file);
  }
  const sections = [
    "# Third-party notices",
    `Generated by \`node scripts/licenses.mjs notices\` on ${process.platform}/${process.arch} from installed packages in the current workspace production dependency graph, copied source/assets and native search tools. Optional packages absent from this host are listed as \`notInstalled\` in \`third-party/inventory.json\` and have no notice text in this file. Generate and check notices for each release target and compare them with the actual artifact. Versions, source references and hashes are recorded in \`third-party/inventory.json\` and \`third-party/native-search/sources.json\` in the source repository.`,
    "Original copyright, license and NOTICE text is retained below. Identical text is shared by the components listed above it. Package metadata license identifiers are descriptive; they do not replace the original terms. Copyright holders are never inferred from npm author fields.",
    "## npm packages",
    ...packageInventory.map(
      (item) =>
        `- ${item.name}@${item.version} — ${typeof item.license === "string" ? item.license : JSON.stringify(item.license)}${item.acceptedMissingNotice ? `; ${item.acceptedMissingNotice}` : ""}`,
    ),
    "## Source evidence limitations",
    "Some publishers provide only a license identifier or a short README license section instead of a complete LICENSE file. For the following packages the supplied material explicitly identifies publisher metadata and standard terms; it is not represented as an original upstream LICENSE file. Any available README copyright notice is retained:",
    ...overrides
      .filter((item) => item.evidenceKind)
      .map((item) => `- ${item.package}: ${item.source}`),
    "The original import revisions of copied components are not recorded in the current checkout. Pinned license references below do not establish the original copy revision. They cover upstream-derived portions only; local adaptations do not change the upstream terms.",
    "## Copied source and assets",
    ...copied.map(
      (item) =>
        `- ${item.id} (${item.license ?? "not established"}): ${item.roots.join(", ")}. License reference: ${item.source ?? "not established"}. Original import revision: ${item.importRevision ?? "not recorded"}.${item.reviewRequired ? ` Review required: ${item.reviewRequired}` : ""}`,
    ),
    "Fig autocomplete source carries the repository's MIT license; the generated registry records npm @withfig/autocomplete@2.692.3 metadata as ISC. The original source MIT notice is retained below.",
    "## Embedded native and WASM components",
    ...embedded.map(
      (item) =>
        `- ${item.id} inside ${item.parentPackage}; upstream revision ${item.revision}; source: ${item.source}. ${item.reviewRequired ?? ""}`,
    ),
    "Electron/Chromium target-specific notices are shipped separately under Resources/licenses/electron. Distributions containing an independent Node runtime also include its exact-version LICENSE.node.txt; SEA includes that text in --licenses output.",
    "## Modified npm packages",
    ...patches.map(
      (item) =>
        `- ${item.package}: modified by KayingCode; the changes are recorded in ${item.file} in the source repository.`,
    ),
    "## Reviewed source availability and usage boundaries",
    "These records describe exact-version review boundaries, not a certification of final distributions. Development-only reviews do not authorize including those packages in production artifacts.",
    ...productionReviews.map(
      (review) =>
        `- ${review.package}: selected ${review.selectedLicense}; ${review.reason}${review.sourceArchive ? ` Corresponding source: ${review.sourceArchive}` : ""}`,
    ),
    "## License and NOTICE texts",
  ];
  for (const [sha256, record] of textRecords) {
    sections.push(
      `### Notice ${sha256}`,
      ...record.references.map(({ owner, origin }) => `- ${owner}: ${origin}`),
      "",
      "````text\n" + record.bytes.toString("utf8") + "\n````",
    );
  }
  sections.push("## Native search tools", "````text\n" + native.bytes.toString("utf8") + "\n````");
  const bytes = Buffer.from(`${sections.join("\n\n")}\n`);
  const inventory = {
    schemaVersion: 1,
    generatedOn: { os: process.platform, cpu: process.arch },
    inputHashEncoding:
      "UTF-8 with CRLF normalized to LF; notice and source snapshot hashes remain byte-exact",
    scope:
      "Installed production dependencies on the generating host across current workspace projects, copied source/assets and native tools; optional packages absent on this host are listed separately. Not a per-installer SBOM or a certification of all licensing obligations.",
    noticesSha256: hashBytes(bytes),
    inputs: Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b, "en"))),
    packages: packageInventory,
    notInstalled,
    copied: copiedInventory,
    patches,
    licenseReviews: productionReviews,
    exceptions: overrides.filter((item) => item.acceptedMissingNotice || item.evidenceKind),
    embedded,
    runtimes,
    reviewRequired: [
      ...productionReviews
        .filter((review) => review.releaseReviewRequired)
        .map((review) => ({
          id: `artifact-source:${review.package}`,
          reason: review.releaseReviewRequired,
        })),
      // 修复：复制源码的缺口此前只写在 README，重生成清单后严格门禁也无法阻断。
      ...copied
        .filter((item) => item.reviewRequired)
        .map((item) => ({ id: item.id, reason: item.reviewRequired })),
      ...overrides
        .filter((item) => item.acceptedMissingNotice || item.evidenceKind)
        .map((item) => ({
          id: item.package,
          reason:
            "Original version-specific publisher copyright/license material remains incomplete.",
        })),
      ...embedded
        .filter((item) => item.reviewRequired)
        .map((item) => ({ id: item.id, reason: item.reviewRequired })),
      ...native.inventory.components
        .filter((item) => !item.notices.length)
        .map((item) => ({
          id: `${item.id}@${item.version}`,
          reason: "No original notice snapshot for this recorded native component.",
        })),
    ],
  };
  await writeFile(join(root, noticesFileName), bytes);
  await writeFile(
    join(root, "third-party/inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
  );
  console.log(
    `${relative(root, join(root, noticesFileName))}: ${packages.length} package versions, ${copied.length} copied components, ${native.inventory.archives.length} native archives, ${bytes.length} bytes`,
  );
}
