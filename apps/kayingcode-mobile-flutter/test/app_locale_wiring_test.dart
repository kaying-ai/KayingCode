import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/main.dart';

void main() {
  testWidgets('根 MaterialApp 在语言切换后立即更新 locale', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'zflow_ui_locale': 'zh-CN',
    });
    const secureStorage = MethodChannel(
      'plugins.it_nomads.com/flutter_secure_storage',
    );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorage, (_) async => null);
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(secureStorage, null),
    );

    await tester.pumpWidget(const ZflowApp());
    await tester.pumpAndSettle();
    expect(find.text('连接 KayingCode'), findsOneWidget);

    await tester.tap(find.byTooltip('设置'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('外观与语言'));
    await tester.pumpAndSettle();
    expect(find.text('语言'), findsOneWidget);

    await tester.tap(find.widgetWithText(ChoiceChip, '繁體中文'));
    await tester.pumpAndSettle();

    expect(AppLocale.current, appLocaleZhTW);
    expect(find.text('語言'), findsOneWidget);
    expect(find.text('外觀與語言'), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('zflow_ui_locale'), 'zh-TW');

    await tester.tap(find.widgetWithText(ChoiceChip, 'Русский'));
    await tester.pumpAndSettle();

    expect(AppLocale.current, appLocaleRuRU);
    expect(find.text('Язык'), findsOneWidget);
    expect(find.text('Оформление и язык'), findsOneWidget);
    expect(prefs.getString('zflow_ui_locale'), 'ru-RU');
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
