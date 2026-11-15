import { describe, expect, it } from "vitest";
import {
  INSTRUCTIONS_PREAMBLE,
  INSTRUCTION_TYPE_PROJECT,
  createInstructionFile,
  instructionFileRecord,
  parseInstructionAnnouncement,
  parseLegacyInstructionFiles,
  renderInstructionAnnouncement,
  renderInstructionDelta,
  renderInstructionFile,
} from "../src/context/sections/instruction-files.js";

const project = createInstructionFile(
  "/repo/AGENTS.md",
  INSTRUCTION_TYPE_PROJECT,
  "  Follow the repo rules.  ",
);

describe("instruction files", () => {
  it("trims the body and hashes its content", () => {
    expect(project).toMatchObject({
      path: "/repo/AGENTS.md",
      type: INSTRUCTION_TYPE_PROJECT,
      body: "Follow the repo rules.",
    });
    expect(project.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(createInstructionFile("/repo/AGENTS.md", INSTRUCTION_TYPE_PROJECT, "Follow the repo rules.").hash)
      .toBe(project.hash);
    expect(createInstructionFile("/repo/AGENTS.md", INSTRUCTION_TYPE_PROJECT, "Changed.").hash)
      .not.toBe(project.hash);
  });

  it("renders a file block and a full announcement", () => {
    expect(renderInstructionFile(project)).toBe(
      "Contents of /repo/AGENTS.md (project instructions, checked into the codebase):\n\nFollow the repo rules.",
    );
    expect(renderInstructionAnnouncement([project])).toBe(
      `${INSTRUCTIONS_PREAMBLE}\n\n${renderInstructionFile(project)}`,
    );
  });

  it("renders a delta with the re-read reason and removed paths", () => {
    const delta = renderInstructionDelta([project], ["/repo/OLD.md"], "compaction");
    expect(delta).toContain("re-read after the conversation was compacted");
    expect(delta).toContain(renderInstructionFile(project));
    expect(delta).toContain("Instructions no longer present: /repo/OLD.md");

    const removalOnly = renderInstructionDelta([], ["/repo/OLD.md"], "session_start");
    expect(removalOnly).toContain("re-read when this session started.");
    expect(removalOnly).toContain("Instructions no longer present: /repo/OLD.md");
  });

  it("parses full and incremental announcements, rejecting malformed data", () => {
    expect(parseInstructionAnnouncement({ files: [instructionFileRecord(project)] })).toEqual({
      files: [instructionFileRecord(project)],
    });
    expect(
      parseInstructionAnnouncement({
        files: [instructionFileRecord(project)],
        removed: ["/repo/OLD.md"],
        reason: "compaction",
      }),
    ).toEqual({
      files: [instructionFileRecord(project)],
      removed: ["/repo/OLD.md"],
      reason: "compaction",
    });
    expect(parseInstructionAnnouncement({ files: [] })).toEqual({ files: [] });
    expect(parseInstructionAnnouncement(undefined)).toBeUndefined();
    expect(parseInstructionAnnouncement({ files: [{ path: 1 }] })).toBeUndefined();
    expect(
      parseInstructionAnnouncement({ files: [], reason: "unknown" }),
    ).toBeUndefined();
  });

  it("parses legacy announcements by heading line", () => {
    const content = [
      INSTRUCTIONS_PREAMBLE,
      "",
      "Contents of /repo/AGENTS.md (project instructions, checked into the codebase):",
      "",
      "Follow the repo rules.",
      "",
      "Contents of /home/dev/.kayingcode/AGENTS.md (user's private global instructions for all projects):",
      "",
      "Be concise.",
    ].join("\n");
    expect(parseLegacyInstructionFiles(content)).toEqual([
      instructionFileRecord(project),
      instructionFileRecord(
        createInstructionFile(
          "/home/dev/.kayingcode/AGENTS.md",
          "user's private global instructions for all projects",
          "Be concise.",
        ),
      ),
    ]);
  });
});
