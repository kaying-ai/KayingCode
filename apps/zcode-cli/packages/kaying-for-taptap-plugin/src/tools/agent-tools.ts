import {
  CONVERTER_REMOTE_PROJECT_NAME,
  CONVERTER_REMOTE_PROJECT_TITLE,
  prepareConverterRemoteProject,
} from "../maker/remote-projects";
import {
  ensureKayingForTaptapProject,
  initializeKayingForTaptapProject,
  type KayingForTaptapBuiltinUiTheme,
  type KayingForTaptapProjectTemplate,
} from "./kaying-for-taptap-bootstrap";
import {
  checkPublishReadiness,
  detectKayingForTaptapProject,
  runKayingForTaptapDoctor,
} from "./kaying-for-taptap-project";
import { authorizeTapTap, checkMakerSetup, type SubmitToTapTapInput } from "./maker-cli";
import { runTapTapPublishWorkflow } from "./publish-workflow";
import type { KayingForTaptapTool } from "./tool-types";

export { gameCommandTool } from "./game-command-tool";

const PROJECT_ROOT = {
  type: "string",
  description: "Absolute path to a TapTap Maker / UrhoX project root.",
};

export const checkMakerSetupTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_check_maker_setup",
  description:
    "Check the bundled KayingForTaptap runtime and local development environment without MCP setup.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async execute(_input, context) {
    return await checkMakerSetup(undefined, { signal: context?.signal });
  },
};

export const authorizeTapTapTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_authorize_taptap",
  description:
    "Open the bundled TapTap authorization flow and wait for login. No MCP configuration or client restart is required.",
  inputSchema: {
    type: "object",
    properties: {
      projectRoot: { ...PROJECT_ROOT, description: "Optional project directory used as context." },
      env: {
        type: "string",
        enum: ["rnd", "production"],
        description:
          "Maker remote environment. Defaults to production (maker.taptap.cn). Do not pass rnd for normal game work — it is an unreachable internal R&D endpoint that creates projects with unusable Git remotes.",
      },
    },
    additionalProperties: false,
  },
  async execute(input, context) {
    return await authorizeTapTap({
      ...(input as { projectRoot?: string; env?: "rnd" | "production" }),
      signal: context?.signal,
    });
  },
};

export const initProjectTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_init_project",
  description:
    "Initialize a Maker project, apply the kaying-for-taptap-core modular scaffold, and validate it. Use for new game projects only.",
  inputSchema: {
    type: "object",
    properties: {
      projectRoot: { ...PROJECT_ROOT, description: "Absolute path to the empty target directory." },
      name: { type: "string", description: "Optional TapTap Maker project name." },
      uiTheme: {
        type: "string",
        enum: ["brawlforge", "astroon", "pixelforge"],
        description:
          "Optional TapTap built-in UI fallback. Defaults to BrawlForge; use when requested by the user.",
      },
      template: {
        type: "string",
        enum: ["modular", "minimal", "empty"],
        description: "Project scaffold template. Defaults to modular for Agent-authored games.",
      },
      existingDirectory: {
        type: "string",
        enum: ["reject", "reset", "subdirectory"],
        description:
          "REQUIRED when projectRoot already exists with non-standard content (init fails with a confirmation error until you pass it). subdirectory creates a fresh child project and preserves all existing files; reset clears the directory and requires confirmReset=true.",
      },
      confirmReset: {
        type: "boolean",
        description: "Must be true after explicit user confirmation when existingDirectory=reset.",
      },
    },
    required: ["projectRoot"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const value = input as Parameters<typeof initializeKayingForTaptapProject>[0];
    assertString(value.projectRoot, "projectRoot");
    return await initializeKayingForTaptapProject({ ...value, signal: context?.signal });
  },
};

export const prepareConverterProjectTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_prepare_converter_project",
  description:
    "Prepare a verified Converter project in place: pass projectRoot and filename-derived projectName from converter_run, confirm=true after user authorizes publication. Preserve generated scripts and existing binding; never restore a name-matched remote over verified output. Legacy pre-conversion smoke directories retain remote lookup behavior.",
  inputSchema: {
    type: "object",
    properties: {
      projectRoot: {
        ...PROJECT_ROOT,
        description: "Absolute directory in which to restore or create the project.",
      },
      projectName: { type: "string", description: `Defaults to ${CONVERTER_REMOTE_PROJECT_NAME}.` },
      projectTitle: {
        type: "string",
        description: `Defaults to ${CONVERTER_REMOTE_PROJECT_TITLE}.`,
      },
      confirm: {
        type: "boolean",
        description: "Must be true to access TapTap or create a remote project.",
      },
    },
    required: ["projectRoot", "confirm"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const value = input as {
      projectRoot?: unknown;
      projectName?: unknown;
      projectTitle?: unknown;
      confirm?: unknown;
    };
    assertString(value.projectRoot, "projectRoot");
    if (value.confirm !== true) throw new Error("prepare_converter_project requires confirm=true");
    return await prepareConverterRemoteProject({
      selectedDirectory: value.projectRoot,
      projectName: typeof value.projectName === "string" ? value.projectName : undefined,
      projectTitle: typeof value.projectTitle === "string" ? value.projectTitle : undefined,
      signal: context?.signal,
    });
  },
};

export const ensureProjectTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_ensure_project",
  description:
    "Ensure a target directory is a complete Maker KayingForTaptap project. Empty directories are initialized via Maker CLI.",
  inputSchema: {
    type: "object",
    properties: {
      projectRoot: {
        ...PROJECT_ROOT,
        description: "Absolute path to the target game project directory.",
      },
      name: {
        type: "string",
        description: "Optional project name for a newly initialized project.",
      },
      uiTheme: {
        type: "string",
        enum: ["brawlforge", "astroon", "pixelforge"],
      },
      template: {
        type: "string",
        enum: ["modular", "minimal", "empty"],
        description: "Scaffold template for a newly initialized project. Defaults to modular.",
      },
      existingDirectory: {
        type: "string",
        enum: ["reject", "reset", "subdirectory"],
        description:
          "Strategy for an existing non-standard non-empty directory; required or init fails with a confirmation error. subdirectory preserves existing files.",
      },
      confirmReset: {
        type: "boolean",
        description: "Must be true after explicit user confirmation when existingDirectory=reset.",
      },
    },
    required: ["projectRoot"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const value = input as {
      projectRoot: string;
      name?: string;
      template?: KayingForTaptapProjectTemplate;
      uiTheme?: KayingForTaptapBuiltinUiTheme;
      existingDirectory?: "reject" | "reset" | "subdirectory";
      confirmReset?: boolean;
    };
    assertString(value.projectRoot, "projectRoot");
    return await ensureKayingForTaptapProject({ ...value, signal: context?.signal });
  },
};

export const checkPublishReadinessTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_check_publish_readiness",
  description:
    "Check whether a KayingForTaptap project is ready for TapTap publication using local project diagnostics.",
  inputSchema: {
    type: "object",
    properties: { projectRoot: PROJECT_ROOT },
    required: ["projectRoot"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const value = input as { projectRoot: string };
    assertString(value.projectRoot, "projectRoot");
    return await checkPublishReadiness(value.projectRoot, { signal: context?.signal });
  },
};

export const submitToTapTapTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_submit_to_taptap",
  description:
    "Run the complete TapTap publication transaction: Maker setup, project.validate, publish readiness, local commit, authoritative push, and remote build. A publish-only request needs no separate prerequisite tools. The local KayingForTaptap project is authoritative: do not manually fetch, pull, merge, or rebase Maker remote commits; the bundled Maker flow reconciles remote history internally with an ours merge only when the server requires a fast-forward push. The returned previewUrl is authoritative: reproduce it verbatim in the final response, including all query parameters.",
  inputSchema: {
    type: "object",
    properties: {
      projectRoot: PROJECT_ROOT,
      entry: {
        type: "string",
        description: "Optional Lua entry file relative to scriptsPath, e.g. main.lua.",
      },
      scriptsPath: {
        type: "string",
        description: "Optional scripts directory relative to the project root.",
      },
      message: {
        type: "string",
        description: "Optional commit message used by Maker when local changes are submitted.",
      },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Optional project-relative files to stage. Defaults to all local changes.",
      },
      env: {
        type: "string",
        enum: ["rnd", "production"],
        description:
          "Optional remote Maker environment. Defaults to production (maker.taptap.cn). Do not pass rnd for normal publication — it is an internal R&D endpoint that is unreachable over public TLS.",
      },
      timeoutMs: {
        type: "number",
        description: "Optional total timeout in milliseconds. Defaults to 15 minutes.",
      },
    },
    required: ["projectRoot"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const value = input as SubmitToTapTapInput;
    assertString(value.projectRoot, "projectRoot");
    return await runTapTapPublishWorkflow({ ...value, signal: context?.signal });
  },
};

export const detectProjectTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_detect_project",
  description: "Detect a TapTap Maker / UrhoX KayingForTaptap project and summarize its structure.",
  inputSchema: {
    type: "object",
    properties: { projectRoot: PROJECT_ROOT },
    required: ["projectRoot"],
    additionalProperties: false,
  },
  async execute(input) {
    const value = input as { projectRoot: string };
    assertString(value.projectRoot, "projectRoot");
    return await detectKayingForTaptapProject(value.projectRoot);
  },
};

export const doctorTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_doctor",
  description:
    "Run one read-only diagnosis for the Maker environment, project, publication readiness, or all three. It never installs, initializes, or publishes anything.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["all", "environment", "project", "publish"],
        description: "Diagnosis scope. Defaults to all.",
      },
      projectRoot: PROJECT_ROOT,
    },
    required: ["projectRoot"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const value = input as {
      action?: "all" | "environment" | "project" | "publish";
      projectRoot: string;
    };
    assertString(value.projectRoot, "projectRoot");
    const action = value.action ?? "all";
    if (action === "environment")
      return await checkMakerSetup(undefined, { signal: context?.signal });
    if (action === "project") return await runKayingForTaptapDoctor(value.projectRoot);
    if (action === "publish") {
      return await checkPublishReadiness(value.projectRoot, { signal: context?.signal });
    }
    const [environment, project, publish] = await Promise.all([
      checkMakerSetup(undefined, { signal: context?.signal }),
      runKayingForTaptapDoctor(value.projectRoot),
      checkPublishReadiness(value.projectRoot, { signal: context?.signal }),
    ]);
    return { ok: true, environment, project, publish };
  },
};

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}
