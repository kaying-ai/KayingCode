import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../l10n/strings.dart';
import '../protocol/connection_params.dart';
import '../protocol/backend/backend_type.dart';
import '../protocol/id.dart';
import 'credential_storage.dart';

class Account {
  final String id;
  String label;
  final String url;
  final int addedAt;
  int? lastUsedAt;
  final BackendType backendType;

  Account({
    required this.id,
    required this.label,
    required this.url,
    required this.addedAt,
    this.lastUsedAt,
    this.backendType = BackendType.zcode,
  });

  factory Account.fromUrl(String url) {
    final params = ZflowConnectionParams.parse(url);
    final label =
        params?.deviceName ??
        (params != null ? params.source.host : t('device.unnamed'));
    return Account(
      id: generateUuid(),
      label: label,
      url: url,
      addedAt: DateTime.now().millisecondsSinceEpoch,
      backendType: params?.backendType ?? BackendType.zcode,
    );
  }

  ZflowConnectionParams? get params => ZflowConnectionParams.parse(url);

  Map<String, dynamic> toJson() => {
    'id': id,
    'label': label,
    'url': url,
    'addedAt': addedAt,
    if (lastUsedAt != null) 'lastUsedAt': lastUsedAt,
    'backendType': backendType.name,
  };

  factory Account.fromJson(Map<String, dynamic> json) => Account(
    id: json['id'] as String? ?? generateUuid(),
    label: json['label'] as String? ?? t('device.unnamed'),
    url: json['url'] as String? ?? '',
    addedAt: (json['addedAt'] as num?)?.toInt() ?? 0,
    lastUsedAt: (json['lastUsedAt'] as num?)?.toInt(),
    backendType: BackendType.fromString(json['backendType'] as String?),
  );
}

/// Multi-account store. Credentials are persisted encrypted at rest via
/// [CredentialStorage] (Keystore/keychain — see `credential_storage.dart`),
/// never in plain SharedPreferences.
class AccountStore extends ChangeNotifier {
  final CredentialStorage _storage;
  Future<void> _mutations = Future.value();

  AccountStore({CredentialStorage storage = const SecureCredentialStorage()})
    : _storage = storage;

  Account? find(String id) =>
      _accounts.where((account) => account.id == id).firstOrNull;

  static String profileKey(Account account) {
    final params = account.params;
    return params?.isKayingcodeWebV2 == true
        ? '${params!.source.origin}#${params.deviceSid}'
        : account.url;
  }

  Future<T> _serial<T>(Future<T> Function() operation) {
    final next = _mutations.then((_) => operation());
    _mutations = next.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return next;
  }

  Future<void> _commit(List<Account> next) async {
    await _storage.write(
      jsonEncode(next.map((account) => account.toJson()).toList()),
    );
    _accounts
      ..clear()
      ..addAll(next);
    notifyListeners();
  }

  final List<Account> _accounts = [];

  /// 最近使用的设备在前(autoConnect 据此连"上一次连接的设备")。
  List<Account> get accounts {
    final list = [..._accounts]
      ..sort((a, b) {
        final ua = a.lastUsedAt ?? 0;
        final ub = b.lastUsedAt ?? 0;
        return ub.compareTo(ua);
      });
    return List.unmodifiable(list);
  }

  bool _loaded = false;
  bool get loaded => _loaded;
  bool _loadError = false;
  bool get loadError => _loadError;

  Future<void> load() => _serial(() async {
    _loadError = false;
    notifyListeners();
    String? raw;
    try {
      raw = await _storage.read();
    } catch (_) {
      // 读取凭据失败不能当作空设备继续，否则用户添加设备可能覆盖原有凭据。
      _loadError = true;
      notifyListeners();
      return;
    }
    _accounts.clear();
    if (raw != null) {
      try {
        final list = jsonDecode(raw);
        if (list is List) {
          for (final item in list) {
            if (item is Map) {
              final account = Account.fromJson(item.cast<String, dynamic>());
              if (account.url.isNotEmpty) _accounts.add(account);
            }
          }
        }
      } catch (_) {}
    }
    _loaded = true;
    notifyListeners();
  });

  Future<Account> addUrl(String url, {String? label}) => _serial(() async {
    if (ZflowConnectionParams.parse(url)?.backendType !=
        BackendType.kayingcode) {
      throw const FormatException('Invalid V2 URL');
    }
    var account = Account.fromUrl(url);
    final key = profileKey(account);
    final existing = _accounts
        .where((other) => profileKey(other) == key)
        .firstOrNull;
    if (existing != null) {
      // 新邀请只更新同一台设备，不能覆盖同 origin 的另一台电脑。
      account = Account(
        id: existing.id,
        label: existing.label,
        url: url,
        addedAt: existing.addedAt,
        lastUsedAt: existing.lastUsedAt,
        backendType: account.backendType,
      );
    }
    if (label != null && label.trim().isNotEmpty) account.label = label.trim();
    await _commit([
      ..._accounts.where((other) => profileKey(other) != key),
      account,
    ]);
    return account;
  });

  Future<void> remove(String id) => _serial(() async {
    await _commit(_accounts.where((other) => other.id != id).toList());
  });

  Future<Account?> confirmConnection(
    String id, {
    required String expectedUrl,
  }) => _serial(() async {
    final account = find(id);
    // 连接完成前档案被删除或替换时，不接受迟到结果；不再维护旧配对 pending。
    return account?.url == expectedUrl ? account : null;
  });

  Future<void> rename(String id, String label) => _serial(() async {
    final account = find(id);
    if (account == null) return;
    final updated = Account.fromJson({
      ...account.toJson(),
      'label': label.trim().isEmpty ? account.label : label.trim(),
    });
    await _commit(
      _accounts.map((other) => other.id == id ? updated : other).toList(),
    );
  });

  Future<void> touch(String id) => _serial(() async {
    final account = find(id);
    if (account == null) return;
    final updated = Account.fromJson({
      ...account.toJson(),
      'lastUsedAt': DateTime.now().millisecondsSinceEpoch,
    });
    await _commit(
      _accounts.map((other) => other.id == id ? updated : other).toList(),
    );
  });

  /// Serializes all devices (including their connection URLs) to JSON for
  /// backup / transfer. Note: URLs contain credentials — treat the export
  /// like a password file.
  String exportJson() => jsonEncode({
    'app': 'zflow',
    'format': 'devices',
    'version': 1,
    'exportedAt': DateTime.now().toIso8601String(),
    'accounts': _accounts.map((a) => a.toJson()).toList(),
  });

  /// Restores devices from an export. Skips invalid URLs and duplicates
  /// (matched by connection URL). Returns how many were imported.
  Future<int> importJson(String raw) => _serial(() async {
    final decoded = jsonDecode(raw);
    final list = decoded is Map ? decoded['accounts'] : decoded;
    if (list is! List) {
      throw const FormatException('不是有效的设备导出文件');
    }
    var added = 0;
    final next = [..._accounts];
    for (final item in list) {
      if (item is! Map) continue;
      final account = Account.fromJson(item.cast<String, dynamic>());
      if (account.url.isEmpty) continue;
      if (ZflowConnectionParams.parse(account.url)?.backendType !=
          BackendType.kayingcode) {
        continue;
      }
      if (next.any(
        (a) => a.url == account.url || profileKey(a) == profileKey(account),
      )) {
        continue;
      }
      next.add(account);
      added++;
    }
    if (added > 0) {
      await _commit(next);
    }
    return added;
  });
}
