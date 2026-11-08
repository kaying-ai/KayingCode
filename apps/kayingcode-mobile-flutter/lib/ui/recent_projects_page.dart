import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../state/account_store.dart';
import '../state/recent_projects.dart';
import 'theme.dart';
import 'zcode_webview_page.dart';

/// 项目列表（对齐 Taro RecentProjects）：按桌面连接分组、按最近使用排序，
/// 仅折叠 Windows 盘符路径的分隔符别名；点击仍以原始键打开 Web 工作台。
class RecentProjectsPage extends StatefulWidget {
  final AccountStore store;
  const RecentProjectsPage({super.key, required this.store});

  @override
  State<RecentProjectsPage> createState() => _RecentProjectsPageState();
}

class _RecentProjectsPageState extends State<RecentProjectsPage> {
  late Future<List<RecentProject>> _projects;
  late String _accountSignature;

  @override
  void initState() {
    super.initState();
    _accountSignature = _accountSignatureOf();
    _projects = RecentProjects.load(widget.store);
    widget.store.addListener(_onStoreChanged);
  }

  String _accountSignatureOf() => widget.store.accounts
      .map(
        (account) =>
            '${account.id}\u0000${account.label}\u0000${account.backendType.name}',
      )
      .join('\u0001');

  /// 增删或重命名设备后重新过滤项目；连接状态变化不触发重载。
  void _onStoreChanged() {
    final next = _accountSignatureOf();
    if (!mounted || next == _accountSignature) return;
    _accountSignature = next;
    setState(() => _projects = RecentProjects.load(widget.store));
  }

  @override
  void dispose() {
    widget.store.removeListener(_onStoreChanged);
    super.dispose();
  }

  Future<void> _open(RecentProject project) async {
    final account = widget.store.find(project.accountId);
    if (account == null) return;
    await BotWebviewPage.open(
      context,
      account,
      widget.store,
      workspaceKey: project.workspaceKey,
      deviceSid: project.deviceSid,
    );
    if (mounted) {
      setState(() => _projects = RecentProjects.load(widget.store));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return FutureBuilder<List<RecentProject>>(
      future: _projects,
      builder: (context, snapshot) {
        final projects = snapshot.data ?? const <RecentProject>[];
        final groups = groupRecentProjects(projects);
        final count = groups.values.fold<int>(
          0,
          (total, items) => total + items.length,
        );
        final loading = snapshot.connectionState != ConnectionState.done;
        final labels = <String, String>{
          for (final account in widget.store.accounts) account.id: account.label,
        };
        return ListView(
          padding: const EdgeInsets.all(EmberSpacing.page),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tr(context, 'nav.projects'),
                        style: TextStyle(
                          fontSize: EmberType.title,
                          fontWeight: FontWeight.w700,
                          color: colors.primary,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        tr(context, 'project.caption'),
                        style: TextStyle(
                          fontSize: EmberType.secondary,
                          color: colors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (count > 0)
                  Container(
                    margin: const EdgeInsets.only(top: 2),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      border: Border.all(color: colors.hairline),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      tr(context, 'project.count', args: {'count': count}),
                      style: TextStyle(
                        fontSize: EmberType.secondary,
                        color: colors.textSoft,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            if (count == 0)
              _ProjectStatus(loading: loading, failed: snapshot.hasError),
            for (final group in groups.entries) ...[
              const SizedBox(height: 20),
              Row(
                children: [
                  Icon(
                    Icons.desktop_windows_outlined,
                    size: 16,
                    color: colors.textMuted,
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      labels[group.key] ?? tr(context, 'project.defaultDevice'),
                      style: TextStyle(
                        fontSize: EmberType.secondary,
                        fontWeight: FontWeight.w600,
                        color: colors.textMuted,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Container(
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: colors.panel,
                  border: Border.all(color: colors.hairline),
                  borderRadius: BorderRadius.circular(EmberRadius.content),
                ),
                child: Column(
                  children: [
                    for (
                      var index = 0;
                      index < group.value.length;
                      index++
                    ) ...[
                      if (index > 0)
                        Divider(height: 1, color: colors.hairline),
                      _ProjectRow(
                        project: group.value[index],
                        onOpen: () => _open(group.value[index]),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _ProjectStatus extends StatelessWidget {
  final bool loading;
  final bool failed;

  const _ProjectStatus({required this.loading, required this.failed});

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      decoration: BoxDecoration(
        color: colors.panel,
        border: Border.all(color: colors.hairline),
        borderRadius: BorderRadius.circular(EmberRadius.content),
      ),
      child: Column(
        children: [
          if (loading)
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: colors.textSoft,
              ),
            )
          else
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colors.raise,
                borderRadius: BorderRadius.circular(EmberRadius.control),
              ),
              child: Icon(
                failed ? Icons.error_outline : Icons.grid_view_rounded,
                size: 20,
                color: colors.textSoft,
              ),
            ),
          const SizedBox(height: 10),
          Text(
            tr(
              context,
              loading
                  ? 'project.loading'
                  : failed
                  ? 'project.loadErrorTitle'
                  : 'project.emptyTitle',
            ),
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: EmberType.body,
              fontWeight: FontWeight.w600,
              color: colors.textSolid,
            ),
          ),
          if (!loading) ...[
            const SizedBox(height: 4),
            Text(
              tr(
                context,
                failed ? 'project.loadErrorHint' : 'project.emptyHint',
              ),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: EmberType.secondary,
                height: EmberType.lineHeight,
                color: colors.textMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProjectRow extends StatelessWidget {
  final RecentProject project;
  final VoidCallback onOpen;

  const _ProjectRow({required this.project, required this.onOpen});

  static String _folderName(String path) {
    final parts = path.split(RegExp(r'[\\/]')).where((part) => part.isNotEmpty);
    return parts.isEmpty ? path : parts.last;
  }

  // 窄屏长路径可换行：只在展示串的目录分隔符后插入零宽空格，导航键保持原值。
  static String _wrappablePath(String path) => path.replaceAllMapped(
    RegExp(r'([\\/])'),
    (match) => '${match[1]}\u200B',
  );

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.raise,
                  borderRadius: BorderRadius.circular(EmberRadius.control),
                ),
                child: Icon(
                  Icons.grid_view_rounded,
                  size: 18,
                  color: colors.textSoft,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _folderName(project.workspacePath),
                      style: TextStyle(
                        fontSize: EmberType.body,
                        fontWeight: FontWeight.w600,
                        color: colors.primary,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _wrappablePath(project.workspacePath),
                      style: TextStyle(
                        fontSize: EmberType.secondary,
                        height: EmberType.lineHeight,
                        color: colors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, size: 18, color: colors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
