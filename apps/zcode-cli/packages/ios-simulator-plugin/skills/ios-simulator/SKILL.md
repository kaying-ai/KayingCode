---
name: ios-simulator
description: "iOS development workflow and simulator automation driven by xcrun simctl: list/boot/create simulators, install and launch apps, capture screenshots and video, set status-bar overrides, send push notifications and location fakes, and read app containers. Use when the task involves the iOS Simulator — running/testing an app, verifying UI, capturing screenshots, testing push/location behavior, or automating build-install-launch loops. macOS only; requires Xcode or Command Line Tools."
---

# iOS simulator automation

Drive the iOS Simulator through `xcrun simctl` (ships with Xcode / Command Line Tools, macOS only). The bar: reproducible simulator state and screenshot/log evidence for every claim about on-simulator behavior.

## Prerequisites

```bash
xcode-select -p                  # 需要指向 Xcode（或 Command Line Tools）
xcrun simctl version
xcrun simctl list devices available
```

No Xcode on the host → tell the user to install Xcode (or `xcode-select --install` for CLT) and stop; do not attempt workarounds.

## Simulator lifecycle

```bash
xcrun simctl list runtimes                       # 可用 iOS runtime
xcrun simctl boot "iPhone 16 Pro"                # 按名启动（名字来自 list devices）
xcrun simctl bootstatus <udid> -b                # 等待启动完成
open -a Simulator                                # 打开模拟器窗口（无头运行时可跳过）
xcrun simctl shutdown <udid>                     # 关机；xcrun simctl erase <udid> 重置内容
```

- Prefer a stable device name or UDID in scripts; `boot` is idempotent (booting an already-booted device succeeds).
- Creating a fresh device for hermetic runs: `xcrun simctl create "test-iph" "iPhone 16 Pro" "iOS22.0"` (names/runtimes from the `list` output — never invent them).

## Install, launch, drive

```bash
xcrun simctl listapps <udid>                     # 已安装 app 与 bundle id
xcrun simctl install <udid> build/Debug-iphonesimulator/App.app
xcrun simctl launch <udid> com.example.app       # 输出 pid；terminate 用：
xcrun simctl terminate <udid> com.example.app
xcrun simctl uninstall <udid> com.example.app
xcrun simctl privacy <udid> grant all com.example.app   # 预授权权限，避免弹窗打断自动化
xcrun simctl openurl <udid> "https://example.com"       # 深链/Universal Link 测试
```

UI driving: `simctl` itself has no tap API. In order of preference:

1. **App-level routes** — `openurl` deep links and launch arguments (`launch <udid> <bundle> --args -uiTestMode`) drive state without synthetic touches.
2. **Accessibility/IDB tooling** if already installed on the host (e.g., `idb ui tap x y`) — use what exists; do not install toolchains unprompted.
3. **Ask the user** to interact for manual-only steps, then verify with screenshots.

## Evidence & state injection

```bash
xcrun simctl io <udid> screenshot shot.png       # 截图
xcrun simctl io <udid> recordVideo demo.mov      # 录屏（Ctrl-C 结束）
xcrun simctl status_bar <udid> override --time "9:41" --batteryLevel 100
xcrun simctl push <udid> com.example.app payload.apns   # 模拟推送
xcrun simctl location <udid> set 31.23,121.47    # 伪造定位；clear 恢复
xcrun simctl get_app_container <udid> com.example.app data   # 应用沙盒容器路径（读偏好/文档）
xcrun simctl spawn <udid> log show --last 5m --predicate 'processImagePath CONTAINS "MyApp"'
```

- Crash/logs: app container `Library/Logs`, or the unified log via `spawn ... log show`.
- Screenshots are evidence: capture before/after each asserted state change, named by step (`01-launch.png`, `02-detail.png`), saved into the workspace.

## Test-loop pattern

Build (`xcodebuild -scheme App -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build`) → `simctl install` → `launch` → drive via deep links → `screenshot` + container/log inspection → assert. Use `erase` or a dedicated created device for hermetic full-flow runs.

## Verification and acceptance

- Report the exact simulator (device name, runtime version) with results — behavior differs per runtime.
- Every "screen shows X" claim cites a screenshot path or a container/log fact; never describe unobserved UI.
- Clean up: `terminate` the app, `shutdown` the simulator if you booted it and the user doesn't need it, and remove any status-bar/location overrides you set.
