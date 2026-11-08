/** Shared KayingForTaptap project inspection contracts. */

export interface KayingForTaptapEntryResolution {
  configuredEntry: string | null;
  projectRelativePath: string | null;
  scriptsRelativePath: string | null;
  absolutePath: string | null;
  valid: boolean;
  exists: boolean;
  error: string | null;
}

export interface KayingForTaptapProjectFile {
  path: string;
  kind: "config" | "script" | "image" | "video" | "audio" | "model" | "asset";
  size: number;
}

export interface KayingForTaptapProjectDetection {
  projectRoot: string;
  isKayingForTaptapProject: boolean;
  projectConfig: Record<string, unknown> | null;
  makerConfig: Record<string, unknown> | null;
  entry: string | null;
  entryPath: string | null;
  entryResolution: KayingForTaptapEntryResolution;
  projectId: string | null;
  /** The authoritative TapTap Maker app id, if this checkout is remote-bound. */
  makerProjectId: string | null;
  name: string | null;
  version: string | null;
  hasAgentsPolicy: boolean;
  hasWorkbench: boolean;
  hasMakerRegistry: boolean;
  hasMakerMcpConfig: boolean;
  directories: {
    scripts: boolean;
    assets: boolean;
    templates: boolean;
    engineDocs: boolean;
    urhoxLibs: boolean;
  };
  files: KayingForTaptapProjectFile[];
  scriptFiles: string[];
  assetCounts: Record<string, number>;
  warnings: string[];
}

export interface KayingForTaptapProjectScanOptions {
  limit?: number;
}
