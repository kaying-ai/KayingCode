import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'l10n/app_locale.dart';
import 'protocol/relay_client.dart';
import 'state/account_store.dart';
import 'state/app_session.dart';
import 'state/crash_report.dart';
import 'state/log_store.dart';
import 'brand/licenses.dart';
import 'ui/root_shell.dart';
import 'ui/theme.dart';
import 'ui/ui_settings.dart';
import 'notifications/keep_alive.dart';
import 'notifications/notifications.dart';
import 'state/background_prefs.dart';

final navigatorKey = GlobalKey<NavigatorState>();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  registerKayingCodeLicenses();

  // Flutter 的原生启动页会一直保留到首帧。先挂载 UI，避免插件或磁盘
  // IO 在审核设备上变慢时让应用看起来卡在黑屏且所有控件无响应。
  RelayClient.verboseFrames = kDebugMode;
  runApp(const ZflowApp());
  WidgetsBinding.instance.addPostFrameCallback((_) {
    unawaited(_initializeStartupDiagnostics());
  });
}

Future<void> _initializeStartupDiagnostics() async {
  // Verbose per-frame relay logging: debug default, release reads the
  // toggle persisted by 设置 → 协议帧日志（详细）.
  try {
    final prefs = await SharedPreferences.getInstance();
    RelayClient.verboseFrames =
        prefs.getBool('relayVerboseFrames') ?? kDebugMode;
  } catch (_) {
    RelayClient.verboseFrames = kDebugMode;
  }

  // Crash evidence: persist the last framework/uncaught error so it
  // survives the process and can be inspected on the next launch.
  if (!kIsWeb) {
    try {
      final dir = await getApplicationSupportDirectory();
      final store = CrashStore(File('${dir.path}/last_crash.json'));
      crashStore = store;
      installCrashHandlers(store);
      final last = await store.read();
      if (last != null) {
        log(
          '[诊断] 检测到上次异常退出（${last.kind} · ${last.error.split('\n').first}）— '
          '详情见 设置 → 上次崩溃',
        );
      }
    } catch (_) {
      // Crash evidence is best-effort; never block startup.
    }
  }
}

class ZflowApp extends StatefulWidget {
  const ZflowApp({super.key});

  @override
  State<ZflowApp> createState() => _ZflowAppState();
}

class _ZflowAppState extends State<ZflowApp> with WidgetsBindingObserver {
  final AccountStore _store = AccountStore();
  late final AppSession _session = AppSession(store: _store);
  final ThemeController _theme = ThemeController();
  final UiSettings _uiSettings = UiSettings();
  KeepAliveController? _keepAlive;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    notificationsService.init();
    // 配对设备启动即加载:否则冷启动后设备选择器为空,要进一次设备
    // 管理页才会出现(RootShell 监听 store,加载完成会自行刷新)。
    _store.load();
    _theme.load();
    _uiSettings.load();
    loadDiagLogPref();
    // 后台保活(设置 → 后台与通知):偏好/设备列表/回前台都会重新对齐
    // 前台服务。非 Android 平台为 no-op。
    BackgroundPrefs.instance.load();
    _keepAlive = KeepAliveController(
      store: _store,
      prefs: BackgroundPrefs.instance,
      notifications: notificationsService,
    )..start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _keepAlive?.dispose();
    super.dispose();
  }

  @override
  void didChangeLocales(List<Locale>? locales) {
    // 跟随系统时，系统语言切换需要重新计算生效 locale。
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return ThemeControllerProvider(
      controller: _theme,
      child: UiSettingsProvider(
        settings: _uiSettings,
        child: AnimatedBuilder(
          animation: Listenable.merge([_theme, _uiSettings]),
          // 语言必须在 builder 内解析：UiSettings 通知只重建该 builder，
          // 外层 build 不会重跑，放在外面会让 MaterialApp.locale 停在旧值。
          builder: (context, _) {
            final locale = effectiveAppLocale(
              override: _uiSettings.language,
              systemLocales:
                  WidgetsBinding.instance.platformDispatcher.locales,
            );
            // 派生只读快照，供通知与连接错误等无 BuildContext 的路径使用。
            AppLocale.update(locale);
            return MaterialApp(
              title: 'KayingCode',
              debugShowCheckedModeBanner: false,
              navigatorKey: navigatorKey,
              locale: locale,
              supportedLocales: supportedAppLocales,
              localizationsDelegates: const [
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              theme: buildLightTheme(),
              darkTheme: buildDarkTheme(),
              themeMode: _theme.mode,
              home: RootShell(store: _store, session: _session),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(_uiSettings.textScale)),
                child: child ?? const SizedBox.shrink(),
              ),
            );
          },
        ),
      ),
    );
  }
}
