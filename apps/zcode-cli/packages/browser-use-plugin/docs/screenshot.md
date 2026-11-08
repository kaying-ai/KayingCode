# Screenshots

This is lookup-only guidance. Do not use it for ordinary navigation, reading, search, or form interaction when a DOM snapshot answers the question.

Capture a screenshot only when the user explicitly requests one, visual layout/rendering/image content must be judged, or the required target is absent from the DOM snapshot. Do not request a snapshot and screenshot together by default.

`await tab.screenshot(opts?)` returns PNG bytes as `Uint8Array` internally. Those bytes are not a model-visible screenshot and must never be returned as the JS result.

Every screenshot call must pass the bytes to `nodeRepl.emitImage` in the same JS cell so the tool returns a standard image content block:

```js
nodeRepl.emitImage(await tab.screenshot());
```

Never use `await tab.screenshot()` as the final expression.

Supported screenshot options:

- `{ fullPage: true }` captures the whole page.
- `{ clip: { x, y, width, height } }` captures a viewport region.

For a canvas target, capture and emit an observed screenshot in the same cell:

```js
const shot = await tab.screenshotWithObservation();
nodeRepl.emitImage(shot.image);
```

Then use the original PNG coordinates, or normalized `[0,1)` coordinates, exactly once. Use
`clickScreenshot` for buttons and ordinary pointer controls:

```js
const receipt = await tab.cua.clickScreenshot({
  observationId: shot.observation.observationId,
  x: 420,
  y: 718,
  coordinateSpace: "image",
});
```

Use `tapScreenshot` for a known touch-first target. Do not manually convert PNG coordinates to CSS,
window or desktop coordinates. The returned receipt exposes the input point, mapped CSS point,
final CDP point, Desktop scale and whether that scale was applied. When the point is inside a
cross-process iframe, Browser Guest first confirms its auto-attached OOPIF session and then lets the
root compositor dispatch the original viewport point; verify `targetType: "oopif"`, a positive
`frameDepth`, and matching `cssPoint` / `cdpPoint` in the receipt.

The observation becomes stale after navigation, viewport or guest changes, another accepted input, or a newer
observed screenshot. Take a new screenshot after the input to prove the requested state appeared.

If a screenshot times out, do not immediately issue the same screenshot again. The underlying Chromium
capture may still be completing; wait before retrying, or reopen the tab if the explicit in-flight error
does not clear.
