---
name: game-publisher
description: "发布或重新推送 TapTap Maker / UrhoX 游戏，生成平台预览链接，解释发布诊断。Use for publishing existing or downloaded platform code, obtaining a playable preview, or resolving a failed KayingForTaptap publication."
---

# Game Publisher

Use `kaying-for-taptap_publish {projectRoot}` for an authorized publication or platform preview.
The tool handles local checks, authorization, commit, push and remote build. A request to publish
already authorizes this transaction; do not ask again merely because it produces a remote result.
If the project root is unclear, use `kaying-for-taptap_project {action:detect, projectRoot}`.
Use `kaying-for-taptap_doctor` when a concrete failure needs diagnosis; it is not a required extra
step before every publish. Do not manually pull, merge or reset the Maker remote to work around a
failed publish; use the tool's reported recovery path.

Maker 0.0.38 may report `cloud_workspace_blocked` when the remote working tree has uncommitted
changes. The bundled publisher owns cloud repair and preserves the local file snapshot when
reconciling remote history. If diagnostics include `cloudRepair`, explain its actual status and the
remaining failure; a successful cloud repair alone is not a successful game build. Do not run
`taptap-maker git sync`, manual pull/rebase, a separate build, or a standalone package upgrade to
bypass the returned failure. Retry through the same publication tool after a concrete fix.

For code downloaded from the platform, preserve the current implementation and assets.
Do not apply a new theme merely to publish.

Every successful submission automatically opens or refreshes KayingCode's right-side **TapTap Game
Preview** using the publication receipt. For gameplay or screenshot verification, prefer that panel:
use Browser Use to claim the current task's `taptap-preview:*` guest and capture its viewport.
Do not open `previewUrl` in a new ordinary browser tab as a substitute. Use `autodev-loop` for
interaction or `visual-repair-loop` for requested visual changes. Transcription retains its comparison pane.
Local simulator preview is a fallback only after the right-side preview is unavailable or has clearly
failed and remote diagnostics are insufficient, or the user explicitly requests local execution.
Record the concrete reason before falling back; a loading page or one failed screenshot is not enough.

Distinguish confirmed defects from review suggestions. Invalid entry/configuration, parser-confirmed
Lua syntax errors and actual platform build errors need targeted fixes. Local architecture findings,
engine-stub-dependent semantic diagnostics and unavailable optional checkers need honest reporting
and proportionate follow-up. Inspect concrete semantic findings when useful, but do not claim they
are verified runtime failures. Never fabricate execution evidence or a preview URL.

After execution, report the actual result first and reproduce `previewUrl` exactly, including query
parameters. Then give concise, actionable recommendations from `warnings` and name checks that
could not run. `ready=true` means no confirmed submission blocker, not full quality certification.
If the remote build fails, show its concrete error and next useful action. Retry after a relevant
fix; avoid identical retries without new evidence. Ask for input only when a required project choice,
credential or permission is actually missing. Do not ask users to choose a theme for a republish.
