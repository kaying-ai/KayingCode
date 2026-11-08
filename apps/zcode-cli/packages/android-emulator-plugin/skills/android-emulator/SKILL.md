---
name: android-emulator
description: "Android development workflow and emulator automation driven by adb: boot and list devices/AVDs, install and launch APKs, drive UI (tap/swipe/input text), capture screenshots and screen recordings, pull/push files, and read logcat for debugging. Use when the task involves an Android emulator or device — running/testing an app, verifying UI behavior, capturing screenshots, debugging crashes, or automating install/launch loops. Requires adb (Android platform-tools) on the host."
---

# Android emulator automation

Drive Android emulators and devices through `adb` (Android platform-tools). The bar: reproducible device state and evidence (screenshot/logcat) for every claim about on-device behavior.

## Prerequisites

```bash
adb version                       # platform-tools；缺失时提示用户安装 Android platform-tools
emulator -list-avds 2>/dev/null   # 列出可用 AVD（需要 Android SDK emulator）
```

The plugin does not manage SDK installation. If neither `adb` nor an emulator exists, tell the user exactly what to install (Android Studio → platform-tools + emulator) and stop — do not guess download URLs.

## Device lifecycle

```bash
adb devices -l                    # 已连接设备；offline/unauthorized 要先处理
emulator -avd <name> -no-snapshot-load &   # 冷启动 AVD（后台运行）
adb wait-for-device && adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done; echo booted'
```

- Multiple devices: select with `adb -s <serial> ...` in every later command; never assume a single device.
- `unauthorized` → the device needs the RSA prompt accepted; `offline` → `adb kill-server && adb start-server`.

## Install, launch, drive

```bash
adb install -r app.apk                        # -r 覆盖安装；失败先卸载：adb uninstall <pkg>
adb shell pm list packages | grep <keyword>   # 找包名
adb shell monkey -p <pkg> -c android.intent.category.LAUNCHER 1   # 冷启动
adb shell am force-stop <pkg>                 # 停止
adb shell pm clear <pkg>                      # 清数据（重置状态）
```

UI automation (coordinates come from screenshots you inspect — never guess blind):

```bash
adb exec-out screencap -p > screen.png        # 截图（首选 exec-out，避免 CRLF 污染）
adb shell input tap <x> <y>                   # 点击
adb shell input swipe <x1> <y1> <x2> <y2> <duration_ms>
adb shell input text "hello%stwo"             # 输入文本；空格用 %s，中文输入法另配
adb shell input keyevent 4                    # BACK；4=BACK 3=HOME 82=MENU
```

For structured UI verification prefer view dumps over pixels:

```bash
adb exec-out uiautomator dump /dev/tty        # 输出控件树 XML（bounds/text/resource-id）
```

## Evidence & debugging

```bash
adb exec-out screencap -p > after.png
adb shell screenrecord /sdcard/demo.mp4       # 录屏（Ctrl-C 结束）；adb pull 回来
adb logcat -d -t 500                          # 最近 500 行缓冲
adb logcat -d *:E                             # 只看错误
adb logcat -d | grep -iE "FATAL|AndroidRuntime"   # 崩溃栈
adb pull /sdcard/demo.mp4 .
adb push local.file /sdcard/
```

- Crash triage order: `logcat` FATAL/AndroidRuntime stack → `adb bugreport` (heavy, last resort) → reproduce with `pm clear` + cold start.
- Screenshots are evidence: capture **before** and **after** for any state change you report; name files by step (`01-launch.png`, `02-login.png`).

## Test-loop pattern

For "改一下 app 再验证" cycles: build/install → cold start → drive the flow with input commands → screenshot + uiautomator dump → assert against the expected UI → pull logs on failure. Keep the loop idempotent: `pm clear` between full-flow runs.

## Verification and acceptance

- Report device model/Android version (`adb shell getprop ro.product.model; getprop ro.build.version.release`) alongside results — behavior differs across API levels.
- Every "UI shows X" claim cites a screenshot or a uiautomator dump line; screenshots go to the workspace so the user (and the visual-judge agent, when rendering quality matters) can see what you saw.
- Clean up: `adb shell am force-stop` the app, kill the emulator if you started it and the user doesn't need it.
