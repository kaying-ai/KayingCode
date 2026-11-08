import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/brand/licenses.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/app_session.dart';
import 'package:kayingcode_mobile/ui/settings_page.dart';

void main() {
  test(
    'bundled license texts preserve upstream copyright and font terms',
    () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      registerKayingCodeLicenses();
      final entries = await LicenseRegistry.licenses.toList();
      final byName = {
        for (final entry in entries)
          for (final package in entry.packages)
            package: entry.paragraphs
                .map((paragraph) => paragraph.text)
                .join('\n'),
      };
      expect(
        byName['Zflow'],
        contains('Copyright (c) 2026 Zemote contributors'),
      );
      expect(
        byName['Sarasa Gothic SC'],
        contains('SIL Open Font License v1.1'),
      );
      expect(byName['KayingCode'], contains('Apache License'));
    },
  );

  testWidgets('settings presents KayingCode identity and open-source notices', (
    tester,
  ) async {
    final store = AccountStore();
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
        home: Scaffold(
          body: SettingsPage(
            store: store,
            session: session,
            onDisconnect: () {},
          ),
        ),
      ),
    );
    await tester.drag(find.byType(ListView).first, const Offset(0, -650));
    await tester.pumpAndSettle();
    expect(find.textContaining('KayingCode v'), findsOneWidget);
    expect(find.text('检查更新'), findsNothing);
    await tester.tap(find.text('关于').last);
    await tester.pumpAndSettle();
    expect(find.text('KayingCode'), findsWidgets);
    expect(find.textContaining('Zemote contributors'), findsOneWidget);
    expect(find.text('开源许可'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    store.dispose();
  });
}
