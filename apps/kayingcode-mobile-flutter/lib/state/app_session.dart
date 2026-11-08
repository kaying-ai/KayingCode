import 'package:flutter/foundation.dart';

import '../protocol/connection_params.dart';
import '../l10n/strings.dart';
import '../protocol/backend/backend_adapter.dart';
import '../protocol/backend/backend_type.dart';
import '../protocol/backend/zcode_adapter.dart';
import 'account_store.dart';
import 'log_store.dart';
import 'zcode_auth_sessions.dart';

/// Creates the [BackendAdapter] for one device. Production builds the real
/// adapter; tests inject fakes through [AppSession.adapterFactory].
typedef BackendAdapterFactory =
    BackendAdapter Function(
      ZflowConnectionParams params,
      void Function(String line)? onLog,
      BackendConnectionIntent intent,
    );

/// Translates low-level connect failures into an actionable Chinese
/// explanation shown in the device list. Unknown reasons pass through.
String describeConnectFailure(Object e) {
  final s = '$e';
  if (s.contains('auth-required')) return t('zcodeAuth.required');
  if (s.contains('session-not-found') || s.contains('session-expired')) {
    return t('connect.sessionInvalid');
  }
  if (s.contains('session-conflict')) {
    return t('connect.sessionConflict');
  }
  if (s.contains('desktop-disconnected')) {
    return t('connect.desktopDisconnected');
  }
  if (s.contains('invalid-mobile-connection')) {
    return t('connect.notConfirmed');
  }
  if (s.contains('relay-unavailable')) {
    return t('connect.relayUnavailable');
  }
  if (s.contains('kicked')) {
    return t('connect.kicked');
  }
  if (s.contains('auth-malformed')) {
    return t('connect.authMalformed');
  }
  if (s.contains('pairing timeout')) {
    return t('connect.pairingTimeout');
  }
  if (s.contains('TimeoutException') || s.contains('SocketException')) {
    return t('connect.network', args: {'error': s});
  }
  return s;
}

/// Manages connections to multiple devices simultaneously. Each account can
/// have an independent live connection; exactly one is "active" and drives
/// the RootShell view. Switching to an already-connected device does not
/// reconnect, and the last connect/switch request always wins activation —
/// a slow in-flight connect never yanks the active device back.
class AppSession extends ChangeNotifier {
  final Map<String, BackendAdapter> _connections = {};
  final Set<String> _connecting = {};

  /// 在途 connect 的 future(按账号):同账号重复 connect 复用同一个,
  /// 防止二次建连覆盖 `_connections[id]` 后旧 socket 泄漏。
  final Map<String, Future<BackendAdapter>> _inFlight = {};
  final Map<String, BackendAdapter> _pendingAdapters = {};
  final Map<String, Future<void>> _disconnectFlights = {};
  final AccountStore _store;

  /// 连接意图(按账号):connect 发起时登记,disconnect/disconnectAll
  /// 撤销。connect 完成时意图已不在 → 该账号在连接期间被断开/移除,
  /// 连接作废(不入池、不激活)。
  final Set<String> _connectIntents = {};
  final Map<String, String> _errors = {};
  String? _activeId;
  Account? _activeAccount;

  /// Monotonic activation-intent counter: every request that wants a device
  /// active (connect/switchTo/_activate) bumps it. A slow in-flight connect
  /// whose epoch is no longer current must not steal activation back after
  /// the user switched to another device — the last request wins.
  int _activationEpoch = 0;

  final BackendAdapterFactory? adapterFactory;

  AppSession({
    required AccountStore store,
    @visibleForTesting this.adapterFactory,
  }) : _store = store;

  /// Currently active device client (drives the shell).
  BackendAdapter? get client => _connections[_activeId];

  /// Currently active device account.
  Account? get current => _activeAccount;

  /// Whether [accountId] currently has a live connection.
  bool isConnected(String accountId) => _connections.containsKey(accountId);

  /// Whether [accountId] is currently establishing a connection.
  bool connecting(String accountId) => _connecting.contains(accountId);

  /// Last error for [accountId], if any.
  String? errorOf(String accountId) => _errors[accountId];

  /// Client for a specific (possibly non-active) device.
  BackendAdapter? clientOf(String accountId) =>
      _connections[accountId] ?? _pendingAdapters[accountId];

  /// True while any device is connecting (disables global add actions).
  bool get connectingAny => _connecting.isNotEmpty;

  /// Ensure [account] is connected and make it active. Reuses an existing
  /// live connection, then an in-flight connect for the same account;
  /// otherwise establishes a new one. If the user switched to another
  /// device while this connect was in flight, the device is added to the
  /// pool silently (stays connected) without stealing activation. If the
  /// account was disconnected (or removed) mid-flight, the connection is
  /// discarded — a device the user just cut off never comes back through
  /// a stale connect.
  Future<BackendAdapter> connect(Account account) async {
    account =
        _store.find(account.id) ??
        (throw StateError(t('connect.accountRemoved')));
    final existingFlight = _inFlight[account.id];
    if (existingFlight != null) return existingFlight;
    await _disconnectFlights[account.id];
    account =
        _store.find(account.id) ??
        (throw StateError(t('connect.accountRemoved')));
    final existing = _connections[account.id];
    if (existing != null) {
      _activate(account);
      return existing;
    }
    final inFlight = _inFlight[account.id];
    if (inFlight != null) return inFlight;
    final future = _connect(account);
    _inFlight[account.id] = future;
    try {
      return await future;
    } finally {
      if (identical(_inFlight[account.id], future)) {
        _inFlight.remove(account.id);
      }
    }
  }

  Future<BackendAdapter> _connect(Account account) async {
    _connectIntents.add(account.id);
    _connecting.add(account.id);
    _errors.remove(account.id);
    notifyListeners();
    final epoch = ++_activationEpoch;
    final params = account.params;
    if (params == null) {
      _connectIntents.remove(account.id);
      _connecting.remove(account.id);
      _errors[account.id] = t('connect.invalidUrl');
      notifyListeners();
      throw StateError(_errors[account.id]!);
    }
    final factory = adapterFactory;
    const intent = BackendConnectionIntent.resume;
    final c = factory != null
        ? factory(params, log, intent)
        : _createAdapter(params, intent);
    _pendingAdapters[account.id] = c;
    notifyListeners();
    try {
      await c.connect();
      await c.waitPaired(timeout: const Duration(seconds: 90));
      if (!_connectIntents.contains(account.id)) {
        throw StateError(t('connect.cancelled'));
      }
      account =
          await _store.confirmConnection(
            account.id,
            expectedUrl: account.url,
          ) ??
          (throw StateError(t('connect.accountRemoved')));
    } catch (e, st) {
      Object failure = e;
      StackTrace failureStack = st;
      final current = _connectIntents.contains(account.id);
      _connectIntents.remove(account.id);
      _connecting.remove(account.id);
      if (current) _errors[account.id] = describeConnectFailure(failure);
      notifyListeners();
      log('[诊断] 连接失败: ${describeConnectFailure(failure)}');
      await c.dispose();
      Error.throwWithStackTrace(
        StateError(describeConnectFailure(failure)),
        failureStack,
      );
    } finally {
      if (identical(_pendingAdapters[account.id], c)) {
        _pendingAdapters.remove(account.id);
      }
    }
    if (!_connectIntents.contains(account.id)) {
      // 连接期间被 disconnect/disconnectAll:意图已撤销,作废在途连接。
      _connecting.remove(account.id);
      notifyListeners();
      await c.dispose();
      throw StateError('连接已取消：设备在连接完成前已断开或移除');
    }
    _connectIntents.remove(account.id);
    _connections[account.id] = c;
    if (epoch == _activationEpoch) {
      _activate(account);
    } else {
      // A newer connect/switchTo superseded this one; still connected in
      // the background, just not active.
      _connecting.remove(account.id);
      notifyListeners();
    }
    return c;
  }

  /// 根据后端类型创建对应的 adapter
  BackendAdapter _createAdapter(
    ZflowConnectionParams params,
    BackendConnectionIntent intent,
  ) {
    void onLog(String line) {
      if (diagLogEnabled.value) debugPrint('[wire] $line');
      log(line);
    }

    if (params.backendType != BackendType.zcode) {
      throw StateError('Open this V2 link in Web');
    }
    return ZcodeAdapter(
      params: params,
      onLog: onLog,
      getTerminalToken: zcodeAuthFor(params).getTerminalToken,
    );
  }

  /// Switch the active device without reconnecting. Connects first if needed.
  Future<void> switchTo(Account account) async {
    await connect(account);
  }

  void _activate(Account account) {
    _activationEpoch++;
    _activeId = account.id;
    _activeAccount = account;
    _connecting.remove(account.id);
    _errors.remove(account.id);
    notifyListeners();
  }

  /// Disconnect a single device. Bumps the activation epoch so an in-flight
  /// connect for this device cannot re-activate it after the disconnect,
  /// and revokes the connect intent so the in-flight connect is discarded
  /// at completion instead of entering the pool.
  Future<void> disconnect(String accountId) {
    final existing = _disconnectFlights[accountId];
    if (existing != null) return existing;
    final flight = _disconnect(accountId);
    _disconnectFlights[accountId] = flight;
    return flight.whenComplete(() {
      if (identical(_disconnectFlights[accountId], flight)) {
        _disconnectFlights.remove(accountId);
      }
    });
  }

  Future<void> _disconnect(String accountId) async {
    _activationEpoch++;
    _connectIntents.remove(accountId);
    final conn = _connections.remove(accountId);
    final pending = _pendingAdapters.remove(accountId);
    final flight = _inFlight[accountId];
    _connecting.remove(accountId);
    _errors.remove(accountId);
    if (_activeId == accountId) {
      _activeId = null;
      _activeAccount = null;
    }
    notifyListeners();
    await conn?.dispose();
    await pending?.dispose();
    // 清凭据前必须等旧 connect 退出，已开始的安全存储写入不能在删除后复活档案。
    if (flight != null) {
      try {
        await flight;
      } catch (_) {}
    }
  }

  Future<void> removeAccount(Account account) async {
    await disconnect(account.id);
    await _store.remove(account.id);
  }

  /// Disconnect everything.
  Future<void> disconnectAll() async {
    final ids = {
      ..._connections.keys,
      ..._pendingAdapters.keys,
      ..._inFlight.keys,
    };
    _activationEpoch++;
    _connectIntents.clear();
    for (final id in ids) {
      await disconnect(id);
    }
  }

  @override
  Future<void> dispose() async {
    await disconnectAll();
    super.dispose();
  }
}
