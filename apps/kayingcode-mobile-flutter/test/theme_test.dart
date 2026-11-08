import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/ui/theme.dart';
import 'package:kayingcode_mobile/ui/device_management_page.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/app_session.dart';
import 'package:kayingcode_mobile/protocol/backend/backend_type.dart';

double contrast(Color a, Color b) {
  final x = a.computeLuminance();
  final y = b.computeLuminance();
  return ((x > y ? x : y) + .05) / ((x > y ? y : x) + .05);
}

void main() {
  for (final dark in [false, true]) {
    testWidgets(
      '${dark ? 'dark' : 'light'} controls stay neutral and readable',
      (tester) async {
        final theme = dark ? buildDarkTheme() : buildLightTheme();
        final c = dark ? const EmberColors.dark() : const EmberColors.light();
        expect(
          contrast(theme.colorScheme.primary, theme.colorScheme.onPrimary),
          greaterThanOrEqualTo(4.5),
        );
        for (final foreground in [c.textSolid, c.textMuted, c.textFaint]) {
          expect(contrast(foreground, c.card), greaterThanOrEqualTo(4.5));
        }
        for (final color in [
          c.bg,
          c.card,
          c.raise,
          c.primary,
          c.codeText,
          theme.colorScheme.tertiary,
          theme.colorScheme.primaryContainer,
        ]) {
          expect(color.r, color.g);
          expect(color.g, color.b);
        }
        await tester.pumpWidget(
          MaterialApp(
            locale: appLocaleZhCN,
            supportedLocales: supportedAppLocales,
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            theme: theme,
            home: Scaffold(
              body: Column(
                children: [
                  FilledButton(onPressed: () {}, child: const Text('添加设备')),
                  const TextField(
                    decoration: InputDecoration(hintText: '输入消息'),
                  ),
                  SegmentedButton<int>(
                    segments: const [
                      ButtonSegment(value: 0, label: Text('深色')),
                      ButtonSegment(value: 1, label: Text('浅色')),
                    ],
                    selected: const {0},
                    onSelectionChanged: (_) {},
                  ),
                ],
              ),
            ),
          ),
        );
        final text = tester.element(find.text('添加设备'));
        expect(
          DefaultTextStyle.of(text).style.color,
          theme.colorScheme.onPrimary,
        );
        await tester.tap(find.byType(TextField));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('device card fits narrow screen with large text', (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = _DeviceStore();
    final session = AppSession(store: store);
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
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(1.4)),
          child: child!,
        ),
        home: DeviceManagementPage(store: store, session: session),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('KayingCode'), findsOneWidget);
    expect(find.byTooltip('重命名'), findsOneWidget);
    expect(find.byTooltip('删除'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    store.dispose();
  });
  test('existing theme preference persists across controllers', () async {
    SharedPreferences.setMockInitialValues({'zflow_theme_mode': 'light'});
    final controller = ThemeController();
    await controller.load();
    expect(controller.mode, ThemeMode.light);
    await controller.setMode(ThemeMode.system);
    final restored = ThemeController();
    await restored.load();
    expect(restored.mode, ThemeMode.system);
    controller.dispose();
    restored.dispose();
  });
}

class _DeviceStore extends AccountStore {
  @override
  bool get loaded => true;
  @override
  List<Account> get accounts => [
    Account(
      id: 'visual-test',
      label: 'KayingCode Device with a long name',
      url: 'https://example.com#test-pairing#test-secret',
      addedAt: 0,
      backendType: BackendType.kayingcode,
    ),
  ];
}
