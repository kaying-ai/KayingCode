import 'dart:convert';
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart' as mobile;
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_windows/webview_windows.dart' as windows;

import '../l10n/strings.dart';
import '../protocol/backend/backend_type.dart';
import '../state/account_store.dart';
import '../state/recent_projects.dart';
import 'theme.dart';
import 'bot_webview_uri.dart';
import '../platform/file_picker.dart';

Uri zcodeWebviewUri(Account account) {
  final uri = Uri.tryParse(account.url.trim());
  if (account.backendType != BackendType.zcode ||
      account.params == null ||
      uri == null ||
      uri.scheme != 'https') {
    throw const FormatException('Invalid ZCode webpage URL');
  }
  // 网页用 app_version 与原始配对字段选择兼容入口，不能由 relay origin 重建 URL。
  return uri;
}

Future<void>? _windowsEnvironment;

Future<void> _prepareWindowsEnvironment() => _windowsEnvironment ??= () async {
  try {
    if (await windows.WebviewController.getWebViewVersion() == null) {
      throw StateError('WebView2 runtime unavailable');
    }
    final support = await getApplicationSupportDirectory();
    // 固定应用私有 profile，关闭/重新打开页面保留网站自己的登录状态。
    await windows.WebviewController.initializeEnvironment(
      userDataPath: '${support.path}/zcode-webview',
    );
  } catch (_) {
    _windowsEnvironment = null;
    rethrow;
  }
}();

class BotWebviewRoute extends MaterialPageRoute<void> {
  BotWebviewRoute({required super.builder});

  final _isAgentPage = ValueNotifier(false);
  ValueListenable<bool> get isAgentPage => _isAgentPage;

  @override
  void dispose() {
    _isAgentPage.dispose();
    super.dispose();
  }
}

/// 网页拥有登录和会话；本页面只管理浏览器生命周期，不接入 AppSession。
class BotWebviewPage extends StatefulWidget {
  final Account account;
  final AccountStore? store;
  final String? workspaceKey;
  final String? deviceSid;
  const BotWebviewPage({
    super.key,
    required this.account,
    this.store,
    this.workspaceKey,
    this.deviceSid,
  });

  static Future<void> open(
    BuildContext context,
    Account account,
    AccountStore store, {
    String? workspaceKey,
    String? deviceSid,
  }) async {
    if (account.backendType != BackendType.kayingcode ||
        account.params == null) {
      throw const FormatException("Invalid Bot");
    }
    await store.touch(account.id);
    if (!context.mounted) return;
    await Navigator.of(context).push<void>(
      BotWebviewRoute(
        builder: (_) => BotWebviewPage(
          account: account,
          store: store,
          workspaceKey: workspaceKey,
          deviceSid: deviceSid,
        ),
      ),
    );
  }

  @override
  State<BotWebviewPage> createState() => _BotWebviewPageState();
}

class _BotWebviewPageState extends State<BotWebviewPage> {
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  BotWebviewRoute? _route;
  windows.WebviewController? _windows;
  mobile.WebViewController? _mobile;
  Uri? _uri;
  String? _windowsUrl;
  bool get _isKayingcode =>
      widget.account.backendType == BackendType.kayingcode;
  bool _initializing = false;
  bool _loading = true;
  bool _failed = false;
  bool _canGoBack = false;
  int _documentGeneration = 0;
  int _pageReportSequence = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_initialize());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    _route = route is BotWebviewRoute ? route : null;
  }

  void _update(VoidCallback change) {
    if (mounted) setState(change);
  }

  Future<void> _initialize() async {
    if (_initializing) return;
    _initializing = true;
    _update(() {
      _loading = true;
      _failed = false;
    });
    try {
      if (kIsWeb ||
          ![
            TargetPlatform.android,
            TargetPlatform.iOS,
            TargetPlatform.macOS,
            TargetPlatform.windows,
          ].contains(defaultTargetPlatform)) {
        throw UnsupportedError('Embedded browser unavailable');
      }
      final original = await resolveKayingcodeWebviewUri(widget.account);
      final uri = _uri ??= original.replace(
        queryParameters: {
          ...original.queryParameters,
          'kayingShell': '1',
          'kayingPlatform': 'flutter',
          if (widget.workspaceKey != null)
            'kayingWorkspace': widget.workspaceKey!,
          if (widget.deviceSid != null) 'sid': widget.deviceSid!,
        },
      );
      if (!mounted) return;
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.windows) {
        await _prepareWindowsEnvironment();
        if (!mounted) return;
        final controller = windows.WebviewController();
        try {
          await controller.initialize();
        } catch (_) {
          await controller.dispose();
          rethrow;
        }
        if (!mounted) {
          await controller.dispose();
          return;
        }
        _windows = controller;
        _subscriptions.add(
          controller.url.listen((url) {
            _windowsUrl = url;
            if (!_isTrustedPage(url)) _resetPagePresentation();
          }),
        );
        _subscriptions.add(
          controller.loadingState.listen((state) {
            if (state == windows.LoadingState.loading) _resetPagePresentation();
            _update(() => _loading = state == windows.LoadingState.loading);
          }),
        );
        _subscriptions.add(
          controller.historyChanged.listen((history) {
            _update(() => _canGoBack = history.canGoBack);
          }),
        );
        _subscriptions.add(
          controller.onLoadError.listen((_) {
            _showLoadError();
          }),
        );
        _subscriptions.add(
          controller.webMessage.listen((message) {
            unawaited(_onWebMessage(message));
          }),
        );
        // 官方登录使用新窗口时在同一容器继续，Cookie 与回调保持同一 profile。
        await controller.setPopupWindowPolicy(
          windows.WebviewPopupWindowPolicy.sameWindow,
        );
        if (!mounted) return;
        await controller.loadUrl(uri.toString());
      } else if (!kIsWeb &&
          [
            TargetPlatform.android,
            TargetPlatform.iOS,
            TargetPlatform.macOS,
          ].contains(defaultTargetPlatform)) {
        final controller = mobile.WebViewController();
        _mobile = controller;
        await controller.setJavaScriptMode(mobile.JavaScriptMode.unrestricted);
        await controller.addJavaScriptChannel(
          'KayingProjects',
          onMessageReceived: (message) {
            unawaited(_onWebMessage(message.message));
          },
        );
        await controller.addJavaScriptChannel(
          'KayingNavigation',
          onMessageReceived: (message) {
            unawaited(_onWebMessage(message.message));
          },
        );
        if (controller.platform is AndroidWebViewController) {
          // Android 插件缺省直接回空列表，网页文件按钮不会打开选择器；显式接入现有平台端口。
          await (controller.platform as AndroidWebViewController)
              .setOnShowFileSelector((params) async {
                if (!mounted || params.mode == FileSelectorMode.save) return [];
                final result = await FilePicker.platform.pickFiles(
                  allowMultiple: params.mode == FileSelectorMode.openMultiple,
                );
                if (!mounted) return [];
                return result?.files
                        .where((file) => file.path != null)
                        .map((file) => Uri.file(file.path!).toString())
                        .toList() ??
                    [];
              });
        }
        await controller.setNavigationDelegate(
          mobile.NavigationDelegate(
            onNavigationRequest: (request) async {
              if (_isTrustedPage(request.url)) {
                return mobile.NavigationDecision.navigate;
              }
              return mobile.NavigationDecision.prevent;
            },
            onPageStarted: (_) {
              _resetPagePresentation();
              _update(() {
                _loading = true;
                _failed = false;
              });
            },
            onPageFinished: (_) async {
              final back = await controller.canGoBack();
              _update(() {
                _loading = false;
                _canGoBack = back;
              });
            },
            onWebResourceError: (error) {
              if (error.isForMainFrame == true) {
                _showLoadError();
              }
            },
          ),
        );
        if (!mounted) return;
        await controller.loadRequest(uri);
      } else {
        throw UnsupportedError('Embedded browser unavailable');
      }
      _update(() {});
    } catch (_) {
      // 平台错误可能包含连接 URL；仅展示通用错误，避免暴露配对信息。
      _showLoadError();
    } finally {
      _initializing = false;
    }
  }

  void _setAgentPage(bool isAgentPage) {
    if (mounted) _route?._isAgentPage.value = isAgentPage;
  }

  bool _isTrustedPage(String? url) {
    final page = url == null ? null : Uri.tryParse(url);
    final entry = _uri;
    return page != null &&
        entry != null &&
        page.scheme == entry.scheme &&
        page.host == entry.host &&
        page.port == entry.port;
  }

  void _resetPagePresentation() {
    _documentGeneration++;
    _setAgentPage(false);
  }

  void _showLoadError() {
    _resetPagePresentation();
    _update(() {
      _loading = false;
      _failed = true;
    });
  }

  Future<void> _onWebMessage(dynamic message) async {
    if (!mounted) return;
    final generation = _documentGeneration;
    try {
      final value = message is String ? jsonDecode(message) : message;
      if (value is! Map) return;
      final isPageReport = value['type'] == 'kayingcode.mobile-page.v1';
      final page = value['page'];
      if (isPageReport && page != 'browse' && page != 'agent') return;
      final sequence = isPageReport ? ++_pageReportSequence : null;
      final current = _mobile != null
          ? await _mobile!.currentUrl()
          : _windowsUrl;
      // 新文档或外部页面的迟到消息不能改变当前路由的底栏或写入项目记录。
      if (!mounted ||
          generation != _documentGeneration ||
          !_isTrustedPage(current)) {
        return;
      }
      if (isPageReport) {
        final canGoBack = await _mobile?.canGoBack();
        if (mounted &&
            !_failed &&
            generation == _documentGeneration &&
            sequence == _pageReportSequence) {
          if (canGoBack != null) _update(() => _canGoBack = canGoBack);
          _setAgentPage(page == 'agent');
        }
        return;
      }
      final store = widget.store;
      if (store != null) {
        await RecentProjects.remember(store, widget.account.id, value);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr(context, 'project.saveFailed'))),
        );
      }
    }
  }

  Future<void> _reload() async {
    if (_initializing) return;
    if (_windows == null && _mobile == null) return _initialize();
    _resetPagePresentation();
    _update(() {
      _failed = false;
      _loading = true;
    });
    try {
      if (_windows != null) {
        await _windows!.reload();
      } else {
        await _mobile!.reload();
      }
    } catch (_) {
      _showLoadError();
    }
  }

  Future<void> _back() async {
    if (!_canGoBack) {
      Navigator.of(context).pop();
      return;
    }
    if (_windows != null) {
      await _windows!.goBack();
    } else {
      await _mobile?.goBack();
    }
  }

  Future<void> _openExternal() async {
    try {
      final uri =
          _uri ??
          (_isKayingcode
              ? await resolveKayingcodeWebviewUri(widget.account)
              : zcodeWebviewUri(widget.account));
      if (await launchUrl(
        uri.replace(
          queryParameters: {...uri.queryParameters}..remove('kayingPlatform'),
        ),
        mode: LaunchMode.externalApplication,
      )) {
        return;
      }
    } catch (_) {
      /* 只展示通用错误，不输出连接串。 */
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'zcodeWeb.openFailed'))),
      );
    }
  }

  @override
  void dispose() {
    for (final sub in _subscriptions) {
      unawaited(sub.cancel());
    }
    unawaited(_windows?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return PopScope(
      canPop: !_canGoBack,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_back());
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        body: SafeArea(
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (_failed)
                _buildError()
              else if (_windows case final controller?)
                windows.Webview(controller)
              else if (_mobile case final controller?)
                mobile.WebViewWidget(controller: controller),
              if (_loading)
                const Align(
                  alignment: Alignment.topCenter,
                  child: LinearProgressIndicator(minHeight: 2),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(EmberSpacing.page),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.public_off_outlined, size: 36),
            const SizedBox(height: EmberSpacing.gapM),
            Text(
              tr(
                context,
                _isKayingcode ? 'zcodeWeb.kayingcodeFailed' : 'zcodeWeb.failed',
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: EmberSpacing.gapM),
            FilledButton(
              onPressed: _reload,
              child: Text(tr(context, 'zcodeWeb.reload')),
            ),
            TextButton(
              onPressed: _openExternal,
              child: Text(tr(context, 'zcodeWeb.external')),
            ),
          ],
        ),
      ),
    );
  }
}

// 兼容既有引用；两种后端共用容器，入口解析保持各自协议。
typedef ZcodeWebviewPage = BotWebviewPage;
