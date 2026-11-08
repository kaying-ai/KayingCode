/** TapTap Maker guidance shared by the Pi adapter and desktop host. */
export interface KayingForTaptapWorkflowRule {
  id: string;
  content: string;
}
export const KAYING_FOR_TAPTAP_WORKFLOW_RULES: KayingForTaptapWorkflowRule[] = [
  {
    id: "kaying-for-taptap-maker",
    content: `## TapTap Maker game development
Use the matching public tool:
- kaying-for-taptap_project: detect, create, ensure, or prepare a converter handoff.
- kaying-for-taptap_doctor: read-only Maker environment, project, and publish diagnosis.
- kaying-for-taptap_game_command: search, describe, prepare, and execute native commands.
- kaying-for-taptap_publish: publish and return the authoritative preview URL.

Inspect only what the requested change needs. Preserve existing projects and visual style.
Never reset existing content without explicit user authorization. For mutations, retain the
command prepare/effect-digest/confirmation protocol. Read project AGENTS.md before editing.

Publish when the user requests publication or a platform preview. The publish tool owns setup,
authorization, validation, commit, push and remote build. Do not manually fetch, pull, merge,
rebase, stash or reset Maker remote history. Return previewUrl verbatim, including query parameters.
Fix confirmed syntax/build errors and invalid entry/binding prerequisites. Optional checker
availability and engine-stub diagnostics are advice, not additional publishing prerequisites.
Report the actual result and any checks that could not run. Never invent runtime evidence.

After every successful publish, KayingCode automatically opens or refreshes the current task's
right-side TapTap Game Preview. Prefer that dedicated panel for gameplay and screenshot verification:
claim its taptap-preview:* guest through Browser Use and capture the guest viewport. Do not open
previewUrl in a new ordinary browser tab as a substitute. Transcription keeps its comparison pane.

Local simulator preview is a fallback only: use it after the right-side preview is unavailable or
has clearly failed and remote diagnostics are insufficient, or when the user explicitly requests
local execution. Record the concrete fallback reason, inspect the project/platform and reuse or
obtain the appropriate official TapTap runtime through Maker capabilities or its official instructions.
Report logs, outcome and how to stop the process. Do not install or start local execution merely
because a publish succeeded, a page is loading or one screenshot failed. Quick commands append a
draft; execution starts after the user sends it.
No material catalog, semantic review, custom runtime, scene-editor gate or durable mission
is required for game development. Use ordinary project assets and direct Maker commands.`,
  },
];
