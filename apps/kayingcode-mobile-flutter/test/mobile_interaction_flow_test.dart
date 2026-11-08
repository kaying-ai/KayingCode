import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/app_session.dart';
import 'package:kayingcode_mobile/state/credential_storage.dart';
import 'package:kayingcode_mobile/state/recent_projects.dart';
import 'package:kayingcode_mobile/ui/root_shell.dart';
import 'package:kayingcode_mobile/ui/theme.dart';

class _Storage implements CredentialStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String data) async {
    value = data;
  }
}

void main() {
  testWidgets('三个 Tab、项目重启恢复与空列表不创建原生连接', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = AccountStore(storage: _Storage());
    await store.load();
    final account = await store.addUrl(
      'https://example.test/remote/v4?sid=test#authorize=${'A' * 43}',
    );
    await RecentProjects.remember(store, account.id, {
      'type': 'kayingcode.project-opened.v1',
      'workspacePath': '/games/demo',
      'workspaceIdentity': 'host-a',
    });
    var connections = 0;
    final session = AppSession(
      store: store,
      adapterFactory: (_, _, _) {
        connections++;
        throw StateError('native connection forbidden');
      },
    );
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
        home: RootShell(store: store, session: session, autoConnect: false),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('连接 ZCode'), findsNothing);
    expect(find.text('会话列表'), findsWidgets);
    expect(
      find.text('打开 Web 工作台管理会话和终端；连接管理见右上角。'),
      findsOneWidget,
    );
    await tester.tap(find.text('项目列表'));
    await tester.pumpAndSettle();
    expect(find.text('最近打开的工作区'), findsOneWidget);
    expect(find.text('1 个项目'), findsOneWidget);
    expect(find.text('demo'), findsOneWidget);
    await tester.tap(find.text('我的'));
    await tester.pumpAndSettle();
    final diagnostics = find.text('诊断与关于');
    await tester.ensureVisible(diagnostics);
    await tester.tap(diagnostics);
    await tester.pumpAndSettle();
    expect(find.byType(AppBar), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
    await tester.tap(find.text('项目列表'));
    await tester.pumpAndSettle();
    expect(find.text('demo'), findsOneWidget);
    expect(find.byType(AppBar), findsNothing);
    expect(connections, 0);
    expect(session.current, isNull);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    store.dispose();
  });
}
