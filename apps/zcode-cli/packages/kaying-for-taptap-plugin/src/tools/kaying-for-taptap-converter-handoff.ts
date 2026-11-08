/** Verifies the portable KayingGameConverter → KayingForTaptap acceptance boundary. */

import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../async-files";

const ACCEPTANCE_PATH = ".project/kaying-game-converter/acceptance.json";
const HANDOFF_PATH = ".project/kaying-game-converter/handoff.json";
const LOCK_PATH = ".project/kaying-game-converter/conversion-lock.json";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface KayingForTaptapConverterHandoffInspection {
  status: "missing" | "invalid" | "ready";
  verified: boolean;
  message: string;
  trackedFiles: number;
}

export async function inspectKayingForTaptapConverterHandoff(
  projectRootInput: string,
): Promise<KayingForTaptapConverterHandoffInspection> {
  const projectRoot = path.resolve(projectRootInput);
  if (!(await pathExists(path.join(projectRoot, HANDOFF_PATH)))) {
    return result("missing", "Converter handoff is not present");
  }

  try {
    const handoff = await readRecord(projectRoot, HANDOFF_PATH);
    const acceptance = await readRecord(projectRoot, ACCEPTANCE_PATH);
    const lock = await readRecord(projectRoot, LOCK_PATH);
    assertHandoffContract(handoff, acceptance, lock);
    const trackedFiles = await assertLockAndGeneratedFiles(projectRoot, lock);
    const converter = handoff.converter as Record<string, unknown>;
    assert(
      converter.generatedFileCount === trackedFiles + 1,
      "Converter generated count does not match its lock",
    );
    return {
      status: "ready",
      verified: true,
      message: `Verified Converter acceptance and ${trackedFiles} generated file hashes`,
      trackedFiles,
    };
  } catch (error) {
    return result("invalid", error instanceof Error ? error.message : String(error));
  }
}

function assertHandoffContract(
  handoff: Record<string, unknown>,
  acceptance: Record<string, unknown>,
  lock: Record<string, unknown>,
): void {
  assert(handoff.version === 2, "Converter handoff version is unsupported");
  assert(
    handoff.status === "ready_for_kaying-for-taptap",
    "Converter handoff is not ready for KayingForTaptap",
  );
  assert(handoff.engine === "taptap", "Converter handoff engine is not TapTap");
  assert(handoff.entry === "scripts/main.lua", "Converter handoff entry is invalid");
  assert(
    handoff.nextOwner === "kaying-for-taptap",
    "Converter handoff owner is not KayingForTaptap",
  );
  assert(isSha256(handoff.sourceSha256), "Converter handoff source hash is invalid");
  assert(isSha256(handoff.baselineHash), "Converter handoff baseline hash is invalid");
  assert(isSha256(handoff.specHash), "Converter handoff spec hash is invalid");

  const handoffAcceptance = asRecord(handoff.acceptance, "Converter handoff acceptance is invalid");
  const converter = asRecord(handoff.converter, "Converter handoff metadata is invalid");
  assert(handoffAcceptance.path === ACCEPTANCE_PATH, "Converter acceptance path is invalid");
  assert(converter.lockPath === LOCK_PATH, "Converter lock path is invalid");
  assert(converter.validationStatus === "verified", "Converter validation did not pass");
  assert(handoffAcceptance.status === "verified", "Converter handoff was not verified");
  assert(
    Array.isArray(handoffAcceptance.blockingGaps) && handoffAcceptance.blockingGaps.length === 0,
    "Converter handoff has blocking gaps",
  );
  assert(acceptance.version === handoffAcceptance.reportVersion, "Acceptance version mismatch");
  assert(acceptance.version === 2, "Converter acceptance version is unsupported");
  assert(acceptance.status === "verified", "Converter acceptance report was not verified");
  assert(acceptance.validationStatus === "verified", "Acceptance validation did not pass");
  assert(
    Array.isArray(acceptance.blockingGaps) && acceptance.blockingGaps.length === 0,
    "Converter acceptance report has blocking gaps",
  );
  assert(acceptance.sourceSha256 === handoff.sourceSha256, "Acceptance source hash mismatch");
  assert(acceptance.baselineHash === handoff.baselineHash, "Acceptance baseline hash mismatch");
  assert(acceptance.specHash === handoff.specHash, "Acceptance spec hash mismatch");
  assert(lock.projectId === handoff.projectId, "Converter project id mismatch");
  const source = asRecord(lock.source, "Converter lock source is invalid");
  assert(source.sha256 === handoff.sourceSha256, "Converter lock source hash mismatch");
  assert(lock.specHash === handoff.specHash, "Converter lock spec hash mismatch");
  assert(
    converter.generatedFileCount === acceptance.generatedFileCount,
    "Generated count mismatch",
  );
}

async function assertLockAndGeneratedFiles(
  projectRoot: string,
  lock: Record<string, unknown>,
): Promise<number> {
  assert(lock.version === 2, "Converter lock version is unsupported");
  assert(isSha256(lock.contentSha256), "Converter lock digest is invalid");
  const { contentSha256, ...withoutDigest } = lock;
  const expectedDigest = sha256(`${JSON.stringify(withoutDigest, null, 2)}\n`);
  assert(contentSha256 === expectedDigest, "Converter lock digest does not match its content");

  const generatedFiles = lock.generatedFiles;
  const generatedFileHashes = asRecord(
    lock.generatedFileHashes,
    "Generated file hashes are invalid",
  );
  assert(
    Array.isArray(generatedFiles) && generatedFiles.length > 0,
    "Generated file list is empty",
  );
  assert(generatedFiles.includes("scripts/main.lua"), "Converter entry is not tracked by the lock");
  assert(
    generatedFiles.length === Object.keys(generatedFileHashes).length,
    "Generated file list and hashes differ",
  );
  for (const relativePath of generatedFiles) {
    assert(typeof relativePath === "string", "Generated file path is invalid");
    const expectedHash = generatedFileHashes[relativePath];
    assert(isSha256(expectedHash), `Generated file hash is invalid: ${relativePath}`);
    const target = await resolveFileInside(projectRoot, relativePath);
    assert(
      sha256(await readFile(target)) === expectedHash,
      `Generated file changed: ${relativePath}`,
    );
  }
  return generatedFiles.length;
}

async function readRecord(
  projectRoot: string,
  relativePath: string,
): Promise<Record<string, unknown>> {
  const target = await resolveFileInside(projectRoot, relativePath);
  const value: unknown = JSON.parse(await readFile(target, "utf8"));
  return asRecord(value, `Converter artifact is invalid: ${relativePath}`);
}

async function resolveFileInside(projectRoot: string, relativePath: string): Promise<string> {
  const target = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, target);
  assert(
    !relative.startsWith("..") && !path.isAbsolute(relative),
    `Path escapes project: ${relativePath}`,
  );
  let targetIsFile = false;
  try {
    targetIsFile = (await stat(target)).isFile();
  } catch {
    // The contract below turns a missing or inaccessible artifact into a stable validation error.
  }
  assert(targetIsFile, `File is missing: ${relativePath}`);
  return target;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  assert(Boolean(value) && typeof value === "object" && !Array.isArray(value), message);
  return value as Record<string, unknown>;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function result(
  status: KayingForTaptapConverterHandoffInspection["status"],
  message: string,
): KayingForTaptapConverterHandoffInspection {
  return { status, verified: false, message, trackedFiles: 0 };
}
