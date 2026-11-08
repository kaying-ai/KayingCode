import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/app_locale.dart';

/// UI preferences: language (system / zh-CN / zh-TW / en-US), text scale,
/// code font size. 这里是语言偏好的唯一持久化与写入点。
class UiSettings extends ChangeNotifier {
  static const _localeKey = 'zflow_ui_locale';
  static const _scaleKey = 'zflow_ui_text_scale';
  static const _codeFontKey = 'zflow_ui_code_font_size';

  AppLanguage language = AppLanguage.system;
  double textScale = 1.0;
  double codeFontSize = 12.5;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    language = appLanguageFromCode(prefs.getString(_localeKey));
    textScale = prefs.getDouble(_scaleKey) ?? 1.0;
    codeFontSize = prefs.getDouble(_codeFontKey) ?? 12.5;
    notifyListeners();
  }

  Future<void> setLanguage(AppLanguage value) async {
    language = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_localeKey, appLanguageToCode(value));
  }

  Future<void> setTextScale(double value) async {
    textScale = value.clamp(0.8, 1.4);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_scaleKey, textScale);
  }

  Future<void> setCodeFontSize(double value) async {
    codeFontSize = value.clamp(10, 20);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_codeFontKey, codeFontSize);
  }
}

class UiSettingsProvider extends InheritedWidget {
  final UiSettings settings;

  const UiSettingsProvider({
    super.key,
    required this.settings,
    required super.child,
  });

  static UiSettings? of(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<UiSettingsProvider>()
      ?.settings;

  @override
  bool updateShouldNotify(UiSettingsProvider oldWidget) =>
      settings != oldWidget.settings;
}
