import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Design tokens + theme controller (dark / light / system, persisted).
class ThemeController extends ChangeNotifier {
  static const _prefsKey = 'zflow_theme_mode';

  ThemeMode _mode = ThemeMode.dark;
  ThemeMode get mode => _mode;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefsKey);
    _mode = switch (saved) {
      'light' => ThemeMode.light,
      'system' => ThemeMode.system,
      _ => ThemeMode.dark,
    };
    notifyListeners();
  }

  Future<void> setMode(ThemeMode mode) async {
    _mode = mode;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.system => 'system',
      _ => 'dark',
    });
  }
}

/// ZCode Zai 主题映射；保留 Ember API 供现有页面使用。
ThemeData buildDarkTheme() => _buildTheme(const EmberColors.dark());
ThemeData buildLightTheme() => _buildTheme(const EmberColors.light());

ThemeData _buildTheme(EmberColors c) {
  final brightness = c.isDark ? Brightness.dark : Brightness.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.primary,
    onPrimary: c.onPrimary,
    primaryContainer: c.raise,
    onPrimaryContainer: c.textSolid,
    secondary: c.primary,
    onSecondary: c.onPrimary,
    secondaryContainer: c.raise,
    onSecondaryContainer: c.textSolid,
    tertiary: c.primary,
    onTertiary: c.onPrimary,
    tertiaryContainer: c.raise,
    onTertiaryContainer: c.textSolid,
    error: c.err,
    onError: Colors.white,
    errorContainer: Color.alphaBlend(c.err.withValues(alpha: .12), c.card),
    onErrorContainer: c.err,
    surface: c.card,
    onSurface: c.textSolid,
    surfaceDim: c.bg,
    surfaceBright: c.card,
    surfaceContainerLowest: c.bg,
    surfaceContainerLow: c.panel,
    surfaceContainer: c.card,
    surfaceContainerHigh: c.raise,
    surfaceContainerHighest: c.raise,
    onSurfaceVariant: c.textMuted,
    outline: c.hairline,
    outlineVariant: c.hairline,
    inverseSurface: c.primary,
    onInverseSurface: c.onPrimary,
    inversePrimary: c.onPrimary,
    surfaceTint: Colors.transparent,
    shadow: Colors.black,
    scrim: Colors.black,
  );
  final controlShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(EmberRadius.control),
  );
  final inputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(EmberRadius.control),
    borderSide: BorderSide(color: c.hairline),
  );
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    fontFamily: EmberFonts.ui,
    colorScheme: scheme,
  );
  final text = base.textTheme.apply(
    bodyColor: c.textSolid,
    displayColor: c.textSolid,
  );
  TextStyle style(double size, {bool bold = false, Color? color}) => TextStyle(
    fontFamily: EmberFonts.ui,
    fontSize: size,
    height: EmberType.lineHeight,
    fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
    color: color ?? c.textSolid,
  );
  return base.copyWith(
    scaffoldBackgroundColor: c.bg,
    textTheme: text.copyWith(
      headlineLarge: style(EmberType.title, bold: true),
      headlineMedium: style(EmberType.title, bold: true),
      headlineSmall: style(EmberType.title, bold: true),
      titleLarge: style(EmberType.section, bold: true),
      titleMedium: style(EmberType.emphasis, bold: true),
      titleSmall: style(EmberType.body, bold: true),
      bodyLarge: style(EmberType.body),
      bodyMedium: style(EmberType.body),
      bodySmall: style(EmberType.secondary, color: c.textMuted),
      labelLarge: style(EmberType.body),
      labelMedium: style(EmberType.secondary),
      labelSmall: style(EmberType.caption, color: c.textFaint),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.bg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: style(EmberType.section, bold: true),
      iconTheme: IconThemeData(color: c.textSoft),
    ),
    cardTheme: CardThemeData(
      color: c.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(EmberRadius.content),
        side: BorderSide(color: c.hairline),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(shape: WidgetStatePropertyAll(controlShape)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: controlShape,
        textStyle: style(EmberType.body),
        minimumSize: const Size(48, 44),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: controlShape,
        side: BorderSide(color: c.hairline),
        textStyle: style(EmberType.body),
        minimumSize: const Size(48, 44),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: controlShape,
        textStyle: style(EmberType.body),
        minimumSize: const Size(48, 44),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        shape: controlShape,
        elevation: 0,
        backgroundColor: c.raise,
        foregroundColor: c.textSolid,
        surfaceTintColor: Colors.transparent,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: inputBorder,
      enabledBorder: inputBorder,
      focusedBorder: inputBorder.copyWith(
        borderSide: BorderSide(color: c.borderFocused),
      ),
      hintStyle: style(EmberType.body, color: c.textFaint),
    ),
    dividerTheme: DividerThemeData(color: c.hairline, thickness: 1, space: 1),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.raise,
      contentTextStyle: style(EmberType.body),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(EmberRadius.sheet),
        ),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: c.card,
      surfaceTintColor: Colors.transparent,
      textStyle: style(EmberType.body),
      shape: controlShape,
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: c.textSolid,
      unselectedLabelColor: c.textMuted,
      indicatorColor: c.primary,
      dividerColor: c.hairline,
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorShape: controlShape,
      backgroundColor: c.panel,
      surfaceTintColor: Colors.transparent,
      indicatorColor: c.raise,
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 22,
          color: states.contains(WidgetState.selected)
              ? c.textSolid
              : c.textMuted,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => style(
          EmberType.secondary,
          bold: states.contains(WidgetState.selected),
          color: states.contains(WidgetState.selected)
              ? c.textSolid
              : c.textMuted,
        ),
      ),
    ),
  );
}

/// Provides the app-wide [ThemeController] down the tree.
class ThemeControllerProvider extends InheritedWidget {
  final ThemeController controller;

  const ThemeControllerProvider({
    super.key,
    required this.controller,
    required super.child,
  });

  static ThemeController? of(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<ThemeControllerProvider>()
      ?.controller;

  @override
  bool updateShouldNotify(ThemeControllerProvider oldWidget) =>
      controller != oldWidget.controller;
}

/// 对齐 styles.css 的 Zai Light / Dark；移动端弱文字保持可读对比度。
class EmberColors {
  final bool isDark;
  const EmberColors._(this.isDark);
  const EmberColors.dark() : this._(true);
  const EmberColors.light() : this._(false);

  static EmberColors of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.light
      ? const EmberColors.light()
      : const EmberColors.dark();

  Color get bg => isDark ? const Color(0xFF161616) : const Color(0xFFF8F8F8);
  Color get panel => isDark ? const Color(0xFF202020) : Colors.white;
  Color get card => isDark ? const Color(0xFF2B2B2B) : Colors.white;
  Color get raise => isDark ? const Color(0xFF363636) : const Color(0xFFE6E6E6);
  Color get hairline =>
      (isDark ? Colors.white : const Color(0xFF0D0D0D)).withValues(alpha: .1);
  Color get borderFocused =>
      (isDark ? Colors.white : const Color(0xFF0D0D0D)).withValues(alpha: .15);
  Color get primary => isDark ? Colors.white : Colors.black;
  // 深色主按钮现在是白底，不能沿用上游固定白字，否则图标和文字不可见。
  Color get onPrimary => isDark ? Colors.black : Colors.white;
  Color get ok => isDark ? const Color(0xFF46BF72) : const Color(0xFF1E8A3E);
  Color get err => isDark ? const Color(0xFFFF5C5C) : const Color(0xFFE03131);
  Color get warn => isDark ? const Color(0xFFFF8A30) : const Color(0xFFE07B00);
  Color get run => isDark ? const Color(0xFF4099FF) : const Color(0xFF0B7FFF);
  Color get textSolid =>
      isDark ? const Color(0xFFD4D4D4) : const Color(0xFF262626);
  Color get textSoft =>
      isDark ? const Color(0xFFB8B8B8) : const Color(0xFF525252);
  Color get textMuted =>
      isDark ? const Color(0xFFA3A3A3) : const Color(0xFF666666);
  Color get textFaint =>
      isDark ? const Color(0xFF969696) : const Color(0xFF737373);
  Color get codeBlockBg =>
      isDark ? const Color(0xFF202020) : const Color(0xFFF0F0F0);
  Color get codeInlineBg => raise;
  Color get codeText => textSolid;
}

/// 对齐 DESIGN.md 的容器、控件与弹层层级。
abstract final class EmberRadius {
  static const content = 12.0; // 气泡/卡片
  static const bubbleTail = 4.0; // 气泡尾角
  static const sheet = 16.0; // sheet 顶部
  static const control = 8.0; // 任务卡/设置行组/按钮
  static const avatar = 8.0; // 缩略图/头像
}

/// 4px 网格间距(spec §4)。
abstract final class EmberSpacing {
  static const page = 16.0;
  static const cardPad = 12.0;
  static const listItemH = 12.0;
  static const listItemV = 8.0;
  static const gapS = 8.0;
  static const gapM = 12.0;
}

/// 六档字阶 + 行高(spec §3)。
abstract final class EmberType {
  static const title = 18.0;
  static const section = 16.0;
  static const emphasis = 14.0;
  static const body = 14.0;
  static const secondary = 12.0;
  static const caption = 10.0;
  static const lineHeight = 1.5;
}

/// 字体族单一来源:UI 正文用 Sarasa UI,等宽/代码用 Sarasa Term。
abstract final class EmberFonts {
  static const ui = 'Sarasa UI SC';
  static const term = 'Sarasa Term SC';
}
