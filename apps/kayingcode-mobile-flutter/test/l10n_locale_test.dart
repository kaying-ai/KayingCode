import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/l10n/strings.dart';

void main() {
  tearDown(AppLocale.resetForTest);

  test('系统语言解析：繁中、简中、英文与其他语言', () {
    expect(resolveAppLocale([const Locale('zh', 'CN')]), appLocaleZhCN);
    expect(resolveAppLocale([const Locale('zh', 'SG')]), appLocaleZhCN);
    expect(resolveAppLocale([const Locale('zh')]), appLocaleZhCN);
    expect(
      resolveAppLocale([
        const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant'),
      ]),
      appLocaleZhTW,
    );
    expect(resolveAppLocale([const Locale('zh', 'TW')]), appLocaleZhTW);
    expect(resolveAppLocale([const Locale('zh', 'HK')]), appLocaleZhTW);
    expect(resolveAppLocale([const Locale('zh', 'MO')]), appLocaleZhTW);
    expect(resolveAppLocale([const Locale('en', 'GB')]), appLocaleEnUS);
    expect(resolveAppLocale([const Locale('ja', 'JP')]), appLocaleZhCN);
    expect(resolveAppLocale(const []), appLocaleZhCN);
  });

  test('系统语言列表取第一个可识别项', () {
    expect(
      resolveAppLocale(const [
        Locale('ja', 'JP'),
        Locale('en', 'US'),
        Locale('zh', 'CN'),
      ]),
      appLocaleEnUS,
    );
  });

  test('显式选择覆盖系统语言', () {
    expect(
      effectiveAppLocale(
        override: AppLanguage.system,
        systemLocales: const [Locale('en', 'US')],
      ),
      appLocaleEnUS,
    );
    expect(
      effectiveAppLocale(
        override: AppLanguage.zhTW,
        systemLocales: const [Locale('en', 'US')],
      ),
      appLocaleZhTW,
    );
    expect(
      effectiveAppLocale(
        override: AppLanguage.zhCN,
        systemLocales: const [Locale('zh', 'TW')],
      ),
      appLocaleZhCN,
    );
    expect(
      effectiveAppLocale(
        override: AppLanguage.enUS,
        systemLocales: const [Locale('zh', 'CN')],
      ),
      appLocaleEnUS,
    );
  });

  test('偏好编码往返，未知编码回落到跟随系统', () {
    for (final language in AppLanguage.values) {
      expect(appLanguageFromCode(appLanguageToCode(language)), language);
    }
    expect(appLanguageFromCode(null), AppLanguage.system);
    expect(appLanguageFromCode('fr-FR'), AppLanguage.system);
  });

  test('t() 按 AppLocale 快照取文案并替换占位符', () {
    AppLocale.update(appLocaleZhCN);
    expect(t('notify.running', args: {'count': 2}), '2 个任务运行中');
    AppLocale.update(appLocaleZhTW);
    expect(t('notify.running', args: {'count': 2}), '2 個任務執行中');
    AppLocale.update(appLocaleEnUS);
    expect(t('notify.running', args: {'count': 2}), '2 tasks running');
  });

  test('缺失参数保留占位符，缺失 key 返回 key 本身', () {
    AppLocale.update(appLocaleZhCN);
    expect(t('notify.running'), contains('{count}'));
    expect(t('l10n.missing.key'), 'l10n.missing.key');
    expect(
      lookupAppString(appLocaleZhTW, 'l10n.missing.key'),
      'l10n.missing.key',
    );
  });

  test('繁体 locale 判定', () {
    expect(isTraditionalLocale(const Locale('zh', 'TW')), isTrue);
    expect(isTraditionalLocale(const Locale('zh', 'HK')), isTrue);
    expect(isTraditionalLocale(const Locale('zh', 'CN')), isFalse);
    expect(isTraditionalLocale(const Locale('en', 'US')), isFalse);
  });
}
