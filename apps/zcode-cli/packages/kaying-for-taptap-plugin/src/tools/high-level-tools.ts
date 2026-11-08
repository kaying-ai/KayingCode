/** Consolidated public project and publication tools. */

import {
  detectProjectTool,
  ensureProjectTool,
  initProjectTool,
  prepareConverterProjectTool,
  submitToTapTapTool,
} from "./agent-tools";
import type { SubmitToTapTapInput } from "./maker-cli";
import type { KayingForTaptapTool } from "./tool-types";

const PROJECT_ROOT = {
  type: "string",
  description: "Absolute path to the TapTap Maker / UrhoX project root.",
};

export const projectTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_project",
  description:
    "Detect, create, ensure, or prepare a converter handoff for one KayingForTaptap project. Use one action instead of manually sequencing project setup tools.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["detect", "create", "ensure", "prepare_converter"] },
      projectRoot: PROJECT_ROOT,
      name: { type: "string", description: "Optional project name for create or ensure." },
      projectName: { type: "string", description: "Converter-generated project name." },
      projectTitle: { type: "string", description: "Optional converter project title." },
      uiTheme: { type: "string", enum: ["brawlforge", "astroon", "pixelforge"] },
      template: { type: "string", enum: ["modular", "minimal", "empty"] },
      existingDirectory: {
        type: "string",
        enum: ["reject", "reset", "subdirectory"],
        description: "How to handle non-standard existing content.",
      },
      confirmReset: {
        type: "boolean",
        description: "Required after explicit user confirmation when resetting a directory.",
      },
      confirm: {
        type: "boolean",
        description: "Required for the converter handoff because it can access TapTap.",
      },
    },
    required: ["action", "projectRoot"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const value = input as { action?: string } & Record<string, unknown>;
    switch (value.action) {
      case "detect":
        return await detectProjectTool.execute(value, context);
      case "create":
        return await initProjectTool.execute(value, context);
      case "ensure":
        return await ensureProjectTool.execute(value, context);
      case "prepare_converter":
        return await prepareConverterProjectTool.execute(value, context);
      default:
        throw new Error("action must be detect, create, ensure, or prepare_converter");
    }
  },
};

export const publishTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_publish",
  description:
    "Publish a local KayingForTaptap project in one transaction: check setup and readiness, authorize when required, commit and push local changes, build remotely, and return the authoritative preview URL. Success automatically opens or refreshes the current task's right-side TapTap Game Preview in KayingCode. For verification, claim its taptap-preview:* guest through Browser Use and capture that viewport; do not open the preview URL in a new browser tab. Local simulator preview is a fallback only after the right-side preview is unavailable or has clearly failed and remote diagnostics are insufficient, or when the user explicitly requests local execution.",
  inputSchema: {
    type: "object",
    properties: {
      projectRoot: PROJECT_ROOT,
      entry: { type: "string", description: "Optional Lua entry relative to scriptsPath." },
      scriptsPath: {
        type: "string",
        description: "Optional scripts path relative to the project.",
      },
      message: { type: "string", description: "Optional publish commit message." },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Optional project-relative files to stage. Defaults to all changes.",
      },
      env: {
        type: "string",
        enum: ["rnd", "production"],
        description:
          "Optional remote Maker environment. Defaults to production (maker.taptap.cn). Do not pass rnd for normal publication — it is an internal R&D endpoint that is unreachable over public TLS.",
      },
      timeoutMs: { type: "number" },
    },
    required: ["projectRoot"],
    additionalProperties: false,
  },
  async execute(input, context) {
    return await submitToTapTapTool.execute(input as SubmitToTapTapInput, context);
  },
};
