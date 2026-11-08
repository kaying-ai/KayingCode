---
name: computer-use
description: Use for controlling native desktop applications on the user's local computer through the built-in Computer Use tools. Do not use it for web pages that Browser Use can operate. Main agent only.
---

# Computer Use

Use the built-in `mcp__computer-use__*` tools for native desktop applications. The runtime is already
part of KayingCode; never ask the user to install a CLI, npm package, Python package, or MCP config.

## Workflow

1. Call `list_apps` when the target application identity is not already known.
2. Call `get_app_state` before the first action and after any action that substantially changes the UI.
3. Prefer an `element_index` from the latest state over coordinates.
4. Perform one state-changing action, then observe the result before choosing the next action.
5. If a tool reports that the app or element is unavailable, refresh with `list_apps` / `get_app_state`.
6. For Blender, games, canvases, and 3D viewports, click a stable point inside the intended work area before
   sending shortcuts. These applications route keyboard commands by the area under the pointer as well as the
   foreground window. Use xdotool-style names such as `Shift_L+a`, `Control_L+z`, and `Numpad_0`.
7. On Windows, point feedback is intentionally transient and is hidden before the refreshed screenshot is
   returned. Use the action result and visible application state—not a persistent target marker—to verify success.

Element indexes belong to the current MCP process and its latest snapshot. Never reuse an index from an
older session or from a snapshot taken before a large UI change.

## Safety

- Treat the desktop as the user's real session. Do not inspect unrelated private content.
- Ask before sending, deleting, purchasing, approving, uploading, or making another externally visible change.
- Prefer Browser Use for work contained in a web page.
- Do not use a shell or a separately installed Computer Use runtime as a fallback.
- On macOS, permission failures require the user to grant Accessibility and Screen Recording to the bundled
  Kaying Computer Use application. Do not attempt to bypass platform permissions.
- On Windows, stop and refresh state when foreground input reports that the target window could not be focused
  or `SendInput` was incomplete. Do not repeat the action blindly because its outcome is unknown.

Read [../../docs/computer-use.md](../../docs/computer-use.md) for the tool contract and platform notes.
