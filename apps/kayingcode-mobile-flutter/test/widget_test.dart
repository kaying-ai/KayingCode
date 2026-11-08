import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/notifications/notifications.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/app_session.dart';
import 'package:kayingcode_mobile/ui/settings_page.dart';
import 'package:kayingcode_mobile/ui/theme.dart';

void main() {
  testWidgets(
    'iOS settings omit Android services and APK updates',
    (tester) async {
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
          theme: buildLightTheme(),
          home: Scaffold(
            body: SettingsPage(
              store: store,
              session: session,
              onDisconnect: () {},
            ),
          ),
        ),
      );
      expect(Notifications.isSupported, isFalse);
      expect(find.text('后台与通知'), findsNothing);
      expect(find.text('检查更新'), findsNothing);
      expect(find.text('设备管理'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      store.dispose();
      session.dispose();
    },
    variant: TargetPlatformVariant({TargetPlatform.iOS}),
  );
}
