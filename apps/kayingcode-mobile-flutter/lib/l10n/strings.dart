import 'package:flutter/widgets.dart';

import 'app_locale.dart';
import 'string_table.dart';
import 'tables/chat_content.dart';
import 'tables/chat_shell.dart';
import 'tables/common.dart';
import 'tables/devices.dart';
import 'tables/onboarding_automation.dart';
import 'tables/runtime.dart';
import 'tables/sessions.dart';
import 'tables/settings_pages.dart';
import 'tables/zcode_auth.dart';
import 'tables/zcode_web.dart';

/// 新增区域表时在此登记；`test/l10n_tables_test.dart` 会校验三语 key 一致、
/// 跨区域无重复 key。
final List<AppStringTable> appStringTables = <AppStringTable>[
  commonStrings,
  chatShellStrings,
  chatContentStrings,
  sessionsStrings,
  settingsPagesStrings,
  devicesStrings,
  onboardingAutomationStrings,
  runtimeStrings,
  zcodeAuthStrings,
  zcodeWebStrings,
];

final Map<String, String> _zhCN = <String, String>{
  for (final table in appStringTables) ...table.zhCN,
};
final Map<String, String> _zhTW = <String, String>{
  for (final table in appStringTables) ...table.zhTW,
};
final Map<String, String> _enUS = <String, String>{
  for (final table in appStringTables) ...table.enUS,
};

/// Widget 内取文案：语言来自 [Localizations.localeOf]，与 MaterialApp 生效
/// 语言同源。
String tr(BuildContext context, String key, {Map<String, Object?>? args}) {
  return lookupAppString(Localizations.localeOf(context), key, args: args);
}

/// 无 BuildContext 的路径（通知、连接失败说明）取文案。
String t(String key, {Map<String, Object?>? args}) {
  return lookupAppString(AppLocale.current, key, args: args);
}

/// 回落链：当前语言 → zh-CN → en-US → key 原文。
String lookupAppString(
  Locale locale,
  String key, {
  Map<String, Object?>? args,
}) {
  final language = locale.languageCode.toLowerCase();
  final primary = language == 'en'
      ? _enUS
      : isTraditionalLocale(locale)
      ? _zhTW
      : _zhCN;
  final value = primary[key] ?? _zhCN[key] ?? _enUS[key] ?? key;
  return _interpolate(value, args);
}

bool hasAppString(String key) =>
    _zhCN.containsKey(key) || _zhTW.containsKey(key) || _enUS.containsKey(key);

String _interpolate(String value, Map<String, Object?>? args) {
  if (args == null || args.isEmpty || !value.contains('{')) return value;
  var result = value;
  for (final entry in args.entries) {
    result = result.replaceAll('{${entry.key}}', '${entry.value}');
  }
  return result;
}
