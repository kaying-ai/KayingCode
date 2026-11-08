import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_windows/webview_windows.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/app_session.dart';
import 'package:kayingcode_mobile/state/credential_storage.dart';
import 'package:kayingcode_mobile/ui/root_shell.dart';
import 'package:kayingcode_mobile/ui/theme.dart';
import 'package:kayingcode_mobile/ui/zcode_webview_page.dart';

class _Storage implements CredentialStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String data) async => value = data;
}

void main() {
  const url =
      'https://zcode.z.ai/remote/v4?sid=test-device&mid=test-machine'
      '&name=Test%20PC&app_version=3.16.3';

  test(
    'ZCode webpage preserves the complete V2 URL and rejects legacy proof',
    () {
      expect(zcodeWebviewUri(Account.fromUrl(url)).toString(), url);
      expect(
        () => zcodeWebviewUri(Account.fromUrl('$url&hash=old&t=123')),
        throwsFormatException,
      );
    },
  );

  test('webpage route rejects other backends and insecure links', () {
    expect(
      () => zcodeWebviewUri(
        Account.fromUrl('http://zcode.z.ai/remote/v4?sid=test'),
      ),
      throwsFormatException,
    );
    expect(
      () => zcodeWebviewUri(
        Account.fromUrl('https://example.test/#pairing#secret'),
      ),
      throwsFormatException,
    );
  });

  testWidgets(
    'Windows lists and errors keep tabs, Agent pages hide them',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 640);
      addTearDown(tester.view.reset);
      final messenger = tester.binding.defaultBinaryMessenger;
      const plugin = MethodChannel('io.jns.webview.win');
      const controller = MethodChannel('io.jns.webview.win/42');
      const events = MethodChannel('io.jns.webview.win/42/events');
      messenger.setMockMethodCallHandler(plugin, (call) async {
        return switch (call.method) {
          'getWebViewVersion' => 'test',
          'initialize' => {'textureId': 42},
          _ => null,
        };
      });
      messenger.setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (_) async => 'C:/test-profile',
      );
      var reloads = 0;
      var webBacks = 0;
      String? loadedUrl;
      messenger.setMockMethodCallHandler(controller, (call) async {
        if (call.method == 'reload') reloads++;
        if (call.method == 'goBack') webBacks++;
        if (call.method == 'loadUrl') loadedUrl = call.arguments as String;
        return null;
      });
      messenger.setMockMethodCallHandler(events, (_) async => null);
      Future<void> emit(String type, Object value) async {
        await messenger.handlePlatformMessage(
          events.name,
          const StandardMethodCodec().encodeSuccessEnvelope({
            'type': type,
            'value': value,
          }),
          (_) {},
        );
        await tester.pumpAndSettle();
      }

      SharedPreferences.setMockInitialValues({});
      final store = AccountStore(storage: _Storage());
      await store.load();
      await store.addUrl('$url#authorize=${'A' * 43}');
      final session = AppSession(store: store);
      await tester.pumpWidget(
        MaterialApp(
          locale: appLocaleZhCN,
          supportedLocales: supportedAppLocales,
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          theme: buildLightTheme(),
          home: RootShell(store: store, session: session, autoConnect: false),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Test PC'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await emit('loadingStateChanged', LoadingState.navigationCompleted.index);

      expect(
        Uri.parse(loadedUrl!).queryParameters['kayingPlatform'],
        'flutter',
      );
      await emit('urlChanged', loadedUrl!);
      const agent = '{"type":"kayingcode.mobile-page.v1","page":"agent"}';
      const browse = '{"type":"kayingcode.mobile-page.v1","page":"browse"}';
      final tabs = find.byType(NavigationBar);
      expect(find.byType(AppBar), findsNothing);
      expect(find.text('Test PC'), findsNothing);
      expect(find.byType(PopupMenuButton), findsNothing);
      expect(tabs, findsOneWidget);
      expect(
        tester.getRect(find.byType(Webview)),
        const Rect.fromLTWH(0, 0, 320, 576),
      );
      await emit('urlChanged', 'https://other.example.test/remote/v4');
      await emit('webMessageReceived', agent);
      expect(tabs, findsOneWidget);
      await emit('urlChanged', loadedUrl!);
      await emit('webMessageReceived', agent);
      expect(tabs, findsNothing);
      expect(tester.getSize(find.byType(Webview)).height, 640);
      await emit('historyChanged', {'canGoBack': true, 'canGoForward': false});
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(webBacks, 1);
      await emit('webMessageReceived', browse);
      expect(tabs, findsOneWidget);
      await emit('webMessageReceived', agent);
      await emit('onLoadError', WebErrorStatus.WebErrorStatusTimeout.index);
      expect(tabs, findsOneWidget);
      expect(find.byType(Webview), findsNothing);
      expect(find.text('在浏览器打开'), findsOneWidget);
      expect(find.text('关闭'), findsNothing);
      await tester.tap(find.text('刷新'));
      await tester.pump();
      await emit('loadingStateChanged', LoadingState.navigationCompleted.index);
      expect(reloads, 1);
      expect(tester.getTopLeft(find.byType(Webview)), Offset.zero);
      await tester.tap(find.text('项目列表'));
      await tester.pumpAndSettle();
      expect(find.byType(BotWebviewPage), findsNothing);
      expect(tester.widget<NavigationBar>(tabs).selectedIndex, 1);
      await tester.pumpWidget(const SizedBox.shrink());
      session.dispose();
      store.dispose();
    },
    variant: TargetPlatformVariant({TargetPlatform.windows}),
  );

  for (final autoConnect in [false, true]) {
    testWidgets(
      'KayingCode ${autoConnect ? 'cold start' : 'tap'} uses webpage only',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        final store = AccountStore(storage: _Storage());
        await store.load();
        await store.addUrl('$url#authorize=${'A' * 43}');
        var nativeConnections = 0;
        final session = AppSession(
          store: store,
          adapterFactory: (_, _, _) {
            nativeConnections++;
            throw StateError('Native ZCode must not be constructed');
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
            home: RootShell(
              store: store,
              session: session,
              autoConnect: autoConnect,
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (!autoConnect) {
          await tester.tap(find.text('Test PC'));
          await tester.pumpAndSettle();
        }
        expect(find.byType(ZcodeWebviewPage), findsOneWidget);
        expect(find.byType(AppBar), findsNothing);
        expect(find.text('刷新'), findsOneWidget);
        expect(find.text('在浏览器打开'), findsOneWidget);
        expect(find.textContaining('网页工作台'), findsNothing);
        expect(find.text('登录 ZCode'), findsNothing);
        expect(nativeConnections, 0);
        expect(session.current, isNull);
        expect(find.byType(NavigationBar), findsOneWidget);
        await tester.tap(find.byType(NavigationDestination).first);
        await tester.pumpAndSettle();
        expect(find.byType(ZcodeWebviewPage), findsNothing);
        await tester.tap(find.text('Test PC'));
        await tester.pumpAndSettle();
        expect(find.byType(ZcodeWebviewPage), findsOneWidget);
        expect(nativeConnections, 0);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        session.dispose();
        store.dispose();
      },
      variant: TargetPlatformVariant({TargetPlatform.linux}),
    );
  }
}
