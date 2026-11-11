# 多语言支持（简体中文 / 繁體中文 / English / Русский）

状态：已确认（2026-10-20）；2026-11-11 增补俄语。适用范围：`apps/kayingcode-mobile-flutter`。

## 1. 背景与现状证据

| 事实 | 证据 |
| --- | --- |
| 现有语言开关只有 2 项 | `lib/ui/settings_page.dart:446-466` 的 `SegmentedButton` 只有 `zh-CN` / `en-US` |
| 现有文案只有 26 个 key，且仅设置页在用 | `lib/ui/ui_settings.dart:62-115` 的 `_zh` / `_en` 表；`tr(context, ...)` 调用只出现在 `lib/ui/settings_page.dart`（22 处） |
| `tr()` 直接读 `UiSettings.locale`，默认固定 `zh-CN` | `lib/ui/ui_settings.dart:4,10,64-65` |
| `MaterialApp` 未接 locale | `lib/main.dart:113-127` 无 `locale` / `supportedLocales` / `localizationsDelegates`；依赖里无 `flutter_localizations` / `intl`（`pubspec.yaml:1-31`） |
| 大量界面文案硬编码中文 | `lib/ui/**` 共 **742** 条含中文字面量；全仓库含协议与日志共 **832** 条、42 个文件 |
| 字体子集缺繁体字 | `assets/fonts/README.md` 声明子集为 GB2312；实测三款 TTF cmap 约 7,965 码位，86 个繁体常用字中 **39 个缺失**（個備傳動務啟單實審尋對帳態憑時會機檔權歷測現畫異確碼終網線聯號製複覽訊設註話認語誤說證貼載連運遠選錯鑰間閱關際隱離頁項顯體麵），缺失时回退系统字体 |
| 字体再生成工具缺失 | `assets/fonts/README.md` 指向 `tool/subset_fonts.py`，本检出不存在该目录/文件 |
| 桌面端只有 zh-CN / en-US | `packages/ui/src/i18n/locales/` 仅 `zh-CN.ts`、`en-US.ts`；移动端模式文案需与桌面 zh-CN 逐字一致，见 `test/chat_mode_copy_test.dart` |

## 2. 语言集合与解析规则

- 支持的 UI 语言：`zh-CN`（简体中文）、`zh-TW`（繁體中文）、`en-US`（English）、`ru-RU`（Русский）。
- 设置项额外提供「跟随系统」；它是**默认值**，不是第五种语言。
- 系统语言解析（`system` 时）：
  - `zh-Hant` / `zh-TW` / `zh-HK` / `zh-MO` → `zh-TW`
  - 其他 `zh-*`（含 `zh-Hans`、`zh-CN`、`zh-SG`）→ `zh-CN`
  - `en-*` → `en-US`
  - `ru-*` → `ru-RU`（不区分 `ru-RU` / `ru-KZ` / `ru-UA` 等地区）
  - 其余语言 → `zh-CN`（产品默认）
- 文案回落链：当前语言表 → `zh-CN` → `en-US` → key 本身。任何表缺 key 不得显示空白。
- 切换语言立即生效，无需重启；选择结果持久化。
- 俄语复数：文案表保持扁平 map，不引入 ICU。含数量的整句统一写成「名词（复数第二格）+ 冒号 + `{count}`」（如 `Проектов: {count}`），在任何数量下语法成立；日期与相对时间的复数变格由 `formatting.dart` 的专用函数处理。

## 3. 状态所有权（唯一写入路径）

```
                 ┌──────────────────────────────┐
用户选择 ───────▶│ UiSettings.localeOverride    │ 持久化 zflow_ui_locale
                 │ system|zh-CN|zh-TW|en-US|ru-RU│ 唯一偏好所有者
                 └──────────────┬───────────────┘
                                │ notifyListeners / platformDispatcher.didChangeLocales
                                ▼
                 ┌─────────────────────────────┐
                 │ AppLocale（派生只读）        │ resolved：生效 Locale
                 │ 不持久化、不接收用户写入      │ 供无 BuildContext 的代码读取
                 └──────────────┬──────────────┘
                    ┌───────────┴────────────┐
                    ▼                        ▼
        MaterialApp.locale          tr()/t() 文案查找
        （widget 内用 Localizations.localeOf）
```

- `UiSettings` 是唯一持久化与写入点；`AppLocale` 只是派生快照，禁止被 UI 直接写。
- Widget 树内一律用 `Localizations.localeOf(context)`（MaterialApp 已注入生效 locale），不得再读 `UiSettings.locale` 决定语言。
- 通知、连接错误说明等无 `BuildContext` 的路径用 `AppLocale.resolved`。
- 旧持久化值兼容：`zflow_ui_locale` 缺省或为 `system` 时跟随系统；既有 `zh-CN` / `en-US` 视为显式覆盖，不需要迁移。

## 4. 接口契约

新建 `lib/l10n/`：

| 文件 | 职责 |
| --- | --- |
| `app_locale.dart` | 支持列表、系统 locale 解析、回落链、`AppLocale` 派生快照 |
| `strings.dart` | 汇总各区域表；`tr(context, key, {args})`、`t(key, {args})`；`{name}` 占位符替换 |
| `tables/<area>.dart` | 每文件包含同 key 的四张 `const Map<String, String>`（简体/繁体/英文/俄文） |

- key 命名沿用现状：`<area>.<feature>.<item>`，例如 `settings.language`、`chat.inputHint`。
- 插值用命名占位符：`t('notify.running', args: {'count': n})`，表内写 `'{count} 个任务运行中'`。缺失参数时保留占位符原样，便于测试发现。四语表的占位符集合必须完全一致。
- 纯函数文案（`modeLabelOf` / `modeDescriptionOf` 等无 `BuildContext` 且被既有测试直接调用的 helper）通过 `AppLocale.current` 读取派生快照；UI 侧仍以 `Localizations.localeOf` 为准，二者由同一个 `ZflowApp.build` 写入/解析，不会分叉。
- 复数：当前不引入 ICU 复数引擎；数量文案按语言写整句（如 `1 task running` / `{count} tasks running` 由调用方选择 key 或表内变体）。若后续需要，再升级到 ARB/intl，不在本次范围。俄语按 §2 的「名词 + 冒号 + `{count}`」约定写成数量中立句式；`formatting.dart` 内的时间文案按俄语变格表处理。

## 5. 抽取范围

**纳入（用户可见）：**

- `lib/ui/**` 全部 742 条中文字面量（含 `settings_page.dart` 83 条、`chat/**` 207 条、`session_drawer.dart` 63 条、`automation_page.dart` 62 条等）。
- 通知：`lib/notifications/notify_state.dart:143-152` 的任务/权限/等待标题、`task_notifier.dart:213` 的运行中标题。
- 连接失败说明：`lib/state/app_session.dart:26-50`（`describeConnectFailure`，设备列表直接展示）。
- 设备默认名：`lib/state/account_store.dart:33,58` 的「未命名设备」。

**不纳入（保持中文）：**

- 所有 `[诊断]` 日志、`log_store.dart`、`crash_report.dart` 的日志文本。
- `FormatException` / `StateError` / `UnimplementedError` 等内部异常文本（仅用于日志与排查）。
- 协议字段值、RPC 方法名、URL、存储 key。

**约束：**

- 模式文案 `modeLabelOf` / `modeDescriptionOf` 的 zh-CN 值必须与桌面 locale 逐字一致（`test/chat_mode_copy_test.dart` 为基准）；新增 zh-TW / en-US 翻译不得改动 zh-CN 值。
- 每日一句等来自宿主的数据不翻译，仅翻译本地壳层文案。

## 6. 字体覆盖

- 目标：四语文案用到的所有字符（含繁体专属汉字与西里尔字母）都由内置字体渲染，不再回落系统字体。
- 做法：新增 `tool/subset_fonts.py`（补齐 README 已声明的路径），字符集 = 现有 `assets/fonts/subset-chars.txt` ∪ GB2312 ∪ Big5 常用字 ∪ 三语表实际用字；母版对齐上游 **Sarasa 1.0.41 unhinted**（与现有字体 version/族名一致）。
- 产物：`Zflow-UI-Regular.ttf`、`Zflow-UI-Bold.ttf`、`Zflow-Term-Regular.ttf` 重新生成，重建 `subset-chars.txt` 并记录母版版本与生成命令。
- 字形策略：仍使用 Sarasa **SC** 变体，共享汉字按简体字形标准；若后续要求台湾字形标准，另挂 Sarasa UI TC 子集，本次不做。
- 验收：新增测试直接读取打包 TTF 的 cmap，断言四张表里出现的每个汉字都在 cmap 内；俄文表中出现的西里尔字母同样必须在 cmap 内。

## 7. 需要一并修正的既有缺陷

`lib/notifications/task_notifier.dart:142` 用 `completionTitleFor(c.phase) != '任务完成'` 判断「是否失败」。文案本地化后该判断必然失效（英文/繁中标题永远不等于中文常量），导致失败通知被错误路由到「完成」开关。改为纯语义函数 `completionPhaseIsFailure(phase)`，通知标题只负责展示。

## 8. 验收场景

1. 首次启动（系统为简体中文 / 繁体中文 / 英文 / 俄文 / 日文）分别落到 zh-CN / zh-TW / en-US / ru-RU / zh-CN，设置页显示「跟随系统」。
2. 设置页语言项出现五项：跟随系统、简体中文、繁體中文、English、Русский；切换后当前页面立即刷新，重启后保持。
3. 任一界面在四种语言下无中文残留（日志页除外）；缺 key 时按回落链显示，不出现空白或 key 原文。
4. Material 内置文案跟随语言：文本选择工具条、日期/时间选择器在 zh-TW 下为繁体，en-US 下为英文，ru-RU 下为俄文。
5. 通知标题、连接失败说明随语言变化；任务失败通知仍走「失败」开关，完成通知走「完成」开关。
6. 四语表 key 集合完全一致；`lib/ui/**` 无中文字面量（门禁测试）。
7. 打包字体 cmap 覆盖四语表全部汉字与俄文西里尔字母；繁体与俄文界面不出现字形回退。
8. `node scripts/flutter-target.mjs android analyze` 输出 `No issues found`，`test` 全绿。

## 9. 非目标

- 不新增除中/繁/英/俄之外的语言。
- 不引入 ARB/intl 代码生成（保持现有轻量 map 方案），除非后续出现复数/日期格式化需求。
- 不翻译协议日志、崩溃日志与宿主下发的业务内容。
- 不改造桌面端 i18n，也不要求桌面端同步新增 zh-TW（移动端先支持）。

## 10. 验证记录（2026-10-20）

在 `apps/kayingcode-mobile-flutter` 下经平台入口执行：

| 命令 | 结果 |
| --- | --- |
| `node scripts/flutter-target.mjs android analyze` | `No issues found! (ran in 3.5s)` |
| `node scripts/flutter-target.mjs android test` | `All tests passed!`（101 项） |
| `node scripts/flutter-target.mjs ios analyze` | `No issues found! (ran in 3.3s)` |
| `node scripts/flutter-target.mjs ios test` | `All tests passed!`（102 项） |

新增测试：

- `test/l10n_locale_test.dart`：系统语言解析、显式覆盖、持久化编码往返、三语 `t()` 插值、缺失 key 与参数回落。
- `test/l10n_tables_test.dart`：8 张区域表 × 3 语共 692 个 key；三语 key 集合一致、无跨表重复、占位符一致。
- `test/l10n_ui_gate_test.dart`：`lib/ui/**` 无中文字面量（仅白名单 `ai_content_label.dart` 与语言自称）。
- `test/l10n_font_coverage_test.dart`：三款 TTF 的 cmap 覆盖三语表全部汉字。
- `test/settings_language_test.dart`：设置页四项语言选择，切换后持久化 `zflow_ui_locale`。
- `test/app_locale_wiring_test.dart`：从 `ZflowApp` 根节点进入设置并切换语言，断言 `MaterialApp.locale`、`AppLocale` 与页面文案立即更新（覆盖下述缺陷 1）。

字体产物：`Zflow-UI-Regular.ttf` 5,219,112 B、`Zflow-UI-Bold.ttf` 5,137,296 B、`Zflow-Term-Regular.ttf` 5,222,416 B，合计 15,578,824 B（约 15.6 MB；改动前三款合计 6,669,788 B，约 6.7 MB）。

### iOS 模拟器验收（Xcode 26.3，iPhone 17 Pro / iOS 26.2）

- `node scripts/flutter-target.mjs ios debug` 构建成功；`simctl install` + `launch` 启动正常。
- 简体中文 / 繁體中文 / English 三语下首屏、设置首页、外观与语言页文案完整，繁体专属字（區、線、備、匯、碼、觀、與、語、級）均由内置字体渲染，无缺字方框。
- 应用内切换语言后正文与 AppBar 标题立即更新；重启后保持所选语言。
- 「跟随系统」验证：模拟器系统语言设为 `zh-Hant-TW` 与 `en-US` 后重启应用，分别落到 zh-TW 与 en-US，恢复 `zh-Hans-CN` 后回落 zh-CN。
- 模拟器 `Runner` 日志无 Flutter 异常、溢出或崩溃记录。

### 验收中发现并修复的缺陷

1. `MaterialApp.locale` 在 `AnimatedBuilder` 外层计算，`UiSettings` 通知只重建 builder，外层 `build()` 不重跑，导致切换语言后正文变了而 `MaterialApp.locale` 仍是旧值。修复：把 locale 解析与 `AppLocale.update` 移入 builder 内，并新增根节点回归测试。
2. 设置子页面的 `AppBar` 标题在 push 时用 `tr()` 结果固化，切换语言后标题不更新。修复：路由改为接收本地化 key，在路由 builder 内用 `tr(routeContext, key)` 实时解析。

未验证项：OHOS 仅通过同一 Dart 层校验，未在真机或 OHOS 模拟器做视觉与字体验收；iOS 未做真机验收（仅模拟器），Material 内置文案（选择工具条、日期选择器）仅由 locale 解析与 delegates 注入测试覆盖，未做逐项截图。

## 11. 俄语增补验证记录（2026-11-11）

在 `apps/kayingcode-mobile-flutter` 下经平台入口执行：

| 命令 | 结果 |
| --- | --- |
| `node scripts/flutter-target.mjs android check` | 上游 Flutter 3.35.5 已核对 |
| `node scripts/flutter-target.mjs android analyze` | `No issues found! (ran in 1.3s)` |
| `node scripts/flutter-target.mjs android test` | `All tests passed!`（75 项） |

- 10 张区域表各新增同 key 的 `ruRU` 表，四语共 669 个 key；`test/l10n_tables_test.dart` 现校验四语 key 集合一致、非空与占位符一致。
- `test/l10n_locale_test.dart` 覆盖 `ru-*` → `ru-RU`、显式俄语覆盖与俄文 `t()` 插值。
- `test/l10n_formatting_test.dart` 覆盖俄语消息时间、相对时间、周几与紧凑数字单位（逗号小数）。
- `test/l10n_font_coverage_test.dart` 增加俄文西里尔字母的 cmap 覆盖断言；三款内置字体实测覆盖全部俄文字母。
- `test/settings_language_test.dart` 校验第五项 `Русский` 与 `zflow_ui_locale=ru-RU` 持久化。
- `test/app_locale_wiring_test.dart` 增加从根 `MaterialApp` 切换到 `Русский` 的断言。

### Android 真机验收（Samsung SM-G9500，Android 9 / API 28）

- 设备系统语言为 `zh-Hans-CN`；debug APK 因与已安装 0.1.2 正式签名不一致被拒绝，改用 release 签名构建并 `adb install -r` 覆盖安装 0.1.3，原有数据与语言偏好保留。
- 设置 → 外观与语言出现五项：跟随系统、简体中文、繁體中文、English、Русский；选择 `Русский` 后 AppBar、主题、字体设置项与底部导航立即变为俄语。
- 俄语字形由内置字体渲染，无缺字方框；设置首页、连接与通知、模型与服务、诊断与关于、关于页均无中文残留。
- 验收到并修复布局缺陷：主题三段控件在俄语下把 «Светлая» / «Как в системе» 拆成两行。修复为俄语系统项改用 «Система»，并将段内水平内边距收紧到 8dp；复测 «Тёмная / Светлая / Система» 单行显示，英文与简中布局无回归。
- 强制停止并重新启动应用后仍保持 `ru-RU`；切换「跟随系统」后按设备 `zh-Hans-CN` 回落简体中文，再切回俄语正常。
- `adb logcat` 未发现 Flutter 异常、RenderFlex 溢出或崩溃记录。
- 未验证：设备系统语言本身设为 `ru-*` 的跟随场景（由 `test/l10n_locale_test.dart` 覆盖）；未连接桌面端，会话/对话页面与 Material 内置文案（选择工具条、日期选择器）未逐项截图。
