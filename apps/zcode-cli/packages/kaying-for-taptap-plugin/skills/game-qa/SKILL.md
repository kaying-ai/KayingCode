---
name: game-qa
description: "Verify TapTap Maker game changes and report concrete defects and evidence."
---

# game-qa

Use checks proportional to the change: project.validate, relevant tests and actual preview results.
Distinguish verified results from checks that did not run. Fix concrete entry, syntax or build
errors. Do not require visual provenance, material bindings, scene scores or local execution before
a requested publication. Prefer the right-side TapTap Game Preview for gameplay and viewport screenshots.
Local simulator preview is a fallback only after that panel is unavailable or has clearly failed and
remote diagnostics are insufficient, or the user explicitly requests local execution. Record the
concrete fallback reason, use the official runtime, and report logs and stop instructions.

For an explicitly requested visible change, use
[visual-repair-loop](../visual-repair-loop/SKILL.md). It binds only the current task's right-side
`taptap-preview:*` guest through Browser Use, captures its viewport, applies a visual rubric, and
limits automatic follow-up repair. For behavior interaction or a broader reproduction loop, read
[autodev-loop](../autodev-loop/SKILL.md).

A check-only task may finish without edits or publication. Actual input and images can verify
specific observable behavior without Lua probes. Explain the tested conditions and uncertainty.

Keep the preview associated with the current local project. A completed page load is not proof of
the running remote version. Failed/deferred publication or historical fallback URLs cannot validate
a new build. If Browser Use, the right-side preview or a required vision model is unavailable,
report that limitation; saving an image alone does not mean it was inspected.
