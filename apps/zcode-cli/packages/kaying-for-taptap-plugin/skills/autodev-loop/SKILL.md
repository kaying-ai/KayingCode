---
name: autodev-loop
description: "Operate and inspect the current task's right-side TapTap Game Preview through Browser Use, reproduce gameplay issues, and verify authorized behavior repairs. For automatic visual UI refinement, use visual-repair-loop."
---

# Game development with an interactive preview

Use the current project and the user's intended outcome. This skill is for the single-target right-side
**TapTap Game Preview**, not the source/target **Transcription Compare** panel. Web-game transcription
must use the `threejs-to-taptapmaker` workflow and its comparison pair instead. Read the Browser Use `control-browser`
skill before browser work. The right-side TapTap Game Preview is exposed as a user IAB tab whose id begins
with `taptap-preview:`; bind it using the target protocol in
[interaction](references/interaction.md). Never use a desktop/window screenshot or create a new tab
as a substitute for the preview.

Each successful submission automatically opens or refreshes that dedicated panel. Prefer it over
local simulator preview because its guest viewport supports screenshot verification. Local simulator
preview is a fallback only after the right-side preview is unavailable or has clearly failed and
remote diagnostics are insufficient, or the user explicitly requests local execution. Record the
concrete fallback reason; do not switch merely because the platform page is loading or one capture fails.

Start with a viewport screenshot when appearance matters, or a DOM snapshot when outer Maker state
and diagnostics are more useful. A game probe is not required to explore or verify observable
gameplay. For an explicitly requested visual change and automatic UI refinement, use the dedicated
`visual-repair-loop` Skill instead of inventing an unbounded loop here.

## Work from evidence

Choose the sequence that fits the task:

1. Observe and operate the game to reproduce the issue. Keep a comparable baseline when practical,
   and describe the expected behavior.
2. Read and change the relevant code, preserving the user's gameplay, direction and unrelated edits.
   Use `gameplay-engineer` guidance for implementation.
3. For an authorized publication, use `kaying-for-taptap_publish`; `game-publisher` explains its
   validation, commit, push and remote build semantics.
4. On success, wait for the right-side preview to consume the new publication receipt, then reload
   or re-observe that same claimed preview tab even when the URL is unchanged.
5. Return to the state being checked and compare the relevant behavior and appearance. Fix a concrete
   regression or gather more evidence when useful, then report the result and remaining uncertainty.

Exploration and verification need not produce edits. Do not publish unchanged code merely to obtain
a refresh. Failed/deferred publication and historical fallback pages cannot verify a new build.

## Interaction

Use Browser Use Playwright locators for snapshot-proven DOM controls and its coordinate/keyboard
escape hatch for canvas gameplay when needed. Prefer a fresh viewport screenshot before unfamiliar
coordinate input. A completed click, drag, swipe or key dispatch is not proof that the game reacted;
determine the effect from a subsequent observation. No DOM node is expected for every canvas game
object.

If the preview is sideways or squeezed, check its display orientation before judging appearance or
interacting. Read [orientation switching](references/interaction.md#orientation-switching) for the
snapshot-proven single-click procedure. Preserve the user's manual selection.

## Judgment and scope

Infer only what the evidence supports. An observed transition to a level or score change can verify
that behavior without a probe. Explain the checked conditions; do not extend one local observation
to all gameplay. Read [verification](references/verification.md) when comparing states or diagnosing
a regression.

One regression, animation difference, missing diagnostic source or console error does not
automatically end the task. Investigate or adjust the approach within the user's scope and keep the
interaction sequence bounded. Do not try to reset a `visual-repair-loop` budget through new browser
bindings.

A user-authorized repair/publication task includes its necessary preview input, publication, refresh
and image checks without repeated approval each iteration. A check-only request does not authorize
publishing. Use the existing authorization entry point for login; request user involvement for
missing credentials or unapproved destructive actions. Respect manual intervention and cancellation.

Finish when the goal is met, further work is unlikely to help, necessary user input is unavailable,
or an applicable bounded visual loop is exhausted. Report actual changes, checked behaviors and
unverified items. A saved image path alone is not visual inspection.
