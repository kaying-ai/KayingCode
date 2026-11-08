/** Bind a verified Rust workspace in place; never restore a name-matched remote over it. */
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../async-files";
import { inspectKayingForTaptapConverterHandoff } from "../tools/kaying-for-taptap-converter-handoff";
import { bindConverterProject } from "./converter-binding";
import type { ConverterRemoteProjectResult } from "./remote-projects";

export async function bindVerifiedConverterProject(
  root: string,
  projectName: string,
  projectTitle: string,
  bind = bindConverterProject,
): Promise<ConverterRemoteProjectResult | null> {
  // Fixture smoke setup (before conversion) retains its existing path. Production Rust
  // workspaces carry this ownership marker and must not use name-based remote restoration.
  if (
    !(await pathExists(path.join(root, ".project/kaying-game-converter/generated-manifest.json")))
  )
    return null;
  await assertNoSymlinks(root);
  const before = await inspectKayingForTaptapConverterHandoff(root);
  if (!before.verified) throw new Error(before.message);
  const binding = path.join(root, ".maker-mcp/config.json");
  const existed = await pathExists(binding);
  const projectId = await bind(root, projectName);
  const after = await inspectKayingForTaptapConverterHandoff(root);
  if (!after.verified)
    throw new Error(`Maker binding changed verified Converter output: ${after.message}`);
  return {
    projectRoot: root,
    projectId,
    projectName,
    projectTitle,
    created: !existed,
    restored: false,
    remoteMatch: null,
  };
}

async function assertNoSymlinks(directory: string): Promise<void> {
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error(`Converter project contains a symlink: ${directory}`);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(`Converter project contains a symlink: ${entry.name}`);
    if (entry.isDirectory()) await assertNoSymlinks(path.join(directory, entry.name));
  }
}
