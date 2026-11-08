import parseSpdx from "spdx-expression-parse";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

export async function verifyLicenseReviewEvidence(root, directory, review) {
  if (!review) return false;
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  try {
    return (
      hash(await readFile(join(root, review.evidence.file))) === review.evidence.sha256 &&
      hash(await readFile(join(directory, review.installedEvidence.member))) ===
        review.installedEvidence.sha256
    );
  } catch {
    // 原文或安装物缺失时保持未核实；复核登记本身不能替代证据。
    return false;
  }
}

const allowed =
  /^(MIT|MIT-0|ISC|BSD-2-Clause|BSD-3-Clause|BSD-4-Clause|0BSD|Unlicense|Apache-2\.0|Zlib|WTFPL|Artistic-2\.0|BlueOak-1\.0\.0|CC0-1\.0|CC-BY-4\.0|CC-BY-3\.0|OFL-1\.1|BSD|Python-2\.0)$/i;
export const isAllowedLicenseIdentifier = (value) => allowed.test(value);

function leafCategory(value) {
  if (isAllowedLicenseIdentifier(value)) return "green";
  if (/AGPL/i.test(value)) return "red-agpl";
  if (/LGPL/i.test(value)) return "yellow-lgpl";
  if (/GPL/i.test(value)) return "red-gpl";
  if (/^(MPL|EPL|CDDL)/i.test(value)) return "yellow-weak";
  if (/^(BUSL|BSL|Elastic|SSPL|PolyForm|FSL|CAL-1)/i.test(value)) return "red-semiopen";
  if (/^CC-BY-NC/i.test(value)) return "red-nc";
  if (/^CC-BY-(ND|SA)/i.test(value)) return "yellow-cc";
  return "review";
}

export function classifyLicense(raw) {
  const value = raw.trim();
  if (["", "(missing)", "missing"].includes(value)) return "missing";
  if (/^(UNLICENSED|UNKNOWN|N\/A)$|^SEE LICEN[CS]E IN/i.test(value)) return "unresolved";
  if (isAllowedLicenseIdentifier(value)) return "green";
  try {
    const evaluate = (node) => {
      if (node.license) return node.exception ? "review" : leafCategory(node.license);
      const left = evaluate(node.left),
        right = evaluate(node.right);
      // 括号和 AND/OR 优先级必须保留，不能把 GPL AND (MIT OR BSD) 的 BSD 分支单独放行。
      if (node.conjunction === "or") return left === "green" || right === "green" ? "green" : left;
      return left !== "green" ? left : right;
    };
    return evaluate(parseSpdx(value));
  } catch {
    return "review";
  }
}

export function decideReviewedLicense(record, review) {
  if (classifyLicense(record.license) === "green") return { allowed: true };
  if (
    !review ||
    review.package !== `${record.name}@${record.version}` ||
    !record.evidenceVerified ||
    review.expectedLicense !== record.license ||
    record.patched
  )
    return { allowed: false };
  if (
    review.scope === "identifier" &&
    (record.license !== "(missing)" || classifyLicense(review.selectedLicense) !== "green")
  )
    return { allowed: false };
  if (review.scope === "development" && record.isProd) return { allowed: false };
  if (
    review.scope === "internal-workspace" &&
    (!record.owners?.length || record.owners.some((owner) => !review.allowedOwners.includes(owner)))
  )
    return { allowed: false };
  if (
    !["identifier", "development", "internal-workspace", "source-available"].includes(review.scope)
  )
    return { allowed: false };
  return { allowed: true, reason: review.reason, selectedLicense: review.selectedLicense };
}
