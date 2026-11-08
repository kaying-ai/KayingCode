import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../async-files";

export type MakerAssetCategory = "image" | "video" | "audio" | "model";

export interface MakerCapability {
  id: string;
  tool: string;
  name: string;
  category: MakerAssetCategory;
  kind: "generate" | "edit" | "query";
  async: boolean;
  inputs: string[];
  params: Record<string, unknown>;
  requiresRig: boolean;
  notes: string;
  source: "default" | "project-registry";
}

export const DEFAULT_MAKER_CAPABILITIES: MakerCapability[] = [
  {
    id: "generate_image",
    tool: "generate_image",
    name: "生成单张图像",
    category: "image",
    kind: "generate",
    async: false,
    inputs: ["local_path", "remote_url", "data_url"],
    params: {},
    requiresRig: false,
    notes: "单张贴图 / sprite / UI 图。可直接给提示词，或附带参考图。",
    source: "default",
  },
  {
    id: "batch_generate_images",
    tool: "batch_generate_images",
    name: "批量生成图像",
    category: "image",
    kind: "generate",
    async: false,
    inputs: ["local_path", "remote_url", "data_url"],
    params: { count: { min: 1, max: 8, default: 4 } },
    requiresRig: false,
    notes: "一次性产出多张变体，适合图集、皮肤、道具套装。",
    source: "default",
  },
  {
    id: "edit_image",
    tool: "edit_image",
    name: "编辑现有图像",
    category: "image",
    kind: "edit",
    async: false,
    inputs: ["local_path"],
    params: {},
    requiresRig: false,
    notes: "修改 assets/image 下已有文件；base 引用必填（本地路径）。",
    source: "default",
  },
  {
    id: "create_video_task",
    tool: "create_video_task",
    name: "创建视频任务",
    category: "video",
    kind: "generate",
    async: true,
    inputs: ["local_path", "remote_url", "data_url"],
    params: {},
    requiresRig: false,
    notes: "异步任务：提交后用 query_video_task 轮询状态取回成片。",
    source: "default",
  },
  {
    id: "query_video_task",
    tool: "query_video_task",
    name: "查询视频任务",
    category: "video",
    kind: "query",
    async: false,
    inputs: [],
    params: {},
    requiresRig: false,
    notes: "轮询 create_video_task 的任务状态，拿到成片 URL / 路径。",
    source: "default",
  },
  {
    id: "text_to_music",
    tool: "text_to_music",
    name: "文本生成音乐",
    category: "audio",
    kind: "generate",
    async: false,
    inputs: [],
    params: { duration: { default: 30 } },
    requiresRig: false,
    notes: "BGM / 音效；输出落入 assets/audio。",
    source: "default",
  },
  {
    id: "create_3d_model_task",
    tool: "create_3d_model_task",
    name: "创建 3D 模型任务",
    category: "model",
    kind: "generate",
    async: true,
    inputs: ["local_path", "remote_url", "data_url"],
    params: { rig: { default: false } },
    requiresRig: true,
    notes:
      "异步任务：提交后用 query_3d_model_task 轮询。结果含 GLB/FBX、MDL zip、提取资源与预览图。",
    source: "default",
  },
  {
    id: "query_3d_model_task",
    tool: "query_3d_model_task",
    name: "查询 3D 模型任务",
    category: "model",
    kind: "query",
    async: false,
    inputs: [],
    params: {},
    requiresRig: false,
    notes: "轮询 create_3d_model_task 的任务状态，取回模型与附产物。",
    source: "default",
  },
];

export async function loadMakerCapabilities(projectRoot?: string): Promise<MakerCapability[]> {
  if (!projectRoot) return DEFAULT_MAKER_CAPABILITIES;
  const registryPath = path.join(projectRoot, "scripts", "Workbench", "Maker", "Registry.lua");
  if (!(await pathExists(registryPath))) return DEFAULT_MAKER_CAPABILITIES;
  const text = await readFile(registryPath, "utf8");
  const parsed = parseLuaRegistry(text);
  return parsed.length > 0 ? parsed : DEFAULT_MAKER_CAPABILITIES;
}

export async function findMakerCapability(
  id: string,
  projectRoot?: string,
): Promise<MakerCapability | null> {
  return (
    (await loadMakerCapabilities(projectRoot)).find((capability) => capability.id === id) ?? null
  );
}

export function recommendAssetPath(capability: MakerCapability, target?: string): string {
  const defaultName = DEFAULT_NAMES[capability.id] ?? "asset";
  const filename = ensureExtension(
    target && target.length > 0 ? target : defaultName,
    capability.category,
  );
  return path.posix.join(ASSET_DIRS[capability.category], filename);
}

function parseLuaRegistry(text: string): MakerCapability[] {
  const blocks = [...text.matchAll(/\{([\s\S]*?)\},/g)].map((match) => match[1]);
  const capabilities: MakerCapability[] = [];
  for (const block of blocks) {
    const id = readLuaString(block, "id");
    const tool = readLuaString(block, "tool");
    const category = readLuaString(block, "category") as MakerAssetCategory | null;
    if (!id || !tool || !isAssetCategory(category)) continue;
    capabilities.push({
      id,
      tool,
      name: readLuaString(block, "name") ?? id,
      category,
      kind: normalizeKind(readLuaString(block, "kind")),
      async: readLuaBoolean(block, "async") ?? false,
      inputs: readLuaArray(block, "inputs"),
      params: {},
      requiresRig: readLuaBoolean(block, "requiresRig") ?? false,
      notes: readLuaString(block, "notes") ?? "",
      source: "project-registry",
    });
  }
  return capabilities;
}

function readLuaString(block: string, key: string): string | null {
  const match = block.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`));
  return match?.[1] ?? null;
}

function readLuaBoolean(block: string, key: string): boolean | null {
  const match = block.match(new RegExp(`${key}\\s*=\\s*(true|false)`));
  if (!match) return null;
  return match[1] === "true";
}

function readLuaArray(block: string, key: string): string[] {
  const match = block.match(new RegExp(`${key}\\s*=\\s*\\{([^}]*)\\}`));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function normalizeKind(value: string | null): MakerCapability["kind"] {
  if (value === "edit" || value === "query") return value;
  return "generate";
}

function isAssetCategory(value: unknown): value is MakerAssetCategory {
  return value === "image" || value === "video" || value === "audio" || value === "model";
}

function ensureExtension(name: string, category: MakerAssetCategory): string {
  if (/\.[A-Za-z0-9]+$/.test(name)) return name;
  return `${name}.${DEFAULT_EXTENSIONS[category]}`;
}

const ASSET_DIRS: Record<MakerAssetCategory, string> = {
  image: "assets/image",
  video: "assets/video",
  audio: "assets/audio",
  model: "assets/model",
};

const DEFAULT_EXTENSIONS: Record<MakerAssetCategory, string> = {
  image: "png",
  video: "mp4",
  audio: "mp3",
  model: "glb",
};

const DEFAULT_NAMES: Record<string, string> = {
  generate_image: "asset",
  batch_generate_images: "asset",
  edit_image: "asset_edited",
  create_video_task: "clip",
  text_to_music: "bgm",
  create_3d_model_task: "model",
};
