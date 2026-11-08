import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDirectory, pathExists } from "../async-files";

export interface MakerBuildScaffoldResult {
  projectRoot: string;
  createdDirectories: string[];
  createdFiles: string[];
  existingFiles: string[];
}

const STANDARD_DIRECTORIES = [
  "assets",
  "assets/image",
  "assets/sprites",
  "assets/video",
  "assets/audio",
  "scripts",
  ".project",
];

const STANDARD_FILES: Array<{ path: string; content: unknown | string }> = [
  {
    path: ".project/settings.json",
    content: {
      $schema: "../schemas/settings.schema.json",
      sources: {
        engine: { tag: "stable" },
        "engine-res": { tag: "stable" },
        "official-res": { tag: "stable" },
      },
      build: {
        generate_fs_path: true,
        output_dir: "../dist",
        asset_dirs: ["../assets", "../scripts"],
        asset_ignores: [],
      },
      "@runtime": {
        multiplayer: { enabled: false },
      },
    },
  },
  {
    path: ".project/resources.json",
    content: {
      $schema: "../schemas/resources.schema.json",
      preload_groups: [],
      groups: {
        default: ["**"],
      },
    },
  },
  { path: "assets/.gitkeep", content: "" },
];

// Maker's remote pre-receive hook rejects project-local `.tmp/*` paths. The
// bundled Maker flow stages with `git add -A`, so every standard project must
// ignore this directory before any agent/tool creates a temporary snapshot.
const REQUIRED_GITIGNORE_ENTRIES = [".tmp/"];

/**
 * Ensure the minimum TapTap Maker build tree exists without overwriting project files.
 *
 * The upstream init flow can clone a new empty app repository. These build files are
 * therefore created by the KayingForTaptap lifecycle layer before the first remote build.
 */
export async function ensureMakerBuildScaffold(
  projectRootInput: string,
  options: { requireProjectConfig?: boolean } = {},
): Promise<MakerBuildScaffoldResult> {
  const projectRoot = path.resolve(projectRootInput);
  if (!(await isDirectory(projectRoot))) {
    throw new Error(`Maker project directory does not exist: ${projectRoot}`);
  }

  const createdDirectories: string[] = [];
  for (const relativePath of STANDARD_DIRECTORIES) {
    const directory = path.join(projectRoot, relativePath);
    if (await pathExists(directory)) continue;
    await mkdir(directory, { recursive: true });
    createdDirectories.push(relativePath);
  }

  const createdFiles: string[] = [];
  const existingFiles: string[] = [];
  for (const file of STANDARD_FILES) {
    const filePath = path.join(projectRoot, file.path);
    if (await pathExists(filePath)) {
      if (file.path.endsWith(".json")) await validateJsonObject(filePath, file.path);
      existingFiles.push(file.path);
      continue;
    }
    const content =
      typeof file.content === "string"
        ? file.content
        : `${JSON.stringify(file.content, null, 2)}\n`;
    await writeFile(filePath, content, "utf8");
    createdFiles.push(file.path);
  }
  await ensureGitignoreEntries(projectRoot);

  const projectConfigPath = path.join(projectRoot, ".project", "project.json");
  if (await pathExists(projectConfigPath)) {
    await validateJsonObject(projectConfigPath, ".project/project.json");
    existingFiles.push(".project/project.json");
  } else if (options.requireProjectConfig) {
    throw new Error(
      [
        "TapTap submission blocked: .project/project.json is missing.",
        "classification: project_config_missing",
        "Create the project metadata before publishing.",
      ].join("\n"),
    );
  }

  return {
    projectRoot,
    createdDirectories,
    createdFiles,
    existingFiles: [...new Set(existingFiles)].sort(),
  };
}

async function ensureGitignoreEntries(projectRoot: string): Promise<void> {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const exists = await pathExists(gitignorePath);
  const existing = exists ? await readFile(gitignorePath, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  let changed = false;
  for (const entry of REQUIRED_GITIGNORE_ENTRIES) {
    if (lines.some((line) => line.trim() === entry)) continue;
    while (lines.length > 0 && lines.at(-1) === "") lines.pop();
    lines.push(entry);
    changed = true;
  }
  if (changed || !exists) {
    await writeFile(gitignorePath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  }
}

async function validateJsonObject(filePath: string, relativePath: string): Promise<void> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("root value must be an object");
    }
  } catch (error) {
    throw new Error(
      `Invalid Maker build configuration: ${relativePath}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
