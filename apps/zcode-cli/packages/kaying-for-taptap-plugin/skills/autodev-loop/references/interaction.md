# Operating the current game

Read the Browser Use `control-browser` skill first. Use its `iab` backend, bootstrap and complete
model-visible tab-selection protocol; do not copy a browser bootstrap path from this TapTap plugin.

## Select the right-side preview

1. In a dedicated browser call, return the complete `browser.tabs.list()` result. Match only a
   controlled `tabId` beginning with `taptap-preview:` and a trusted TapTap preview URL.
2. If no controlled candidate exists, in a separate call return the complete
   `browser.user.openTabs()` result. Match only an `id` beginning with `taptap-preview:`. There must
   be exactly one candidate in the current task scope and its URL must be a playable HTTPS TapTap
   route. Do not choose by array position.
3. In the next call, claim that exact entry with `browser.user.claimTab(info)`. Re-list controlled
   tabs in a later call before the first action, then retrieve the revalidated id with
   `browser.tabs.get(id)`.
4. If the candidate is absent, ambiguous, untrusted, or belongs to another Maker app, stop instead
   of opening or navigating a substitute tab.

Default `tab.screenshot()` captures only the selected preview guest viewport. Emit it in the same
call with `nodeRepl.emitImage(await tab.screenshot())`; do not use `fullPage`, a window screenshot,
or Computer Use. Use a DOM snapshot for the outer Maker page when semantics are enough.

## Input and observation

- Prefer Playwright locators built from the latest DOM snapshot for outer Maker buttons and inputs.
  Confirm uniqueness before action. Use `tab.cua` or `tab.dom_cua` only as the escape hatch described
  by Browser Use when canvas content has no semantic DOM target.
- Base canvas coordinates on a fresh screenshot of the same revalidated tab. Do not add desktop,
  side-pane or iframe offsets to guest viewport coordinates.
- Swipe-driven games need a real gesture. Use a long enough visible path and moderate duration;
  judge the direction from the current screenshot when the shell scales or rotates the canvas.
- Use at most one state-changing action per observation cycle. A completed dispatch is not proof
  that a button worked; capture the cheapest subsequent observation that can confirm its effect.
- When an action result is uncertain, observe before deciding whether to repeat it. Never blindly
  repeat a click or gesture.
- When supported, finalize the claimed preview as `deliverable` so control returns to the user.
  Otherwise leave it open for normal session cleanup. Do not close the right-side panel.

## Orientation switching

Read `.project/project.json` → `taptap_publish.screen_orientation` (`portrait` or `landscape`) for the
declared direction. A phone-shaped viewport or sideways image alone does not establish the intended
orientation. Missing configuration stays unknown; do not change publishing configuration merely to
rotate the preview.

The Maker toolbar's Ratio control uses a two-overlapping-rectangles icon and historically matches
`button:has(svg.lucide-ratio)` in the outer Maker document. Before acting, take a current DOM snapshot
and screenshot. If the control is represented by a unique accessible button, use that snapshot fact
to construct the locator. If only the known CSS identity is available, verify its locator count is
exactly one and that the button is visible and enabled before the single click. Then take a fresh
viewport screenshot and confirm the game is upright and usable.

Skip the click when the preview is already correct or the user deliberately selected another
orientation. If the control is absent, ambiguous or disabled, do not guess another toolbar button or
toggle repeatedly; report the limitation.
