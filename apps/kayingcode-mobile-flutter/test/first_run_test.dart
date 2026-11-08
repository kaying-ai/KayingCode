import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/protocol/backend/backend_type.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/app_session.dart';
import 'package:kayingcode_mobile/state/credential_storage.dart';
import 'package:kayingcode_mobile/ui/first_run_page.dart';
import 'package:kayingcode_mobile/ui/bot_list_page.dart';
import 'package:kayingcode_mobile/ui/root_shell.dart';
import 'package:kayingcode_mobile/ui/settings_page.dart';
import 'package:kayingcode_mobile/ui/theme.dart';

class _MemoryStorage implements CredentialStorage {
  final Completer<String?>? pendingRead;
  String? value;
  bool failReads = false;

  _MemoryStorage({this.pendingRead});

  @override
  Future<String?> read() {
    if (failReads) return Future.error(StateError('secure storage failed'));
    return pendingRead?.future ?? Future.value(value);
  }

  @override
  Future<void> write(String data) async => value = data;
}

void main() {
  testWidgets('first run waits for accounts, then offers KayingCode only', (
    tester,
  ) async {
    const urlLauncherChannel = MethodChannel('plugins.flutter.io/url_launcher');
    final launchCalls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(urlLauncherChannel, (call) async {
          launchCalls.add(call);
          return true;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(urlLauncherChannel, null),
    );

    SharedPreferences.setMockInitialValues({});
    final read = Completer<String?>();
    final store = AccountStore(storage: _MemoryStorage(pendingRead: read));
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
        home: RootShell(store: store, session: session, autoConnect: false),
      ),
    );
    expect(find.text('连接 ZCode'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    read.complete(null);
    await store.load();
    await tester.pumpAndSettle();
    expect(find.byType(FirstRunPage), findsOneWidget);
    expect(find.text('连接 KayingCode'), findsOneWidget);
    expect(find.text('连接 KayingCode'), findsOneWidget);
    expect(find.text('从备份导入设备'), findsOneWidget);
    expect(find.text('会话列表'), findsOneWidget);
    expect(find.text('项目列表'), findsOneWidget);
    expect(find.text('自动化'), findsNothing);

    await tester.tap(find.text('连接 KayingCode'));
    await tester.pumpAndSettle();
    expect(find.text('扫码添加'), findsOneWidget);
    expect(find.text('粘贴链接添加'), findsOneWidget);
    await tester.tap(find.text('粘贴链接添加'));
    await tester.pumpAndSettle();
    expect(find.text('粘贴连接信息'), findsOneWidget);
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    // pageBack() 按英文 tooltip 'Back' 查找；zh-CN 下返回按钮 tooltip 已本地化
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('连接 KayingCode'), findsOneWidget);

    await tester.tap(find.byTooltip('设置'));
    await tester.pumpAndSettle();
    expect(find.byType(SettingsHomePage), findsOneWidget);
    expect(find.text('隐私政策'), findsOneWidget);
    expect(
      find.text(
        'https://kayingai.com/policy/kayingcode-mobile-privacy-policy.html',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('隐私政策'));
    await tester.pumpAndSettle();
    expect(launchCalls, hasLength(1));
    expect(launchCalls.single.method, 'launch');
    expect(
      (launchCalls.single.arguments as Map)['url'],
      'https://kayingai.com/policy/kayingcode-mobile-privacy-policy.html',
    );

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(urlLauncherChannel, (_) async => false);
    await tester.tap(find.text('隐私政策'));
    await tester.pumpAndSettle();
    expect(find.text('隐私政策暂时无法打开，请稍后重试'), findsOneWidget);
    await tester.tap(find.text('会话列表'));
    await tester.pumpAndSettle();
    expect(find.text('连接 KayingCode'), findsOneWidget);

    await tester.tap(find.text('从备份导入设备'));
    await tester.pumpAndSettle();
    expect(find.text('设备管理'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('连接 KayingCode'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    store.dispose();
    session.dispose();
  });

  testWidgets('first run remains usable at 320px with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final selected = <BackendType>[];
    await tester.pumpWidget(
      MaterialApp(
        locale: appLocaleZhCN,
        supportedLocales: supportedAppLocales,
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: buildDarkTheme(),
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(320, 640),
            textScaler: TextScaler.linear(1.4),
          ),
          child: FirstRunPage(
            onConnect: selected.add,
            onImport: () {},
            onSettings: () {},
          ),
        ),
      ),
    );
    await tester.scrollUntilVisible(find.text('连接 KayingCode'), 120);
    await tester.tap(find.text('连接 KayingCode'));
    expect(selected, [BackendType.kayingcode]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('storage failure shows retry instead of an empty setup', (
    tester,
  ) async {
    final storage = _MemoryStorage()..failReads = true;
    final store = AccountStore(storage: storage);
    await store.load();
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
        home: RootShell(store: store, session: session, autoConnect: false),
      ),
    );
    expect(find.text('无法读取已保存的设备'), findsOneWidget);
    expect(find.text('连接 ZCode'), findsNothing);
    storage.failReads = false;
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();
    expect(find.text('连接 KayingCode'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    store.dispose();
    session.dispose();
  });

  testWidgets('closing the method sheet returns to backend choice', (
    tester,
  ) async {
    final store = AccountStore(storage: _MemoryStorage());
    await store.load();
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
        home: RootShell(store: store, session: session, autoConnect: false),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('连接 KayingCode'));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();
    expect(find.text('连接 KayingCode'), findsOneWidget);
    expect(find.text('设备管理'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    store.dispose();
    session.dispose();
  });

  testWidgets('stored devices skip setup; last removal restores it', (
    tester,
  ) async {
    final store = AccountStore(storage: _MemoryStorage());
    await store.load();
    final account = await store.addUrl(
      'https://relay.service.kaying.ai/remote/v4?sid=test#authorize=${'A' * 43}',
    );
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
        home: RootShell(store: store, session: session, autoConnect: false),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(FirstRunPage), findsNothing);
    expect(find.byType(BotListPage), findsOneWidget);
    await store.remove(account.id);
    await tester.pump();
    expect(find.text('连接 KayingCode'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    store.dispose();
    session.dispose();
  });

  testWidgets('invalid information stays in setup; valid link saves and exits', (
    tester,
  ) async {
    final store = AccountStore(storage: _MemoryStorage());
    await store.load();
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
        home: RootShell(store: store, session: session, autoConnect: false),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('连接 KayingCode'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('粘贴链接添加'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'invalid');
    await tester.tap(find.text('添加'));
    await tester.pumpAndSettle();
    expect(store.accounts, isEmpty);
    expect(find.text('设备管理'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);

    await tester.tap(find.text('添加设备'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('粘贴链接添加'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      'https://relay.service.kaying.ai/remote/v4?sid=test#authorize=${'A' * 43}',
    );
    await tester.tap(find.text('添加'));
    await tester.pumpAndSettle();
    expect(store.accounts, hasLength(1));
    expect(store.accounts.single.backendType, BackendType.kayingcode);
    expect(find.byType(BotListPage), findsOneWidget);
    expect(find.text('设备管理'), findsNothing);

    await tester.pumpWidget(const SizedBox.shrink());
    store.dispose();
    session.dispose();
  });
}
