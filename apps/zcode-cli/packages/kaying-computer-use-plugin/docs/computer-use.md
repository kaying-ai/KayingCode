# Computer Use runtime

The plugin exposes the upstream Kaying Computer Use stdio MCP server under the trusted official server
namespace `plugin:computer-use:computer-use`.

Tools: `list_apps`, `get_app_state`, `click`, `perform_secondary_action`, `scroll`, `drag`, `type_text`,
`press_key`, and `set_value`.

Call `get_app_state` before using an `element_index`. The index is valid only for the native process and
snapshot that produced it. Action results may include a refreshed accessibility tree and screenshot.

Platform requirements:

- macOS: Accessibility and Screen Recording permission for the bundled Kaying Computer Use app. The
  wrapper runs the bundled permission doctor and opens its onboarding UI when permission is missing.
- Windows: a signed-in interactive desktop session with UI Automation available.
- Linux: a signed-in desktop session with AT-SPI2 and D-Bus accessibility available.

The runtime is local-only. Remote and Web workspaces do not route Computer Use back to the desktop host.

## macOS visual feedback

The software pointer adds a blue glow and click pulse; rotation and click
compression keep its hotspot fixed, including near display edges. A transparent
blue-violet outline identifies the target window and follows its geometry across
displays. Both panels ignore mouse events and cannot become key or main windows.

macOS keeps background input: feedback stays immediately above its target window,
below unrelated windows that cover it, and never activates the target app. Target
closure, minimization, hiding or leaving the current Space clears both panels.
The existing turn-ended/reset path and 30-second idle deadline also clear them.
Reduce Motion keeps static feedback while geometry and lifecycle checks continue.
Set `KAYING_COMPUTER_USE_VISUAL_CURSOR=0` to disable both panels.

Screenshots continue to capture the target window through the existing
ScreenCaptureKit single-window filter. Rules and macOS-only test scenarios are in
[`specs/macos-visual-feedback.md`](../specs/macos-visual-feedback.md). On macOS,
run `swift test --filter MacVisualFeedbackTests` from the vendored runtime root;
set `KAYING_COMPUTER_USE_TEST_INTERACTIVE=1` for desktop interaction tests. The
capture test additionally requires existing Screen Recording permission.

## Windows input delivery

The built-in plugin launches the Windows runtime with
`KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY=foreground`: coordinate actions
(click / scroll / drag) restore, focus, and verify the target window before
delivering real `SendInput` mouse events. The runtime checks the inserted event
count and reports an error instead of silently claiming success. `press_key`
sends scan-code keyboard events, supports xdotool-style modifier names such as
`Control_L`, `Shift_L`, and `Alt_L`, and
`type_text` falls back to Unicode key injection that bypasses IME composition.
This is required for apps that ignore background window messages, such as
Blender and other raw-input or OpenGL apps. During foreground input, a dark
software pointer with a light outline and soft blue glow follows the real input
hotspot. A transparent blue-violet outline identifies the target work area and
tracks window geometry and DPI. Click, drag, and scroll completion briefly pulse
at the committed point, then return to the resting pointer. Both overlays are
click-through and never take focus; screenshots exclude them. Both are disposed
before each tool response, including failed calls, and on turn-ended notifications;
the next operation recreates them. During execution they also clear when the target
loses focus, closes, or is minimized, when the user moves the system pointer, or
after 30 seconds without input. System animation preferences are
respected. Disable both with
`KAYING_COMPUTER_USE_WINDOWS_DISABLE_VISUAL_CURSOR=1`.

The behavior, ownership and acceptance scenarios are specified in
[`specs/visual-feedback.md`](../specs/visual-feedback.md). Linux does not gain an
overlay backend in this change.

Blender and similar area-based applications route shortcuts using the work area
under the mouse pointer. Click a stable point inside the intended viewport before
calling `press_key`; bringing the top-level window to the foreground alone does
not select the shortcut context.

Set `KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY=background` in the environment
to return to non-invasive background delivery (UIA patterns and window
messages, never stealing focus).
