// F-04：移动端只保存命令恢复线索；命令准入与幂等事实仍由 Agent CommandInbox 所有。
// 可能含正文/交互答案，使用 Keystore/Keychain，不能进入 SharedPreferences 或日志。
import 'dart:convert';

import '../platform/secure_storage.dart';

const pendingCommandTtl = Duration(hours: 24);

class PendingMobileCommand {
  const PendingMobileCommand({
    required this.scopeKey,
    required this.commandId,
    required this.sessionId,
    required this.type,
    required this.issuedAt,
    required this.expiresAt,
    this.text,
    this.acknowledged = false,
  });

  final String scopeKey;
  final String commandId;
  final String? sessionId;
  final String type;
  final int issuedAt;
  final int expiresAt;
  final String? text;
  final bool acknowledged;

  Map<String, Object?> toJson() => {
    'scopeKey': scopeKey,
    'commandId': commandId,
    'sessionId': sessionId,
    'type': type,
    'issuedAt': issuedAt,
    'expiresAt': expiresAt,
    if (text != null) 'text': text,
    'acknowledged': acknowledged,
  };

  static PendingMobileCommand? tryParse(Object? value) {
    if (value is! Map) return null;
    final scopeKey = value['scopeKey'];
    final commandId = value['commandId'];
    final sessionId = value['sessionId'];
    final type = value['type'];
    final issuedAt = value['issuedAt'];
    final expiresAt = value['expiresAt'];
    final text = value['text'];
    if (scopeKey is! String ||
        commandId is! String ||
        (sessionId != null && sessionId is! String) ||
        type is! String ||
        !{'createSession', 'sendText', 'resolveInteraction'}.contains(type) ||
        issuedAt is! num ||
        expiresAt is! num ||
        (text != null && text is! String)) {
      return null;
    }
    return PendingMobileCommand(
      scopeKey: scopeKey,
      commandId: commandId,
      sessionId: sessionId as String?,
      type: type,
      issuedAt: issuedAt.toInt(),
      expiresAt: expiresAt.toInt(),
      text: text as String?,
      acknowledged: value['acknowledged'] == true,
    );
  }
}

abstract interface class PendingCommandStorage {
  Future<String?> read();
  Future<void> write(String value);
}

class SecurePendingCommandStorage implements PendingCommandStorage {
  const SecurePendingCommandStorage();
  static const _storage = FlutterSecureStorage();
  static const _key = 'kayingcode_mobile_pending_commands_v1';

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String value) => _storage.write(key: _key, value: value);
}

/// 单进程唯一写入者，避免多个 bridge 对同一 secure-storage bundle 并发覆盖。
class PendingCommandLedger {
  PendingCommandLedger({PendingCommandStorage? storage, int Function()? clock})
    : _storage = storage ?? const SecurePendingCommandStorage(),
      _clock = clock ?? (() => DateTime.now().millisecondsSinceEpoch);

  final PendingCommandStorage _storage;
  final int Function() _clock;
  final Map<String, PendingMobileCommand> _entries = {};
  Future<void> _writes = Future.value();
  Future<void>? _loaded;

  Future<void> load() => _loaded ??= _load();

  Future<void> _load() async {
    final raw = await _storage.read();
    if (raw == null || raw.isEmpty) return;
    final decoded = jsonDecode(raw);
    if (decoded is! List) {
      await _storage.write('[]');
      return;
    }
    var cleanup = false;
    for (final value in decoded) {
      final entry = PendingMobileCommand.tryParse(value);
      if (entry != null && entry.expiresAt > _clock()) {
        _entries[entry.commandId] = entry;
      } else {
        cleanup = true;
      }
    }
    if (cleanup) await _commit();
  }

  Future<void> record({
    required String scopeKey,
    required String commandId,
    required String? sessionId,
    required String type,
    String? text,
  }) async {
    await load();
    if (_entries.containsKey(commandId)) return;
    final issuedAt = _clock();
    _entries[commandId] = PendingMobileCommand(
      scopeKey: scopeKey,
      commandId: commandId,
      sessionId: sessionId,
      type: type,
      text: text,
      issuedAt: issuedAt,
      expiresAt: issuedAt + pendingCommandTtl.inMilliseconds,
    );
    try {
      await _commit();
    } catch (_) {
      _entries.remove(commandId);
      rethrow;
    }
  }

  Future<List<PendingMobileCommand>> list(String scopeKey) async {
    await load();
    await _prune();
    return _entries.values.where((entry) => entry.scopeKey == scopeKey).toList()
      ..sort((a, b) => a.issuedAt.compareTo(b.issuedAt));
  }

  Future<void> acknowledge(String commandId, String status) async {
    await load();
    final entry = _entries[commandId];
    if (entry == null) return;
    if (status == 'accepted' || status == 'duplicate') {
      if (entry.type == 'sendText') {
        _entries[commandId] = PendingMobileCommand(
          scopeKey: entry.scopeKey,
          commandId: entry.commandId,
          sessionId: entry.sessionId,
          type: entry.type,
          issuedAt: entry.issuedAt,
          expiresAt: entry.expiresAt,
          text: entry.text,
          acknowledged: true,
        );
      } else {
        _entries.remove(commandId);
      }
    } else {
      _entries.remove(commandId);
    }
    await _commit();
  }

  Future<void> settle(String commandId) async {
    await load();
    if (_entries.remove(commandId) != null) await _commit();
  }

  Future<void> _prune() async {
    final now = _clock();
    final expired = _entries.values
        .where((entry) => entry.expiresAt <= now)
        .map((entry) => entry.commandId)
        .toList();
    if (expired.isEmpty) return;
    for (final key in expired) {
      _entries.remove(key);
    }
    await _commit();
  }

  Future<void> _commit() {
    final snapshot = jsonEncode(
      _entries.values.map((entry) => entry.toJson()).toList(),
    );
    final next = _writes
        .catchError((Object _) {})
        .then((_) => _storage.write(snapshot));
    _writes = next;
    return next;
  }
}

final pendingMobileCommandLedger = PendingCommandLedger();
