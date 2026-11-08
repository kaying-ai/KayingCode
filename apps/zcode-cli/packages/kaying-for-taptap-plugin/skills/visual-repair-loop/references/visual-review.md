# Visual review rubric

Judge only the requested scene/state and what the screenshot actually shows. Use the user's stated
intent as the primary reference; existing project style is the fallback when the request is silent.

## Required checks

- **Presence and state:** requested UI, HUD, scene objects and effects are visible in the intended
  state; loading, login and error shells are not game evidence.
- **Geometry:** no unintended clipping, overflow, overlap or off-screen content; important elements
  have coherent alignment, spacing, scale and z-order.
- **Readability:** text is legible at the captured viewport, labels are not truncated, and foreground
  contrast is sufficient against the current background.
- **Composition:** visual hierarchy directs attention correctly and the result remains consistent
  with the project's existing style unless the user requested a redesign.
- **Viewport and orientation:** the game is upright and the layout fits the target portrait or
  landscape viewport. Do not repair game code solely because the Maker shell is rotated or squeezed.
- **Regression scope:** adjacent controls and gameplay information visible in the same state remain
  usable; do not extrapolate to states that were not observed.

## Decision discipline

Return **pass** only with positive evidence for every applicable acceptance point. A small difference
that the user did not constrain is not automatically a defect. For animation, random content and
gameplay state, compare observable conditions rather than demanding identical pixels.

Return **actionable defect** with a concise observation and a likely code owner, for example:
"score label is clipped at the right edge at this portrait viewport; adjust the HUD container width
or anchor." Do not invent invisible implementation causes from pixels alone; inspect code before
editing.

Return **insufficient evidence** when the requested state is absent, the page is still loading,
authentication is required, the image is stale or from an untrusted tab, the orientation is
uncertain, or the current provider cannot inspect images. State the missing evidence rather than
turning platform/loading symptoms into speculative visual fixes.
