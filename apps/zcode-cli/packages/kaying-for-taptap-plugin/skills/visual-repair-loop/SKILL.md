---
name: visual-repair-loop
description: "Automatically verify and refine visible TapTap Maker changes after explicitly requested UI, HUD, menu, scene, layout, style, animation, or VFX work. Uses the current task's single-target right-side TapTap Game Preview only, judges a viewport screenshot with a vision-capable model, and performs a bounded repair loop. Do not use for nonvisual-only changes or source/target transcription comparison."
---

# TapTap visual repair loop

Use this skill after the user explicitly asks to create or change a visible game result and the
current turn actually changes visual project files. Examples include UI, HUD, menus, scene
composition, layout, typography, colors, animation and VFX. Do not trigger it for logic-only,
data-only, build-only, publication-only, documentation or read-only diagnosis work. Respect an
explicit request not to capture screenshots.

This is a completion check, not a replacement for project validation. Read the Browser Use
`control-browser` skill before browser work and follow its setup and model-visible tab-selection
protocol. Load its screenshot lookup guidance because visual judgment is required.

## Establish the contract

Before editing, turn the user's request into a short list of observable acceptance points. Keep
them tied to the requested result: which scene/state, which elements must appear, intended
hierarchy/alignment, readability, colors, orientation and target viewport. Take a pre-change image
only when a comparison is materially useful.

The user's explicit visual-change request authorizes the development-preview publication and
refresh needed to inspect that change. It does not authorize an unrelated release, destructive
operation or scope expansion. Use `kaying-for-taptap_publish` after relevant checks. A new successful
publication receipt is required before treating the preview as evidence of the new code; a failed or
deferred publication and an older preview cannot verify it.

## Bind only the right-side TapTap Game Preview

This skill uses the single target-only **TapTap Game Preview**. It does not use the source/target
**Transcription Compare** panel; web-game transcription and parity repair are owned by the
`threejs-to-taptapmaker` skill.

Use KayingCode's `iab` Browser Use backend. Never use a desktop/window screenshot, Computer Use,
or a newly created browser tab for this workflow.

At the start of each logical browser operation batch, first return the complete controlled tab list
to the model as required by `control-browser`. A valid controlled candidate has a `tabId` beginning
with `taptap-preview:`. If it is not already controlled, in a separate observation call return the
complete `browser.user.openTabs()` list and find an entry whose `id` begins with
`taptap-preview:`. The browser registry already scopes this list to the current window, workspace
and task.

There must be exactly one candidate and its URL must be a trusted playable TapTap route:

- `https://maker.taptap.cn/app/<id>` or `/app/<id>/preview`;
- `https://play.taptap.cn/game/<id>`;
- an HTTPS `*.games.tapapps.cn` page; or
- an HTTPS `taptap.cn` / `www.taptap.cn` `/app/<id>/preview` page.

Reject credentials in the URL. When the candidate is absent, ambiguous, untrusted, still showing
login/loading/platform failure, or belongs to a different app than the new publication, stop the
visual branch and report the blocker. Do not guess, choose by position, navigate an unrelated tab,
or create a substitute tab. Claim the matching user tab with `browser.user.claimTab(info)`, then
re-list controlled tabs in the next call and revalidate its id and URL before capture.

Capture with the default viewport call only:

```js
nodeRepl.emitImage(await tab.screenshot());
```

Do not pass `fullPage: true` and do not use a clip from the KayingCode window. `tab.screenshot()`
captures the selected preview guest viewport, so the chat, sidebar and other desktop content stay
out of the image. The emitted image must reach the model in the same call; a byte array or saved
path is not visual evidence.

When the requested state is behind a game-canvas control that is absent from the DOM snapshot,
replace that review capture with an observed viewport screenshot:

```js
const shot = await tab.screenshotWithObservation();
nodeRepl.emitImage(shot.image);
```

Choose the button center from the original emitted PNG. For a visible button or menu control,
perform exactly one bound mouse action and keep the returned receipt:

```js
const receipt = await tab.cua.clickScreenshot({
  observationId: shot.observation.observationId,
  x,
  y,
  coordinateSpace: "image",
});
```

Use `tapScreenshot` instead only when the game is known to require touch input. `clickScreenshot`
dispatches one mouse moved/pressed/released sequence; `tapScreenshot` dispatches one
`touchStart`/`touchEnd` pair. Both operate inside the preview guest and never click the KayingCode
window or desktop. Pass coordinates from the original PNG without converting them to viewport or
desktop coordinates. The receipt must report `scaleApplied: false` and matching `cssPoint` /
`cdpPoint`. For a game hosted in a cross-process iframe, also require `targetType: "oopif"` and
`frameDepth >= 1`; Browser Guest confirms the auto-attached frame while the root compositor keeps
the original viewport point. The receipt proves dispatch only, not that the game changed state.

The observation is single-use and becomes stale after another input, navigation, guest or viewport
change, or a newer observed screenshot. On `observation_stale`, take a fresh observed screenshot
instead of guessing or replaying the point. If a mouse action produces no visible state change and a
touch-only target is plausible, take a fresh observed screenshot before one `tapScreenshot` attempt.
Always capture a new viewport screenshot after the input and require visible evidence that the
intended secondary state appeared. Both the aiming image and the verification image count against
the review screenshot budget.

## Judge and repair

Default to at most three review screenshots and two repair rounds for one user-authorized visual
change task. A baseline comparison image, when needed, counts toward the screenshot budget. Never
renew the budget by reclaiming the tab. A later user message that explicitly asks to continue visual
optimization starts a new bounded segment.

Re-claiming the same product-shell tab after the host released control at turn end is allowed and is
idempotent for the same session/workspace scope; it re-establishes the binding but does **not** reset
the screenshot or repair budget.

Every `tab.screenshot()` call consumes one review screenshot, including a timeout or backend error.
On capture failure, choose **insufficient evidence** and stop the visual branch. Do not retry the
same publication, tab and viewport, and do not describe a repeated timeout as a generic platform
failure. A later capture is allowed only after the host screenshot chain was repaired, the preview
state verifiably changed, or the user explicitly started a new bounded visual-review segment.

For every review image, apply [the visual review rubric](references/visual-review.md) and choose
exactly one outcome:

- **pass** — the image provides positive evidence for every applicable acceptance point and has no
  material visible regression;
- **actionable defect** — a concrete visible problem is plausibly repairable in the requested code
  scope;
- **insufficient evidence** — the target state is not visible or login, loading, orientation,
  runtime/platform failure, unavailable vision input, or ambiguous provenance prevents judgment.

For an actionable defect with budget remaining, identify the smallest evidence-based code change,
edit it, rerun relevant checks, publish again, wait for a new receipt/preview refresh, and take a new
viewport screenshot. Never claim a new result from an old image. Stop on pass, exhausted budget,
insufficient evidence, required user input, or when another repair is unlikely to help.

Do not treat a completed publish, page load, screenshot file, dispatch receipt or absence of sampled
console errors as a visual pass. When the model does not accept image input or Browser Use/preview
is unavailable, continue nonvisual validation and explicitly report that visual verification did
not run.

Finish by reporting the visual outcome, number of screenshots and repair rounds used, the scene and
viewport state actually observed, and any unverified acceptance point. When the advertised Browser
Use capability supports finalization, mark the claimed preview `deliverable` so control returns to
the user. Otherwise leave it open for normal session cleanup. Never close the user's right-side
preview panel.
