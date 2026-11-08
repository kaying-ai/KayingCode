import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'account_store.dart';
import '../protocol/backend/backend_type.dart';

class RecentProject {
  final String accountId;
  final String workspacePath;
  final String? workspaceIdentity;
  final int lastUsedAt;
  final String? deviceSid;
  const RecentProject(
    this.accountId,
    this.workspacePath,
    this.workspaceIdentity,
    this.lastUsedAt, [
    this.deviceSid,
  ]);
  String get workspaceKey => workspaceIdentity?.trim().isNotEmpty == true
      ? workspaceIdentity!.trim()
      : workspacePath;
  String get key => projectKey(this);
  Map<String, dynamic> toJson() => {
    'accountId': accountId,
    'workspacePath': workspacePath,
    if (workspaceIdentity != null) 'workspaceIdentity': workspaceIdentity,
    'lastUsedAt': lastUsedAt,
    if (deviceSid != null) 'deviceSid': deviceSid,
  };
  static RecentProject? parse(
    String accountId,
    dynamic message, {
    int? usedAt,
  }) {
    if (message is! Map || message['type'] != 'kayingcode.project-opened.v1') {
      return null;
    }
    final path = message['workspacePath'];
    final identity = message['workspaceIdentity'];
    if (path is! String ||
        path.trim().isEmpty ||
        path.length > 8192 ||
        (identity != null && (identity is! String || identity.length > 8192))) {
      return null;
    }
    final sid = message['deviceSid'];
    if (sid != null && (sid is! String || sid.isEmpty || sid.length > 512)) {
      return null;
    }
    return RecentProject(
      accountId,
      path,
      identity is String && identity.trim().isNotEmpty ? identity.trim() : null,
      usedAt ?? DateTime.now().millisecondsSinceEpoch,
      sid as String?,
    );
  }
}

/// 导航与去重使用的项目键：桌面连接 + 实际设备 + 显式身份或原始路径。
String projectKey(RecentProject project, {String? workspacePath}) {
  final identity = project.workspaceIdentity?.trim();
  final key = identity == null || identity.isEmpty
      ? (workspacePath ?? project.workspacePath)
      : identity;
  return jsonEncode([project.accountId, project.deviceSid ?? '', key]);
}

/// 按连接分组并按最近使用排序；仅在展示层折叠 Windows 盘符路径的分隔符别名。
/// 导航仍使用原始记录，不改变持久化内容。
Map<String, List<RecentProject>> groupRecentProjects(
  Iterable<RecentProject> projects,
) {
  final groups = <String, List<RecentProject>>{};
  final seen = <String>{};
  // Dart 的 sort 不稳定：时间相同时按原顺序兜底，与 Taro 的稳定排序一致。
  final ordered = projects.toList().asMap().entries.toList()
    ..sort((a, b) {
      final byTime = b.value.lastUsedAt.compareTo(a.value.lastUsedAt);
      return byTime != 0 ? byTime : a.key.compareTo(b.key);
    });
  for (final entry in ordered) {
    final project = entry.value;
    final identity = project.workspaceIdentity?.trim();
    if ((identity == null || identity.isEmpty) &&
        RegExp(r'^[a-z]:[\\/]', caseSensitive: false).hasMatch(
          project.workspacePath,
        )) {
      final displayKey = projectKey(
        project,
        workspacePath: project.workspacePath.replaceAll('\\', '/'),
      );
      if (!seen.add(displayKey)) continue;
    }
    (groups[project.accountId] ??= <RecentProject>[]).add(project);
  }
  return groups;
}

/// 只保存导航提示，不缓存 Host session、授权 URL 或业务事实。
class RecentProjects {
  static const storageKey = 'mobileRecentProjectsV1';
  static Future<void> _writes = Future.value();
  static Future<List<RecentProject>> load(AccountStore store) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(storageKey);
    if (raw == null) return [];
    try {
      final items = jsonDecode(raw);
      if (items is! List) return [];
      return [
        for (final item in items)
          if (item is Map &&
              item['accountId'] is String &&
              item['lastUsedAt'] is int &&
              store.find(item['accountId'])?.backendType ==
                  BackendType.kayingcode)
            if (RecentProject.parse(item['accountId'], {
                  ...item,
                  'type': 'kayingcode.project-opened.v1',
                }, usedAt: item['lastUsedAt'])
                case final RecentProject project)
              project,
      ];
    } catch (_) {
      return [];
    }
  }

  static Future<void> remember(
    AccountStore store,
    String accountId,
    dynamic message,
  ) {
    final project = RecentProject.parse(accountId, message);
    if (project == null ||
        store.find(accountId)?.backendType != BackendType.kayingcode) {
      return Future.value();
    }
    final next = _writes.catchError((Object _) {}).then((_) async {
      final items = await load(store);
      final prefs = await SharedPreferences.getInstance();
      final saved = await prefs.setString(
        storageKey,
        jsonEncode(
          [
            project,
            ...items.where((p) => p.key != project.key),
          ].take(50).map((p) => p.toJson()).toList(),
        ),
      );
      if (!saved) throw StateError('Recent project storage failed');
    });
    _writes = next;
    return next;
  }
}
