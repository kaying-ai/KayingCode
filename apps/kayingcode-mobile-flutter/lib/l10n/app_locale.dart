import 'package:flutter/widgets.dart';

/// 支持的三门 UI 语言；`system` 只是「跟随系统」的偏好值，不是语言。
enum AppLanguage { system, zhCN, zhTW, enUS }

const String appLanguageSystem = 'system';

/// 持久化与设置项使用的稳定编码。
const List<String> appLanguageCodes = <String>[
  appLanguageSystem,
  'zh-CN',
  'zh-TW',
  'en-US',
];

const Locale appLocaleZhCN = Locale('zh', 'CN');
const Locale appLocaleZhTW = Locale('zh', 'TW');
const Locale appLocaleEnUS = Locale('en', 'US');

/// MaterialApp 的 supportedLocales；顺序影响 Flutter 自身的兜底匹配，
/// 生效语言仍由 [resolveAppLocale] 显式决定。
const List<Locale> supportedAppLocales = <Locale>[
  appLocaleZhCN,
  appLocaleZhTW,
  appLocaleEnUS,
];

const Locale defaultAppLocale = appLocaleZhCN;

AppLanguage appLanguageFromCode(String? code) => switch (code) {
  'zh-CN' => AppLanguage.zhCN,
  'zh-TW' => AppLanguage.zhTW,
  'en-US' => AppLanguage.enUS,
  _ => AppLanguage.system,
};

String appLanguageToCode(AppLanguage language) => switch (language) {
  AppLanguage.system => appLanguageSystem,
  AppLanguage.zhCN => 'zh-CN',
  AppLanguage.zhTW => 'zh-TW',
  AppLanguage.enUS => 'en-US',
};

/// 系统语言 → 应用语言。
///
/// zh-Hant / TW / HK / MO 统一落到繁体；其他中文（含 zh-Hans、zh、zh-SG）
/// 落到简体；英文落到 en-US；其余语言回落产品默认 zh-CN。
Locale resolveAppLocale(List<Locale> systemLocales) {
  for (final locale in systemLocales) {
    final language = locale.languageCode.toLowerCase();
    if (language == 'zh') {
      final script = locale.scriptCode?.toLowerCase();
      final country = locale.countryCode?.toUpperCase();
      if (script == 'hant' ||
          country == 'TW' ||
          country == 'HK' ||
          country == 'MO') {
        return appLocaleZhTW;
      }
      return appLocaleZhCN;
    }
    if (language == 'en') return appLocaleEnUS;
  }
  return defaultAppLocale;
}

Locale effectiveAppLocale({
  required AppLanguage override,
  required List<Locale> systemLocales,
}) {
  return switch (override) {
    AppLanguage.system => resolveAppLocale(systemLocales),
    AppLanguage.zhCN => appLocaleZhCN,
    AppLanguage.zhTW => appLocaleZhTW,
    AppLanguage.enUS => appLocaleEnUS,
  };
}

bool isTraditionalLocale(Locale locale) {
  final script = locale.scriptCode?.toLowerCase();
  final country = locale.countryCode?.toUpperCase();
  return script == 'hant' ||
      country == 'TW' ||
      country == 'HK' ||
      country == 'MO';
}

/// 供无 BuildContext 的路径（通知、连接错误说明）读取生效语言。
///
/// 这是派生只读快照：唯一写入方是 `ZflowApp` 在构建时与系统语言变化时调用
/// [update]；UI 不得直接写它。
class AppLocale {
  AppLocale._();

  static Locale _current = defaultAppLocale;

  static Locale get current => _current;

  static void update(Locale locale) {
    _current = locale;
  }

  /// 测试用：恢复默认，避免用例之间互相污染。
  static void resetForTest() {
    _current = defaultAppLocale;
  }
}
