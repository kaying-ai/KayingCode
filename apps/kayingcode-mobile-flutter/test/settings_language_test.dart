import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/app_session.dart';
import 'package:kayingcode_mobile/ui/settings_page.dart';
import 'package:kayingcode_mobile/ui/theme.dart';
import 'package:kayingcode_mobile/ui/ui_settings.dart';

void main() {
  testWidgets('设置页提供跟随系统与四语选项，切换后持久化', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final ui = UiSettings();
    await ui.load();
    final store = AccountStore();
    final session = AppSession(store: store);
    final theme = ThemeController();
    addTearDown(() async {
      await session.dispose();
      store.dispose();
      theme.dispose();
    });

    await tester.pumpWidget(
      MaterialApp(
        locale: appLocaleZhCN,
        supportedLocales: supportedAppLocales,
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: buildLightTheme(),
        home: UiSettingsProvider(
          settings: ui,
          child: Scaffold(
            body: SettingsPage(
              section: SettingsSection.appearance,
              store: store,
              session: session,
              onDisconnect: () {},
              themeController: theme,
            ),
          ),
        ),
      ),
    );

    expect(find.widgetWithText(ChoiceChip, '跟随系统'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, '简体中文'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, '繁體中文'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, 'English'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, 'Русский'), findsOneWidget);
    expect(ui.language, AppLanguage.system);

    await tester.tap(find.widgetWithText(ChoiceChip, 'Русский'));
    await tester.pumpAndSettle();
    expect(ui.language, AppLanguage.ruRU);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('zflow_ui_locale'), 'ru-RU');
    expect(tester.takeException(), isNull);
  });
}
