import 'dart:async';

import 'package:flutter/foundation.dart';

import '../connection_params.dart';
import '../relay_client.dart';
import '../zflow_client.dart';
import 'backend_adapter.dart';
import 'backend_type.dart';

/// ZCode 后端适配器：封装 zflow 原生协议（relay + workspace-bridge）。
///
/// 直接复用 [ZflowClient] 的全部能力，对 UI 层暴露统一的 [BackendAdapter] 接口。
class ZcodeAdapter implements BackendAdapter {
  final ZflowClient _client;
  final BackendType _backendType = BackendType.zcode;
  @override
  void Function(String line)? onLog;

  ZcodeAdapter({
    required ZflowConnectionParams params,
    this.onLog,
    Future<String> Function()? getTerminalToken,
  }) : _client = ZflowClient(
         params,
         onLog: onLog,
         getTerminalToken: getTerminalToken,
       );

  @override
  ZflowConnectionParams get params => _client.params;

  @override
  BackendType get backendType => _backendType;

  @override
  BackendConnectionState get connectionState =>
      _MappedConnectionState.map(_client.relay.state);

  @override
  ValueListenable<BackendConnectionState> get connectionStateListenable =>
      _connectionState;

  _MappedConnectionState? _connectionStateNotifier;

  /// 单例缓存：ValueListenableBuilder 会在每次 build 读取该 getter，
  /// 每次新建会把旧 notifier 永久挂在 relay 状态源上（监听泄漏）。
  _MappedConnectionState get _connectionState => _connectionStateNotifier ??=
      _MappedConnectionState(_client.relay.stateListenable);

  @override
  Stream<dynamic> get workspaceListUpdated => _client.workspaceListUpdated;

  @override
  Future<void> connect() => _client.connect();

  @override
  Future<void> waitPaired({Duration timeout = const Duration(seconds: 60)}) =>
      _client.waitPaired(timeout: timeout);

  @override
  void pokeRelay() => _client.pokeRelay();

  @override
  Future<Map<String, dynamic>> bootstrap() => _client.bootstrap();

  @override
  Future<List<Map<String, dynamic>>> listWorkspaces() async {
    final result = await _client.listWorkspaces();
    if (result is List) {
      return result
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>())
          .toList();
    }
    return [];
  }

  @override
  Future<BridgeSession> openBridge(String workspaceKey, {String? taskId}) =>
      _client.openBridge(workspaceKey, taskId: taskId);

  @override
  Future<Map<String, dynamic>> request(
    Map<String, dynamic> payload,
    bool Function(Map<String, dynamic>) match, {
    Duration timeout = const Duration(seconds: 30),
  }) => _client.request(payload, match, timeout: timeout);

  @override
  Future<void> sendMobileViewState({
    required String workspaceKey,
    String? taskId,
  }) => _client.sendMobileViewState(workspaceKey: workspaceKey, taskId: taskId);

  @override
  Future<Map<String, dynamic>> reconnectWorkspace(String workspaceKey) =>
      _client.reconnectWorkspace(workspaceKey);

  @override
  Future<void> dispose() async {
    _connectionStateNotifier?.dispose();
    _connectionStateNotifier = null;
    await _client.dispose();
  }
}

/// 把 ZCode 的 [RelayState] 监听映射为统一的 [BackendConnectionState]。
class _MappedConnectionState extends ValueNotifier<BackendConnectionState> {
  final ValueListenable<RelayState> _source;
  late final VoidCallback _listener;

  _MappedConnectionState(this._source) : super(map(_source.value)) {
    _listener = () => value = map(_source.value);
    _source.addListener(_listener);
  }

  static BackendConnectionState map(RelayState s) => switch (s) {
    RelayState.idle => BackendConnectionState.idle,
    RelayState.connecting => BackendConnectionState.connecting,
    RelayState.authenticating => BackendConnectionState.authenticating,
    RelayState.waiting => BackendConnectionState.waiting,
    RelayState.paired => BackendConnectionState.paired,
    RelayState.reconnecting => BackendConnectionState.reconnecting,
    RelayState.error => BackendConnectionState.error,
    RelayState.kicked => BackendConnectionState.kicked,
    RelayState.closed => BackendConnectionState.closed,
  };

  @override
  void dispose() {
    _source.removeListener(_listener);
    super.dispose();
  }
}
