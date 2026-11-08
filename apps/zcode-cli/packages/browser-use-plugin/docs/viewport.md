# Browser Capability: viewport

Use an explicit viewport only for responsive or device-size testing. Otherwise keep the normal IAB viewport.

```js
await tab.setViewportSize({ width: 1280, height: 720 });
nodeRepl.write(JSON.stringify(tab.viewportSize()));
```

`setViewportSize()` automatically opens the IAB responsive canvas. Its width and height are CSS pixels,
and responsive mode uses DPR 1 so a viewport screenshot has matching PNG pixel dimensions. Exiting
responsive mode in the UI clears the override and restores the host's natural DPR.

Use `await tab.resetViewportSize()` to restore the same tab to the panel's natural size without
reloading it. `tab.viewportSize()` then returns `null`; inspect `browser.tabs.list()` for the actual
rendered dimensions. For editing workbenches, reset before observing the page.
Restore any temporary screenshot size in `finally`:

```js
try {
  await tab.setViewportSize({ width: 720, height: 1280 });
  // Capture the requested fixed-size screenshot.
} finally {
  await tab.resetViewportSize();
}
```
