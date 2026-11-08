import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../notifications/notifications.dart';
import '../notifications/task_notifier.dart';
import '../notifications/unread.dart';
import '../protocol/conversation.dart'
    show SessionEntry, SessionsIndexSubscription;
import '../protocol/backend/backend_adapter.dart';
import '../protocol/backend/backend_type.dart';
import '../protocol/zflow_client.dart';
import '../state/account_store.dart';
import '../state/log_store.dart';
import '../state/app_session.dart';
import 'zcode_webview_page.dart';
import 'bot_webview_uri.dart';
import 'bot_list_page.dart';
import 'recent_projects_page.dart';
import 'chat_page.dart';
import 'session_drawer.dart';
import 'attachment_status.dart';
import 'delayed_banner.dart';
import 'device_management_page.dart';
import 'first_run_page.dart';
import 'settings_page.dart';
import 'theme.dart';

/// 库级未读计数单例（通知发出 +1，打开会话清零）。
final unreadEvents = UnreadEvents.instance;

/// Mirrors `HC()` in the web client:
/// key = workspaceIdentity?.trim() || workspacePath.
String? workspaceKeyOf(Map<String, dynamic> w) {
  final identity = w['workspaceIdentity'];
  if (identity is String && identity.trim().isNotEmpty) {
    return identity.trim();
  }
  final path = w['workspacePath'];
  if (path is String && path.isNotEmpty) return path;
  for (final key in const ['workspaceKey', 'key', 'id']) {
    final v = w[key];
    if (v is String && v.isNotEmpty) return v;
  }
  return null;
}

/// ZCode bridge 使用 workspace identity/path；KayingCode attachment 必须
/// 使用 Node catalog 授权的 workspaceId，不能用路径或 identity 代替。
String? bridgeWorkspaceKeyOf(
  Map<String, dynamic> workspace,
  BackendType backendType,
) {
  if (backendType == BackendType.kayingcode) {
    final workspaceId = workspace['workspaceId'];
    if (workspaceId is String && workspaceId.trim().isNotEmpty) {
      return workspaceId.trim();
    }
    return null;
  }
  return workspaceKeyOf(workspace);
}

/// Host 的 initialize 回应提供 attachment 实际钉住的路径；Relay 目录仅含
/// opaque grant id，用它计算 sessions-index topic 会丢掉全部快照。
Map<String, dynamic> resolvedWorkspaceForBridge(
  Map<String, dynamic> catalog,
  BackendType backendType,
  Map<String, dynamic> bridge,
) {
  if (backendType != BackendType.kayingcode) return catalog;
  final path = bridge['workspacePath'];
  if (path is! String || path.isEmpty) {
    throw StateError('KayingCode attachment 缺少 Host 工作区路径');
  }
  return {
    ...catalog,
    'workspacePath': path,
    'workspaceKey': path,
    'workspaceIdentity': null,
  }..remove('workspaceIdentity');
}

/// 宿主 bootstrap 工作区条目({path, label?, workspaceIdentity?})→
/// 内部约定字段({workspacePath, workspaceKey,...})。
Map<String, dynamic> _normalizeWorkspace(Map<dynamic, dynamic> w) => {
  ...w.cast<String, dynamic>(),
  'workspacePath': w['workspacePath'] ?? w['path'],
  'workspaceKey': (w['workspaceIdentity'] as String?)?.trim().isNotEmpty == true
      ? (w['workspaceIdentity'] as String).trim()
      : w['path'],
};

String workspaceTitle(Map<String, dynamic> w) {
  final label = w['label'] as String?;
  if (label != null && label.isNotEmpty) return label;
  final path = w['workspacePath'] as String?;
  if (path != null && path.isNotEmpty) {
    final parts = path.split(RegExp(r'[\\/]'));
    return parts.lastWhere((p) => p.isNotEmpty, orElse: () => path);
  }
  final identity = w['workspaceIdentity'] as String?;
  if (identity != null && identity.isNotEmpty) return identity;
  return workspaceKeyOf(w) ?? t('session.unknownWorkspace');
}

/// 三 Tab 壳:会话列表 / 项目列表 / 我的。连接、工作区与会话状态沿用现有所有者。
class RootShell extends StatefulWidget {
  final AccountStore store;
  final AppSession session;

  /// 测试隔离用:生产路径恒为 true(挂载即自动连接第一台设备)。
  final bool autoConnect;
  final bool webviewEnabled;

  const RootShell({
    super.key,
    required this.store,
    required this.session,
    this.autoConnect = true,
    this.webviewEnabled = true,
  });

  @override
  State<RootShell> createState() => _RootShellState();
}

enum _ConnectPhase { idle, connecting, failed, done }

class _ShellRoutes extends NavigatorObserver {
  final webview = ValueNotifier<BotWebviewRoute?>(null);

  @override
  void didChangeTop(Route<dynamic> topRoute, Route<dynamic>? previousTopRoute) {
    if (topRoute is PageRoute) {
      webview.value = topRoute is BotWebviewRoute ? topRoute : null;
    }
  }
}

class _RootShellState extends State<RootShell> {
  final _tabNavigator = GlobalKey<NavigatorState>();
  final _tabRoutes = _ShellRoutes();
  int _tab = 0;
  bool _openingZcode = false;
  _ConnectPhase _phase = _ConnectPhase.idle;
  String? _connectError;
  List<dynamic> _workspaces = const [];
  Map<String, dynamic>? _activeWorkspace;
  BridgeSession? _bridge;
  StreamSubscription? _updatedSub;
  TaskNotifier? _taskNotifier;
  Future<void>? _recentSessionCleanup;
  AppLifecycleListener? _lifecycle;

  /// 当前会话详情 id；列表自身的数据仍由 SessionDrawerController 持有。
  final ValueNotifier<String?> _activeSessionId = ValueNotifier(null);
  bool _detailOpen = false;
  DateTime? _sessionAdoptedAt;

  /// 当前前台正在查看的会话 id，供通知门控使用。
  String? _visibleSessionId() => _detailOpen ? _activeSessionId.value : null;

  /// 当前壳已加载/正在加载的设备 id(防止 session 通知重复触发引导链)。
  String? _loadedAccountId;
  String? _requestedAccountId;
  bool _refreshingWorkspaces = false;
  int _catalogGeneration = 0;

  /// 上一次见到的激活设备 id:session 通知不带增量,靠它识别"激活设备换人了"
  /// (开链)与"设备消失"(断开重置)。connect 进行中的同步通知 current 尚未
  /// 变化,不会被误判成新切换。
  String? _lastSeenCurrentId;

  /// Monotonic chain generation: every bootstrap chain captures its own
  /// generation and may only commit shell state while it is still the
  /// newest one. A switch (or an external disconnect) bumps the counter,
  /// which invalidates all in-flight chains instead of dropping their
  /// requests — the last requested device always ends up on screen.
  int _chainGeneration = 0;

  /// autoConnect 因设备尚未加载完而挂起时置位,加载完成后补连一次。
  bool _pendingAutoConnect = false;

  bool _isCurrentChain(int gen) => mounted && gen == _chainGeneration;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSessionChanged);
    widget.store.addListener(_onChanged);
    // Coming back from background: timers were frozen — probe the relay now
    // instead of waiting for the next heartbeat tick to notice a dead
    // socket (shortens the user-visible disconnect window).
    _lifecycle = AppLifecycleListener(
      onResume: () => widget.session.client?.pokeRelay(),
    );
    if (widget.autoConnect && widget.store.accounts.isNotEmpty) {
      _openAccount(widget.store.accounts.first);
    } else if (widget.autoConnect && !widget.store.loaded) {
      // 配对设备是异步加载的:挂载时还没到就把标记挂起,加载完成
      // (_onChanged)后补连,保证冷启动 autoConnect 与加载时序无关。
      _pendingAutoConnect = true;
    }
  }

  @override
  void dispose() {
    _tabRoutes.webview.dispose();
    widget.session.removeListener(_onSessionChanged);
    widget.store.removeListener(_onChanged);
    _lifecycle?.dispose();
    // State.dispose is synchronous; invalidate shell callbacks and session
    // adoption before releasing notifiers.
    _chainGeneration++;
    _teardownDeviceState();
    _activeSessionId.dispose();
    super.dispose();
  }

  void _onChanged() {
    if (!mounted) return;
    if (_pendingAutoConnect &&
        widget.store.accounts.isNotEmpty &&
        widget.session.current == null) {
      _pendingAutoConnect = false;
      _openAccount(widget.store.accounts.first);
    }
    // 空档案加载完成后结束冷启动补连，之后新增 Bot 必须由用户点击连接。
    if (widget.store.loaded) _pendingAutoConnect = false;
    setState(() {});
  }

  /// Session notifications: a new active device starts its bootstrap chain
  /// (never dropped — generation invalidation supersedes in-flight chains);
  /// a vanished active device (kicked / disconnected externally) resets the
  /// shell to the disconnected state instead of showing stale content.
  void _onSessionChanged() {
    if (!mounted) return;
    final account = widget.session.current;
    final prevId = _lastSeenCurrentId;
    _lastSeenCurrentId = account?.id;
    if (account == null) {
      if (prevId != null) {
        // Had an active device, now none: kicked or disconnected externally.
        _chainGeneration++;
        _loadedAccountId = null;
        _teardownDeviceState();
        setState(() {
          _tab = 0;
          _phase = _ConnectPhase.idle;
          _connectError = null;
          _workspaces = const [];
          _resetSessionState();
        });
        return;
      }
      setState(() {});
      return;
    }
    final changed = prevId != account.id;
    if (changed && account.id != _loadedAccountId) {
      _openAccount(account);
      return;
    }
    setState(() {});
  }

  /// Connect (or reuse) [account]'s device, then bootstrap workspaces and
  /// auto-open the first one. Chains may overlap; only the newest
  /// generation commits state, so a mid-flight switch always lands on the
  /// device the user asked for last.
  Future<void> _openAccount(Account account) async {
    // 移动产品仅接入 KayingCode；旧档案不能绕过列表进入 ZCode 原生链路。
    if (account.backendType != BackendType.kayingcode) return;
    if (botUsesWebview(account, enabled: widget.webviewEnabled)) {
      if (_openingZcode) return;
      _openingZcode = true;
      try {
        // 冷启动也可能从 initState 进入；首帧后导航，避免构建中推入新路由。
        await WidgetsBinding.instance.endOfFrame;
        if (!mounted) return;
        final navigatorContext = _tabNavigator.currentContext;
        if (navigatorContext == null || !navigatorContext.mounted) return;
        await ZcodeWebviewPage.open(navigatorContext, account, widget.store);
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(tr(context, 'zcodeWeb.failed'))),
          );
        }
      } finally {
        _openingZcode = false;
      }
      return;
    }
    unawaited(widget.store.touch(account.id));
    final gen = ++_chainGeneration;
    _loadedAccountId = account.id;
    _requestedAccountId = account.id;
    _catalogGeneration++;
    _refreshingWorkspaces = false;
    _teardownDeviceState();
    setState(() {
      _phase = _ConnectPhase.connecting;
      _connectError = null;
      _workspaces = const [];
      _activeWorkspace = null;
      _bridge = null;
      _resetSessionState();
    });
    try {
      final client = await widget.session.connect(account);
      if (!_isCurrentChain(gen)) return;
      _resubscribe(client, gen);
      final bootstrap = await client.bootstrap();
      if (!_isCurrentChain(gen)) return;
      final list = bootstrap['workspaces'];
      setState(
        () => _workspaces = list is List
            // 宿主条目字段是 {path, label?, workspaceIdentity?}:归一化为
            // 内部约定的 workspacePath/workspaceKey(workspaceKey 算法与
            // 宿主 Xmn 一致:identity 优先,否则 path)。缺失会导致
            // V4 订阅无 directory(全局索引、跨工作区混入)以及
            // listSessions 被必填校验拒绝。
            ? [
                for (final w in list)
                  if (w is Map) _normalizeWorkspace(w),
              ]
            : const [],
      );
      // 首工作区需要真正建立 attachment，单纯展示展开态仍然无法加载会话。
      if (client.backendType == BackendType.kayingcode &&
          _workspaces.isNotEmpty) {
        await _openWorkspace(
          Map<String, dynamic>.from(_workspaces.first as Map),
          gen,
        );
      }
      if (!_isCurrentChain(gen)) return;
      setState(() => _phase = _ConnectPhase.done);
    } catch (e) {
      // A superseded chain failing must not clobber the newer chain's UI.
      if (!_isCurrentChain(gen)) return;
      _loadedAccountId = null;
      setState(() {
        _phase = _ConnectPhase.failed;
        _connectError =
            widget.session.errorOf(account.id) ?? describeConnectFailure(e);
      });
    }
  }

  Future<void> _selectBot(Account account) async {
    if (botUsesWebview(account, enabled: widget.webviewEnabled)) {
      await _openAccount(account);
      return;
    }
    setState(() => _tab = 1);
    if (_phase == _ConnectPhase.connecting &&
        _requestedAccountId == account.id) {
      return;
    }
    if (widget.session.current?.id == account.id &&
        _phase == _ConnectPhase.done &&
        widget.session.client?.connectionStateListenable.value ==
            BackendConnectionState.paired) {
      setState(() => _tab = 1);
      return;
    }
    await _openAccount(account);
    if (mounted &&
        widget.session.current?.id == account.id &&
        _phase == _ConnectPhase.done) {
      setState(() => _tab = 1);
    }
  }

  void _teardownDeviceState() {
    _catalogGeneration++;
    _refreshingWorkspaces = false;
    final updatedSub = _updatedSub;
    _updatedSub = null;
    updatedSub?.cancel();

    final taskNotifier = _taskNotifier;
    _taskNotifier = null;
    final recentCleanup = _recentSessionCleanup;
    _recentSessionCleanup = null;
    final bridge = _bridge;
    _bridge = null;
    _activeWorkspace = null;
    unawaited(() async {
      // Release the bridge first. The notifier/recent-session cleanup paths
      // check this state and skip unsubscribe once the transport is gone;
      // teardown must not wait behind an uncancellable subscribe/start.
      bridge?.dispose();
      try {
        if (taskNotifier != null) await taskNotifier.dispose();
      } catch (_) {}
      try {
        if (recentCleanup != null) await recentCleanup;
      } catch (_) {}
    }());
  }

  void _resubscribe(BackendAdapter client, int gen) {
    _updatedSub?.cancel();
    _updatedSub = client.workspaceListUpdated.listen((result) {
      if (!_isCurrentClient(client, gen) || result is! Map) return;
      final list = result['workspaces'];
      if (list is List) setState(() => _workspaces = list);
    });
  }

  bool _isCurrentClient(BackendAdapter client, int gen) =>
      _isCurrentChain(gen) && identical(widget.session.client, client);

  bool _isCurrentBridge(BridgeSession bridge, int gen) =>
      _isCurrentChain(gen) && identical(_bridge, bridge) && !bridge.isDisposed;

  Future<void> _openWorkspace(Map<String, dynamic> workspace, int gen) async {
    final client = widget.session.client;
    final key = bridgeWorkspaceKeyOf(
      workspace,
      client?.backendType ?? BackendType.zcode,
    );
    if (key == null || client == null || !_isCurrentChain(gen)) return;
    _resubscribe(client, gen);
    try {
      final session = await client.openBridge(key);
      if (!_isCurrentChain(gen)) {
        session.dispose();
        return;
      }
      final resolved = resolvedWorkspaceForBridge(
        workspace,
        client.backendType,
        session.bridge,
      );
      setState(() {
        _bridge = session;
        _activeWorkspace = resolved;
      });
      _startTaskNotifier(session, resolved, gen);
      final recentCleanup = _probeRecentSession(session, resolved, gen);
      _recentSessionCleanup = recentCleanup;
      try {
        await recentCleanup;
      } catch (e) {
        log('[诊断] 最近会话打开失败: $e');
      } finally {
        if (identical(_recentSessionCleanup, recentCleanup)) {
          _recentSessionCleanup = null;
        }
      }
    } catch (e) {
      if (!mounted || !_isCurrentChain(gen)) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context, 'nav.openWorkspaceFailed', args: {'error': e}),
          ),
        ),
      );
    }
  }

  Future<void> _probeRecentSession(
    BridgeSession session,
    Map<String, dynamic> workspace,
    int gen,
  ) async {
    final transport = session.conversation(_scopeOf(workspace));
    SessionsIndexSubscription? sub;
    try {
      await transport.handshake();
      if (!_isCurrentBridge(session, gen)) return;
      sub = await transport.subscribeSessionsIndex();
      if (!_isCurrentBridge(session, gen)) return;
      SessionEntry? recent;
      for (var i = 0; i < 80; i++) {
        if (!_isCurrentBridge(session, gen)) return;
        if (sub.state.ready) {
          for (final e in sub.state.list) {
            if (!e.isArchived) {
              recent = e;
              break;
            }
          }
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      if (!_isCurrentBridge(session, gen)) return;
      final picked = recent;
      log(
        '[v4] 最近会话:ready=${sub.state.ready} '
        '列表=${sub.state.list.length} 选中=${picked?.sessionId ?? '无'}',
      );
      if (diagLogEnabled.value) {
        debugPrint(
          '[zflow] recent-session: ready=${sub.state.ready} '
          'list=${sub.state.list.length} '
          'picked=${picked?.sessionId ?? 'none'}',
        );
      }
      if (picked != null && _isCurrentBridge(session, gen)) {
        setState(() => _activeSessionId.value = picked.sessionId);
      }
    } finally {
      if (sub != null && !session.isDisposed) {
        await sub.dispose();
      }
    }
  }

  /// Background task notifications: while tasks are running, a silent
  /// foreground-service notification shows live progress and completion
  /// alerts route back into the task's chat (Android only).
  void _startTaskNotifier(
    BridgeSession bridge,
    Map<String, dynamic> workspace,
    int gen,
  ) {
    if (!Notifications.isSupported) return;
    final previous = _taskNotifier;
    if (previous != null) {
      _taskNotifier = null;
      unawaited(previous.dispose());
    }
    final scope = _scopeOf(workspace);
    _taskNotifier = TaskNotifier(
      bridge: bridge,
      scope: scope,
      notifications: notificationsService,
      visibleSessionId: _visibleSessionId,
      onOpenTask: (taskId, title) async {
        if (!mounted || !_isCurrentBridge(bridge, gen)) return;
        // 通知进入当前工作区的会话详情；列表仍留在会话 Tab。
        setState(() {
          _tab = 1;
        });
        _openChatDetail(taskId);
      },
    )..start();
  }

  /// 当前连接是输入栏后端名称的唯一来源。
  BackendType? get _activeBackendType =>
      widget.session.current?.backendType ?? widget.session.client?.backendType;

  /// Opens a task chat pushed on top of the shell (automation run history).
  void _openTaskChat(
    BridgeSession bridge,
    int gen,
    String taskId,
    String title,
  ) {
    if (!_isCurrentBridge(bridge, gen)) return;
    final workspace = _activeWorkspace;
    if (workspace == null) return;
    final backendType = _activeBackendType;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatPage(
          session: bridge,
          backendType: backendType,
          scope: _scopeOf(workspace),
          workspaceKey: workspaceKeyOf(workspace) ?? '',
          sessionId: taskId,
          title: title,
        ),
      ),
    );
  }

  /// `{workspacePath, workspaceIdentity?}` — the chat/automation scope.
  Map<String, dynamic> _scopeOf(Map<String, dynamic> workspace) => {
    'workspacePath': workspace['workspacePath'],
    if (workspace['workspaceIdentity'] != null)
      'workspaceIdentity': workspace['workspaceIdentity'],
  };

  /// 设备切换/断开后清除当前会话选择。
  void _resetSessionState() {
    _activeSessionId.value = null;
    _detailOpen = false;
    _sessionAdoptedAt = null;
  }

  /// 抽屉「辅助对话」:基于当前内嵌会话创建 side session 并推入新页。
  /// 草稿态(无会话)按钮已禁用,这里兜底再判一次。
  Future<void> _openSideChatFromDrawer(
    BridgeSession bridge,
    Map<String, dynamic> scope,
    String workspaceKey,
    String? sessionId,
  ) async {
    if (sessionId == null || !mounted) return;
    final backendType = _activeBackendType;
    try {
      final sideId = await bridge
          .conversation(scope)
          .createSelectionSideSession(sessionId);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatPage(
            session: bridge,
            backendType: backendType,
            scope: scope,
            workspaceKey: workspaceKey,
            sessionId: sideId,
            title: tr(context, 'session.sideChat'),
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'nav.openSideChatFailed', args: {'error': e}),
            ),
          ),
        );
      }
    }
  }

  /// A4:当前内嵌会话被删除/归档(从 sessions-index 消失,抽屉 diff 回调)
  /// → 复位到 draft 并提示。抽屉保持打开(用户多半正在管理操作中)。
  void _onCurrentSessionVanished() {
    if (!mounted || _activeSessionId.value == null) return;
    final adopted = _sessionAdoptedAt;
    if (adopted != null && DateTime.now().difference(adopted).inSeconds < 30) {
      // 刚创建的会话可能尚未进入索引快照，保留短暂采纳宽限。
      return;
    }
    setState(() => _activeSessionId.value = null);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(tr(context, 'nav.sessionVanished'))));
  }

  /// 抽屉工作区条 ⌄:底部升起工作区切换层(spec §7.1;设备切换在顶栏,
  /// 工作区切换在抽屉,与 bootstrap→workspaces→sessions 层级一致)。
  /// [sessionCount] 为当前工作区实时会话数(抽屉的 sessions-index 订阅)。
  void _showWorkspaceSwitcher(int sessionCount) {
    final active = _activeWorkspace;
    showModalBottomSheet(
      context: context,
      builder: (context) => _WorkspaceSwitchSheet(
        workspaces: _workspaces,
        activeKey: active == null ? null : workspaceKeyOf(active),
        activeSessionCount: sessionCount,
        onPick: (w) {
          Navigator.pop(context);
          _switchWorkspace(w);
        },
      ),
    );
  }

  Future<void> _pickWorkspace(Map<String, dynamic> workspace) async {
    final client = widget.session.client;
    final key = bridgeWorkspaceKeyOf(
      workspace,
      client?.backendType ?? BackendType.zcode,
    );
    if (key == null || client == null) return;
    final gen = ++_chainGeneration;
    _teardownDeviceState();
    setState(() => _resetSessionState());
    await _openWorkspace(workspace, gen);
  }

  /// 同一设备内切换工作区:作废在途链、释放旧 bridge、重开新 bridge。
  Future<void> _switchWorkspace(Map<String, dynamic> workspace) async {
    final backendType = widget.session.client?.backendType ?? BackendType.zcode;
    final key = bridgeWorkspaceKeyOf(workspace, backendType);
    final active = _activeWorkspace;
    if (key == null ||
        (active != null && key == bridgeWorkspaceKeyOf(active, backendType))) {
      return;
    }
    final gen = ++_chainGeneration;
    _teardownDeviceState();
    setState(() => _resetSessionState());
    await _openWorkspace(workspace, gen);
  }

  void _retryConnect() {
    final account =
        widget.store.find(_requestedAccountId ?? '') ??
        widget.session.current ??
        (widget.store.accounts.isEmpty ? null : widget.store.accounts.first);
    if (account != null) _openAccount(account);
  }

  Future<void> _refreshWorkspaces() async {
    final client = widget.session.client;
    if (client == null || _refreshingWorkspaces) return;
    final chain = _chainGeneration;
    final request = ++_catalogGeneration;
    setState(() => _refreshingWorkspaces = true);
    try {
      final result = await client.bootstrap();
      if (!_isCurrentClient(client, chain) || request != _catalogGeneration) {
        return;
      }
      final list = result['workspaces'];
      setState(
        () => _workspaces = [
          if (list is List)
            for (final w in list)
              if (w is Map) _normalizeWorkspace(w),
        ],
      );
      // 刷新不能重建已打开的 bridge，否则会丢掉重连目标与页面草稿。
      if (_bridge == null &&
          client.backendType == BackendType.kayingcode &&
          _workspaces.isNotEmpty) {
        await _openWorkspace(
          Map<String, dynamic>.from(_workspaces.first as Map),
          chain,
        );
      }
    } catch (error) {
      if (mounted &&
          _isCurrentClient(client, chain) &&
          request == _catalogGeneration) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'nav.refreshWorkspaceFailed', args: {'error': error}),
            ),
          ),
        );
      }
    } finally {
      if (_isCurrentChain(chain) && request == _catalogGeneration) {
        setState(() => _refreshingWorkspaces = false);
      }
    }
  }

  /// Settings entry: drop the active device's connection. The shell stays
  /// mounted (it is the app home) and shows the disconnected state.
  void _disconnectCurrent() {
    final account = widget.session.current;
    if (account != null) widget.session.disconnect(account.id);
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder(
      valueListenable: _tabRoutes.webview,
      child: PopScope(
        canPop: _tab == 0,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop &&
              _tab != 0 &&
              _tabNavigator.currentState?.canPop() != true) {
            setState(() => _tab = 0);
          }
        },
        child: NavigatorPopHandler(
          onPopWithResult: (_) {
            final navigator = _tabNavigator.currentState;
            if (navigator != null && navigator.canPop()) {
              unawaited(navigator.maybePop());
            }
          },
          child: Navigator(
            key: _tabNavigator,
            observers: [_tabRoutes],
            pages: [MaterialPage(child: _buildTabContent(context))],
            onDidRemovePage: (_) {},
          ),
        ),
      ),
      builder: (context, webview, navigator) => ValueListenableBuilder(
        valueListenable:
            webview?.isAgentPage ?? const AlwaysStoppedAnimation(false),
        child: navigator,
        builder: (context, isAgentPage, navigator) => Scaffold(
          backgroundColor: EmberColors.of(context).bg,
          resizeToAvoidBottomInset: false,
          body: navigator,
          bottomNavigationBar: isAgentPage
              ? null
              : _buildNavigationBar(context),
        ),
      ),
    );
  }

  Widget _buildTabContent(BuildContext context) {
    final colors = EmberColors.of(context);
    if (widget.store.loadError) {
      return SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(EmberSpacing.page),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_outline, size: 36, color: colors.textMuted),
                const SizedBox(height: EmberSpacing.gapM),
                Text(
                  tr(context, 'nav.readDevicesFailed'),
                  style: TextStyle(
                    fontSize: EmberType.section,
                    fontWeight: FontWeight.w600,
                    color: colors.textSolid,
                  ),
                ),
                const SizedBox(height: EmberSpacing.gapS),
                Text(
                  tr(context, 'nav.readDevicesHint'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: colors.textMuted),
                ),
                const SizedBox(height: EmberSpacing.gapM),
                FilledButton(
                  onPressed: () => unawaited(widget.store.load()),
                  child: Text(tr(context, 'nav.retry')),
                ),
              ],
            ),
          ),
        ),
      );
    }
    // 安全存储异步加载期间不能把“尚未读到设备”当成新安装，直接显示加载态。
    if (!widget.store.loaded) {
      return const Center(child: CircularProgressIndicator());
    }
    final session = widget.session;
    final bridge = _bridge;
    final workspace = _activeWorkspace;
    return SafeArea(
      child: Column(
        children: [
          if (_tab == 1 &&
              session.client != null &&
              (bridge == null ||
                  session.client!.backendType == BackendType.zcode))
            _ConnectionBanner(client: session.client!),
          Expanded(
            child: switch (_tab) {
              0 =>
                widget.store.accounts.isEmpty
                    ? FirstRunPage(
                        onConnect: _openFirstRunDevicePage,
                        onImport: () => _openFirstRunDevicePage(null),
                        onSettings: () => setState(() => _tab = 2),
                      )
                    : BotListPage(
                        webviewEnabled: widget.webviewEnabled,
                        store: widget.store,
                        session: session,
                        onSelect: _selectBot,
                        onAdd: _openFirstRunDevicePage,
                        onManage: _openDeviceManagement,
                      ),
              1 =>
                widget.webviewEnabled
                    ? RecentProjectsPage(store: widget.store)
                    : _conversationsTab(context, bridge),
              _ => SettingsHomePage(
                client: session.client,
                bridge: bridge,
                store: widget.store,
                session: session,
                onDisconnect: _disconnectCurrent,
                themeController: ThemeControllerProvider.of(context),
                onOpenTask: bridge == null
                    ? null
                    : (taskId, title) => _openTaskChat(
                        bridge,
                        _chainGeneration,
                        taskId,
                        title,
                      ),
                workspace: workspace,
              ),
            },
          ),
        ],
      ),
    );
  }

  Widget _buildNavigationBar(BuildContext context) => NavigationBar(
    height: 64,
    labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
    selectedIndex: _tab,
    onDestinationSelected: (i) {
      _tabNavigator.currentState?.popUntil((route) => route.isFirst);
      setState(() => _tab = i);
    },
    destinations: [
      NavigationDestination(
        icon: const _UnreadBadge(child: Icon(Icons.forum_outlined)),
        selectedIcon: const _UnreadBadge(child: Icon(Icons.forum)),
        label: tr(context, 'nav.sessionList'),
      ),
      NavigationDestination(
        icon: const Icon(Icons.grid_view_rounded),
        selectedIcon: const Icon(Icons.grid_view_rounded),
        label: tr(context, 'nav.projects'),
      ),
      NavigationDestination(
        icon: const Icon(Icons.person_outline),
        selectedIcon: const Icon(Icons.person),
        label: tr(context, 'nav.profile'),
      ),
    ],
  );

  /// 设备管理页(home 挂载下 push,无可 pop 回的设备页)。
  void _openDeviceManagement() {
    final workspace = _activeWorkspace;
    _tabNavigator.currentState?.push(
      MaterialPageRoute(
        builder: (_) => DeviceManagementPage(
          webviewEnabled: widget.webviewEnabled,
          store: widget.store,
          session: widget.session,
          // 当前活跃设备已打开的工作区(spec §7.3 设备卡字段);
          // 未打开工作区时为 null,卡片不显示该行。
          activeWorkspaceTitle: workspace == null
              ? null
              : workspaceTitle(workspace),
        ),
      ),
    );
  }

  void _openFirstRunDevicePage(BackendType? backendType) {
    _tabNavigator.currentState?.push(
      MaterialPageRoute(
        builder: (_) => DeviceManagementPage(
          webviewEnabled: widget.webviewEnabled,
          store: widget.store,
          session: widget.session,
          initialBackend: backendType,
          exitOnAdd: true,
        ),
      ),
    );
  }

  Widget _conversationsTab(BuildContext context, BridgeSession? bridge) {
    if (widget.webviewEnabled && widget.store.accounts.isNotEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(EmberSpacing.page),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                tr(context, 'zcodeWeb.sessionsInWeb'),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: EmberSpacing.gapM),
              FilledButton(
                onPressed: () => _openAccount(widget.store.accounts.first),
                child: Text(tr(context, 'zcodeWeb.workbench')),
              ),
            ],
          ),
        ),
      );
    }
    final colors = EmberColors.of(context);
    final session = widget.session;
    final workspace = _activeWorkspace;
    final account = session.current;
    final header = Padding(
      padding: const EdgeInsets.fromLTRB(
        EmberSpacing.page,
        8,
        EmberSpacing.page,
        8,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr(context, 'nav.workspace'),
                  style: TextStyle(
                    fontSize: EmberType.title,
                    fontWeight: FontWeight.w700,
                    color: colors.textSolid,
                  ),
                ),
                Text(
                  account == null
                      ? tr(context, 'nav.botNotConnected')
                      : '${account.label} · ${account.backendType.displayName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: EmberType.secondary,
                    color: colors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: tr(context, 'nav.refreshWorkspace'),
            onPressed:
                session.client == null ||
                    _refreshingWorkspaces ||
                    _phase == _ConnectPhase.connecting
                ? null
                : _refreshWorkspaces,
            icon: _refreshingWorkspaces
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: tr(context, 'nav.manageBots'),
            onPressed: _openDeviceManagement,
            icon: const Icon(Icons.devices_outlined),
          ),
        ],
      ),
    );
    Widget content;
    if (account == null) {
      content = switch (_phase) {
        _ConnectPhase.connecting => _connectingView(colors),
        _ConnectPhase.failed => _failedView(colors),
        _ => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.store.accounts.isEmpty
                    ? tr(context, 'nav.addBotFirst')
                    : tr(context, 'nav.selectBotToConnect'),
                style: TextStyle(color: colors.textMuted),
              ),
              TextButton(
                onPressed: () => setState(() => _tab = 0),
                child: Text(tr(context, 'nav.goToBotList')),
              ),
            ],
          ),
        ),
      };
    } else {
      content = switch (_phase) {
        _ConnectPhase.connecting => _connectingView(colors),
        _ConnectPhase.failed => _failedView(colors),
        _ConnectPhase.done =>
          bridge != null && workspace != null
              ? SessionDrawer(
                  key: ValueKey(
                    'session-list-${account.id}-${workspaceKeyOf(workspace)}',
                  ),
                  open: true,
                  pageMode: true,
                  bridge: bridge,
                  scope: _scopeOf(workspace),
                  workspaceName: workspaceTitle(workspace),
                  workspacePath: workspace['workspacePath'] as String? ?? '',
                  currentSessionId: _activeSessionId.value,
                  onPick: _openChatDetail,
                  onOpenEntry: (entry) =>
                      _openChatDetail(entry.sessionId, title: entry.title),
                  onOpenSideChat: () => _openSideChatFromDrawer(
                    bridge,
                    _scopeOf(workspace),
                    workspaceKeyOf(workspace) ?? '',
                    _activeSessionId.value,
                  ),
                  onOpenSideChatFor: (sessionId) => _openSideChatFromDrawer(
                    bridge,
                    _scopeOf(workspace),
                    workspaceKeyOf(workspace) ?? '',
                    sessionId,
                  ),
                  onSwitchWorkspace: _showWorkspaceSwitcher,
                  onCurrentSessionVanished: _onCurrentSessionVanished,
                  onManageDevices: _openDeviceManagement,
                  deviceCount: widget.store.accounts.length,
                  deviceOnline: session.client != null,
                )
              : session.client != null
              ? _WorkspacePicker(
                  workspaces: _workspaces,
                  onPick: (w) => _pickWorkspace(w),
                )
              : _mutedHint(tr(context, 'nav.deviceNotConnected'), colors),
        _ConnectPhase.idle => _mutedHint(
          tr(context, 'nav.deviceNotConnected'),
          colors,
        ),
      };
    }
    return Column(
      children: [
        header,
        if (bridge != null &&
            session.client?.backendType == BackendType.kayingcode)
          AttachmentStatus(bridge: bridge, onRetry: null),
        Expanded(child: content),
      ],
    );
  }

  void _openChatDetail(String? sessionId, {String? title}) {
    final bridge = _bridge;
    final workspace = _activeWorkspace;
    if (bridge == null || workspace == null) return;
    final backendType = _activeBackendType;
    if (sessionId != null) unreadEvents.clearTask(sessionId);
    setState(() => _activeSessionId.value = sessionId);
    _sessionAdoptedAt = null;
    _detailOpen = true;
    final generation = _chainGeneration;
    Navigator.of(context)
        .push(
          MaterialPageRoute<void>(
            builder: (_) => ChatPage(
              session: bridge,
              onRetryAttachment: null,
              backendType: backendType,
              scope: _scopeOf(workspace),
              workspaceKey: workspaceKeyOf(workspace) ?? '',
              sessionId: sessionId,
              title: sessionId == null
                  ? tr(context, 'session.new')
                  : (title?.isNotEmpty == true
                        ? title!
                        : tr(context, 'nav.session')),
              onSessionInfo: (id, _, _) {
                if (_isCurrentBridge(bridge, generation) && id.isNotEmpty) {
                  if (id != _activeSessionId.value) {
                    _sessionAdoptedAt = DateTime.now();
                  }
                  _activeSessionId.value = id;
                }
              },
            ),
          ),
        )
        .then((_) {
          if (mounted && generation == _chainGeneration) {
            _detailOpen = false;
            setState(() {});
          }
        });
  }

  Widget _connectingView(EmberColors colors) {
    final pending = widget.session.clientOf(_requestedAccountId ?? '');
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(height: EmberSpacing.gapM),
          Text(
            pending?.connectionState == BackendConnectionState.waiting
                ? tr(
                    context,
                    pending?.params.isV2 == true
                        ? 'zcodeAuth.waitingDevice'
                        : 'nav.connectingApproval',
                  )
                : tr(context, 'nav.connectingDevice'),
            style: TextStyle(
              fontSize: EmberType.caption,
              color: colors.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _failedView(EmberColors colors) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: EmberSpacing.page),
            child: Text(
              tr(
                context,
                'nav.connectFailed',
                args: {'error': _connectError ?? ''},
              ),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: EmberType.caption, color: colors.err),
            ),
          ),
          const SizedBox(height: EmberSpacing.gapM),
          TextButton(
            onPressed: _retryConnect,
            style: TextButton.styleFrom(foregroundColor: colors.primary),
            child: Text(tr(context, 'nav.retry')),
          ),
        ],
      ),
    );
  }

  Widget _mutedHint(String text, EmberColors colors) {
    return Center(
      child: Text(
        text,
        style: TextStyle(fontSize: EmberType.caption, color: colors.textMuted),
      ),
    );
  }
}

/// 连接完成、尚未进入工作区时的工作区选择列表(U1:连接后不直接开会话,
/// 先选工作区,再由抽屉选会话或开新会话)。
class _WorkspacePicker extends StatelessWidget {
  final List<dynamic> workspaces;
  final void Function(Map<String, dynamic> workspace) onPick;

  const _WorkspacePicker({required this.workspaces, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return Material(
      color: colors.bg,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                EmberSpacing.page,
                EmberSpacing.gapM,
                EmberSpacing.page,
                EmberSpacing.gapS,
              ),
              child: Text(
                tr(context, 'nav.selectWorkspace'),
                style: TextStyle(
                  fontSize: EmberType.title,
                  fontWeight: FontWeight.w600,
                  color: colors.textSolid,
                ),
              ),
            ),
            Expanded(
              child: workspaces.isEmpty
                  ? Center(
                      child: Text(
                        tr(context, 'nav.noWorkspaces'),
                        style: TextStyle(
                          fontSize: EmberType.caption,
                          color: colors.textMuted,
                        ),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(
                        EmberSpacing.page,
                        0,
                        EmberSpacing.page,
                        EmberSpacing.page,
                      ),
                      children: [
                        for (final w in workspaces)
                          if (w is Map)
                            ListTile(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(
                                  EmberRadius.control,
                                ),
                              ),
                              leading: Icon(
                                Icons.folder_open,
                                size: 20,
                                color: colors.primary,
                              ),
                              title: Text(
                                workspaceTitle(w.cast<String, dynamic>()),
                                style: TextStyle(
                                  fontSize: EmberType.body,
                                  fontWeight: FontWeight.w600,
                                  color: colors.textSolid,
                                ),
                              ),
                              subtitle:
                                  w['workspacePath'] != null &&
                                      '${w['workspacePath']}'.isNotEmpty
                                  ? Text(
                                      '${w['workspacePath']}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: EmberType.caption,
                                        fontFamily: EmberFonts.term,
                                        color: colors.textFaint,
                                      ),
                                    )
                                  : null,
                              onTap: () => onPick(w.cast<String, dynamic>()),
                            ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkspaceSwitchSheet extends StatelessWidget {
  final List<dynamic> workspaces;
  final String? activeKey;

  /// 当前工作区实时会话数(宿主自抽屉订阅取)。
  final int activeSessionCount;
  final void Function(Map<String, dynamic> workspace) onPick;

  const _WorkspaceSwitchSheet({
    required this.workspaces,
    required this.activeKey,
    required this.activeSessionCount,
    required this.onPick,
  });

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    final items = [
      for (final w in workspaces)
        if (w is Map) w.cast<String, dynamic>(),
    ];
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                tr(context, 'nav.switchWorkspace'),
                style: TextStyle(
                  fontSize: EmberType.section,
                  fontWeight: FontWeight.w700,
                  color: colors.textSolid,
                ),
              ),
            ),
          ),
          Flexible(
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1, indent: 16),
              itemBuilder: (context, index) {
                final w = items[index];
                final isActive = workspaceKeyOf(w) == activeKey;
                return ListTile(
                  leading: Icon(
                    isActive ? Icons.folder : Icons.folder_open,
                    color: isActive ? colors.primary : colors.textFaint,
                  ),
                  title: Row(
                    children: [
                      Flexible(
                        child: Text(
                          workspaceTitle(w),
                          style: TextStyle(
                            color: colors.textSolid,
                            fontWeight: isActive
                                ? FontWeight.w700
                                : FontWeight.w400,
                          ),
                        ),
                      ),
                      if (isActive) ...[
                        const SizedBox(width: EmberSpacing.gapS),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: colors.primary.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: Text(
                            tr(
                              context,
                              'nav.sessionCount',
                              args: {'count': activeSessionCount},
                            ),
                            style: TextStyle(
                              fontSize: EmberType.caption,
                              color: colors.primary,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  subtitle:
                      w['workspacePath'] is String &&
                          (w['workspacePath'] as String).isNotEmpty
                      ? Text(
                          w['workspacePath'],
                          style: TextStyle(
                            fontSize: 11,
                            fontFamily: EmberFonts.term,
                            color: colors.textFaint,
                          ),
                        )
                      : null,
                  trailing: isActive
                      ? Icon(
                          Icons.check_circle,
                          size: 18,
                          color: colors.primary,
                        )
                      : null,
                  onTap: () => onPick(w),
                );
              },
            ),
          ),
          const SizedBox(height: EmberSpacing.gapS),
        ],
      ),
    );
  }
}

/// Bottom sheet: list all devices with per-device connect state; tap to
/// switch (or connect first). Non-active connected devices can be
/// disconnected individually.
class _ConnectionBanner extends StatelessWidget {
  final BackendAdapter client;

  const _ConnectionBanner({required this.client});

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return ValueListenableBuilder<BackendConnectionState>(
      valueListenable: client.connectionStateListenable,
      builder: (context, state, _) {
        final (color, icon, text) = switch (state) {
          BackendConnectionState.reconnecting => (
            colors.warn,
            Icons.sync,
            tr(context, 'chat.status.reconnecting'),
          ),
          BackendConnectionState.error => (
            colors.err,
            Icons.error_outline,
            tr(context, 'nav.connectFailedBanner'),
          ),
          BackendConnectionState.kicked => (
            colors.err,
            Icons.error_outline,
            tr(context, 'nav.kicked'),
          ),
          BackendConnectionState.waiting => (
            colors.run,
            Icons.hourglass_top,
            tr(
              context,
              client.params.isV2
                  ? 'zcodeAuth.waitingDevice'
                  : 'nav.waitingPairing',
            ),
          ),
          _ => (Colors.transparent, Icons.check, ''),
        };
        if (text.isEmpty) return const SizedBox.shrink();
        // Only errors surface instantly; a reconnect that heals within 5s
        // (locked-screen resume, brief network flap) stays invisible.
        final content = _bannerContent(context, color, icon, text);
        if (state == BackendConnectionState.reconnecting) {
          return DelayedVisibility(
            visible: true,
            delay: const Duration(seconds: 5),
            builder: (context) => content,
          );
        }
        return content;
      },
    );
  }

  Widget _bannerContent(
    BuildContext context,
    Color color,
    IconData icon,
    String text,
  ) {
    return Container(
      width: double.infinity,
      color: color.withValues(alpha: 0.15),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: EmberSpacing.gapS),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: EmberType.secondary, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// 底栏会话角标：与 Taro BottomNav 一致，超过 99 显示 `99+`。
class _UnreadBadge extends StatelessWidget {
  final Widget child;

  const _UnreadBadge({required this.child});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: unreadEvents,
      builder: (context, _) {
        final total = unreadEvents.total;
        return Badge(
          isLabelVisible: total > 0,
          label: Text(total > 99 ? '99+' : '$total'),
          child: child,
        );
      },
    );
  }
}
