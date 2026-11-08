import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_locale.dart';
import '../l10n/formatting.dart';
import '../l10n/strings.dart';
import '../protocol/channel_client.dart';
import '../protocol/conversation.dart';
import '../protocol/rpc_result.dart';
import '../protocol/zflow_client.dart';
import '../state/log_store.dart';
import '../state/session_list_cache.dart';
import 'ember_pressable.dart';
import 'task_detail_page.dart';
import 'text_input_dialog.dart';
import 'theme.dart';

part 'session_drawer_controller.dart';

/// Conversation list primitives shared by the session drawer (Ember shell):
/// task entries are the primary data (zcode-task listTasks), enriched by
/// the live `sessions-index` subscription — the pre-redesign task_home
/// skeleton, restored (UI 大改期间曾倒置为索引单一源,已回退).

/// Newest first, by last activity.
List<SessionEntry> sortSessions(List<SessionEntry> entries) {
  final list = [...entries]
    ..sort((a, b) => b.lastActivityAt.compareTo(a.lastActivityAt));
  return list;
}

/// Status dot color: running/prewarming → run blue, waiting → warn yellow,
/// anything else renders no dot. Locked to the dark palette (the Ember
/// design baseline), independent of theme.
Color? statusDotColor(String phase) => switch (phase) {
  'running' || 'prewarming' => EmberColors.dark().run,
  'waiting' => EmberColors.dark().warn,
  _ => null,
};

/// 标题 contains 过滤(大小写不敏感;空白查询返回原列表)。
List<SessionEntry> filterSessions(List<SessionEntry> entries, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return entries;
  return entries
      .where(
        (e) => '${e.title}\n${e.lastAssistantPreview ?? ''}'
            .toLowerCase()
            .contains(q),
      )
      .toList(growable: false);
}

/// 摘要使用纯文本，不把 Markdown 标记和换行带进会话列表。
String sessionPreviewText(String value) => value
    .replaceAll(RegExp(r'```[^\n]*\n?|```|~~~[^\n]*\n?|~~~'), ' ')
    .replaceAllMapped(RegExp(r'!?\[([^\]]*)\]\([^)]*\)'), (m) => m[1] ?? '')
    .replaceAll(RegExp(r'<[^>]+>'), '')
    .replaceAll(
      RegExp(
        r'^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)',
        multiLine: true,
      ),
      '',
    )
    .replaceAll(RegExp(r'[*_`~]'), '')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

List<SessionEntry> visibleRecentSessions(
  List<SessionEntry> entries, {
  required String query,
  required bool showAll,
}) {
  final filtered = filterSessions(entries, query);
  return showAll || query.trim().isNotEmpty
      ? filtered
      : filtered.take(5).toList();
}

/// 两档分组(活跃/归档;键序即展示序)。[sorted] 需为 sortSessions 的
/// 降序输出;归档条目(isArchived)单独成组,其余全入活跃组(置顶项在
/// 活跃组内排最前,保持 sorted 顺序)。空组剔除,展示文案由调用方按键
/// 映射。
Map<String, List<SessionEntry>> groupSessions(
  List<SessionEntry> sorted,
  Set<String> pinnedIds,
) {
  final pinned = <SessionEntry>[];
  final active = <SessionEntry>[];
  final archived = <SessionEntry>[];
  for (final e in sorted) {
    if (e.isArchived) {
      archived.add(e);
    } else if (pinnedIds.contains(e.sessionId)) {
      pinned.add(e);
    } else {
      active.add(e);
    }
  }
  return {
    'active': [...pinned, ...active],
    'archived': archived,
  }..removeWhere((_, v) => v.isEmpty);
}

/// Today → `HH:mm`, yesterday → `昨天`, within the last week → `周X`,
/// else `M月d日` (with year when it differs from today's).
/// 会话最近活跃时间(对照桌面端 sidePane.time 阶梯):刚刚 / N 分钟前 /
/// N 小时前 / N 天前;超过一周落回日期(昨天带时刻,本周内周X,更早
/// M月d日 / 年月日)。
String _relativeDayLabel(int millis) =>
    relativeDayLabel(AppLocale.current, millis);

/// 会话抽屉面板(spec §7.1):工作区条 / 搜索 / ＋新会话 / 分组会话列表
/// (置顶/今天/更早三档,置顶集来自 listPinnedTasks;运行中蓝点、等待
/// 黄点)/「管理」多选(置顶/归档/删除,走 zcode-task RPC)/ 底部设备
/// 状态条。宿主(root_shell 的 _DrawerHost)约束 76% 宽、滑出动画与遮罩。
/// onPick(null) = 新会话;列表条目点击 = 打开该会话。
class SessionDrawer extends StatefulWidget {
  final BridgeSession bridge;

  /// `{workspacePath, workspaceIdentity?}` — 列表订阅与任务 RPC 的 scope。
  final Map<String, dynamic> scope;

  /// 工作区条展示值(宿主经 root_shell.workspaceTitle / workspacePath 取好)。
  final String workspaceName;
  final String workspacePath;

  /// 当前内嵌会话 id(null = draft),列表高亮用。
  final String? currentSessionId;

  /// 选择会话(null = 新会话)。宿主负责关闭抽屉。
  final ValueChanged<String?> onPick;
  final ValueChanged<SessionEntry>? onOpenEntry;

  /// 「辅助对话」入口:基于当前内嵌会话创建 side session(宿主实现;
  /// 草稿态按钮禁用)。
  final VoidCallback onOpenSideChat;
  final ValueChanged<String>? onOpenSideChatFor;

  /// 工作区条 ⌄:宿主弹出工作区切换 sheet;携带当前工作区的实时会话数
  /// (取自本抽屉的在途 sessions-index 订阅;其他工作区无数据来源,由
  /// 宿主决定不显示)。
  final ValueChanged<int> onSwitchWorkspace;

  /// 当前内嵌会话从 sessions-index 消失(本抽屉曾见到、后被删除/归档)
  /// 时回调宿主复位到 draft。订阅失败或列表未就绪不触发。
  final VoidCallback onCurrentSessionVanished;

  /// 底部设备状态条点击:进设备管理页。
  final VoidCallback onManageDevices;

  final int deviceCount;
  final bool deviceOnline;

  /// 抽屉是否展开(壳注入)。打开期间周期重拉任务归属,桌面端的归档/
  /// 删除操作才能同步进分组;关闭时不刷。
  final bool open;

  /// 作为底栏的完整会话列表页使用时，搜索、新建与管理收在活跃工具栏。
  final bool pageMode;

  const SessionDrawer({
    super.key,
    required this.bridge,
    required this.scope,
    required this.workspaceName,
    required this.workspacePath,
    required this.currentSessionId,
    required this.onPick,
    this.onOpenEntry,
    required this.onOpenSideChat,
    this.onOpenSideChatFor,
    required this.onSwitchWorkspace,
    required this.onCurrentSessionVanished,
    required this.onManageDevices,
    required this.deviceCount,
    required this.deviceOnline,
    this.open = false,
    this.pageMode = false,
  });

  @override
  State<SessionDrawer> createState() => _SessionDrawerState();
}

/// 抽屉视图:搜索/多选/对话框/导航与布局。会话数据、订阅、管理 RPC
/// 的所有权在 [SessionDrawerController](同库 part 文件),经 onChanged
/// 收到重绘通知。
class _SessionDrawerState extends State<SessionDrawer> {
  final _searchController = TextEditingController();

  String _query = '';
  bool _searchOpen = false;
  bool _expanded = true;
  bool _showAll = false;

  /// 多选管理模式(「管理」入口 / 长按快捷进入)。
  bool _managing = false;
  final Set<String> _selected = {};

  late SessionDrawerController _controller;

  @override
  void initState() {
    super.initState();
    if (diagLogEnabled.value) {
      debugPrint('[zflow] SessionDrawer initState #$hashCode');
    }
    _controller = SessionDrawerController(
      bridge: widget.bridge,
      scope: widget.scope,
      onChanged: () {
        if (mounted) setState(() {});
      },
      onVanished: () => widget.onCurrentSessionVanished(),
    );
    _controller.setCurrentSessionId(widget.currentSessionId);
    _controller.start(open: widget.open);
  }

  @override
  void didUpdateWidget(SessionDrawer oldWidget) {
    super.didUpdateWidget(oldWidget);
    final sourceChanged = !_controller.sourceMatches(
      widget.bridge,
      widget.scope,
    );
    if (oldWidget.currentSessionId != widget.currentSessionId) {
      _controller.setCurrentSessionId(widget.currentSessionId);
    }
    if (sourceChanged) {
      setState(() {
        _managing = false;
        _selected.clear();
        _searchOpen = false;
        _expanded = true;
        _showAll = false;
        _query = '';
        _searchController.clear();
      });
      _controller.reattach(widget.bridge, widget.scope);
    } else if (widget.open && !oldWidget.open) {
      // 每次展开都拿最新归属(桌面端可能归档/删除过任务)。
      _controller.open = true;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _searchController.dispose();
    super.dispose();
  }

  /// 搜索过滤后的活跃显示列表(controller 数据 + 视图查询词)。
  List<SessionEntry> get _filtered =>
      filterSessions(_controller.displayActive, _query);

  // ---------------------------------------------------- manage actions (view)

  /// 批量操作入口:RPC 与守卫在 controller,视图传当前多选并接管完成
  /// 后的模式退出与提示。
  Future<void> _applySelection(
    String method,
    String failureKey, {
    bool? pinned,
  }) {
    return _controller.applySelection(
      method,
      selected: Set<String>.of(_selected),
      pinned: pinned,
      onFinished: (failed) {
        if (!mounted) return;
        setState(() {
          _managing = false;
          _selected.clear();
        });
        if (failed > 0) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(tr(context, failureKey, args: {'count': failed})),
            ),
          );
        }
      },
    );
  }

  /// 单条操作入口:失败提示在视图层。
  Future<void> _itemAction(
    String method,
    SessionEntry entry,
    String failureKey, {
    Map<String, dynamic>? args,
    DrawerActionSource? actionSource,
  }) {
    return _controller.itemAction(
      method,
      entry,
      args: args,
      actionSource: actionSource,
      onError: (message) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(
                context,
                'session.actionFailed',
                args: {'action': tr(context, failureKey), 'error': message},
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _deleteSelection() async {
    if (_selected.isEmpty) return;
    final source = _controller.captureActionSource(_selected);
    if (!_selected.every(
      (id) => _controller.isCurrentActionSource(source, id),
    )) {
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'session.deleteTitle')),
        content: Text(
          tr(
            context,
            'session.deleteSelectedBody',
            args: {'count': _selected.length},
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr(context, 'session.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: EmberColors.of(context).err,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr(context, 'action.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _controller.applySelection(
      'deleteTask',
      selected: Set<String>.of(_selected),
      actionSource: source,
      onFinished: (failed) {
        if (!mounted) return;
        setState(() {
          _managing = false;
          _selected.clear();
        });
        if (failed > 0) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                tr(
                  context,
                  'session.deleteFailedCount',
                  args: {'count': failed},
                ),
              ),
            ),
          );
        }
      },
    );
  }

  // ---------------------------------------------------- single-item actions

  /// 长按单条操作(UI 大改前的单条能力恢复;RPC 与旧版 task_home 同源):
  /// 活跃条目 = 置顶/重命名/归档/删除/查看原始快照;归档条目 =
  /// 取消归档/删除/查看原始快照。批量多选仍走「管理」。
  Future<void> _showItemActions(SessionEntry entry) async {
    final source = _controller.captureActionSource([entry.sessionId]);
    if (!_controller.isCurrentActionSource(source, entry.sessionId)) return;
    final colors = EmberColors.of(context);
    final pinned = _controller.pinnedIds.contains(entry.sessionId);
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                EmberSpacing.page,
                0,
                EmberSpacing.page,
                EmberSpacing.gapS,
              ),
              child: Text(
                entry.title.isEmpty
                    ? tr(context, 'session.actions')
                    : entry.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: EmberType.body,
                  fontWeight: FontWeight.w600,
                  color: colors.textSolid,
                ),
              ),
            ),
            if (!entry.isArchived) ...[
              if (widget.onOpenSideChatFor != null)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.quickreply_outlined, size: 20),
                  title: Text(tr(context, 'session.sideChat')),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    if (_controller.isCurrentActionSource(
                      source,
                      entry.sessionId,
                    )) {
                      widget.onOpenSideChatFor!(entry.sessionId);
                    }
                  },
                ),
              ListTile(
                dense: true,
                leading: Icon(
                  pinned ? Icons.push_pin : Icons.push_pin_outlined,
                  size: 20,
                ),
                title: Text(
                  pinned
                      ? tr(context, 'action.unpin')
                      : tr(context, 'action.pin'),
                ),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _itemAction(
                    'setTaskPinned',
                    entry,
                    'session.pinFailed',
                    actionSource: source,
                    args: _controller.taskArgs(
                      entry.sessionId,
                      pinned: !pinned,
                      scope: source.scope,
                    ),
                  );
                },
              ),
              ListTile(
                dense: true,
                leading: const Icon(Icons.edit_outlined, size: 20),
                title: Text(tr(context, 'action.rename')),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _renameEntry(entry, source);
                },
              ),
              ListTile(
                dense: true,
                leading: const Icon(Icons.archive_outlined, size: 20),
                title: Text(tr(context, 'action.archive')),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _itemAction(
                    'archiveTask',
                    entry,
                    'session.archiveFailed',
                    actionSource: source,
                  );
                },
              ),
            ] else
              ListTile(
                dense: true,
                leading: const Icon(Icons.unarchive_outlined, size: 20),
                title: Text(tr(context, 'action.unarchive')),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _itemAction(
                    'unarchiveTask',
                    entry,
                    'session.unarchiveFailed',
                    actionSource: source,
                  );
                },
              ),
            ListTile(
              dense: true,
              leading: const Icon(Icons.code, size: 20),
              title: Text(tr(context, 'session.viewRawSnapshot')),
              onTap: () {
                Navigator.pop(sheetContext);
                if (!_controller.isCurrentActionSource(
                  source,
                  entry.sessionId,
                )) {
                  return;
                }
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => TaskDetailPage(
                      taskId: entry.sessionId,
                      title: entry.title.isEmpty
                          ? tr(context, 'nav.taskDetail')
                          : entry.title,
                      scope: source.scope,
                      session: source.bridge,
                    ),
                  ),
                );
              },
            ),
            ListTile(
              dense: true,
              leading: Icon(Icons.delete_outline, size: 20, color: colors.err),
              title: Text(
                tr(context, 'action.delete'),
                style: TextStyle(color: colors.err),
              ),
              onTap: () {
                Navigator.pop(sheetContext);
                _deleteEntry(entry, source);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _renameEntry(
    SessionEntry entry,
    DrawerActionSource source,
  ) async {
    if (!_controller.isCurrentActionSource(source, entry.sessionId)) return;
    final title = await TextInputDialog.show(
      context,
      title: tr(context, 'session.renameTitle'),
      initial: entry.title,
      autofocus: true,
    );
    if (title == null ||
        title.isEmpty ||
        !_controller.isCurrentActionSource(source, entry.sessionId)) {
      return;
    }
    await _itemAction(
      'renameTask',
      entry,
      'session.renameFailed',
      actionSource: source,
      args: {
        ..._controller.taskArgs(entry.sessionId, scope: source.scope),
        'title': title,
      },
    );
  }

  Future<void> _deleteEntry(
    SessionEntry entry,
    DrawerActionSource source,
  ) async {
    if (!_controller.isCurrentActionSource(source, entry.sessionId)) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'session.deleteTitle')),
        content: Text(
          tr(
            context,
            'session.deleteOneBody',
            args: {'name': entry.title.isEmpty ? entry.sessionId : entry.title},
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr(context, 'session.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: EmberColors.of(context).err,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr(context, 'action.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true ||
        !_controller.isCurrentActionSource(source, entry.sessionId)) {
      return;
    }
    await _itemAction(
      'deleteTask',
      entry,
      'session.deleteFailed',
      actionSource: source,
    );
  }

  // -------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return Material(
      color: widget.pageMode ? colors.bg : colors.card,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildWorkspaceBar(context),
          if (widget.pageMode && _expanded) _buildPageToolbar(context),
          if (_expanded && (!widget.pageMode || _searchOpen))
            _buildSearchField(context),
          if (!widget.pageMode)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                EmberSpacing.page,
                0,
                EmberSpacing.page,
                EmberSpacing.gapS,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: _DashedActionButton(
                      label: tr(context, 'session.new'),
                      onTap: () => widget.onPick(null),
                    ),
                  ),
                  // 辅助对话(原顶栏入口移此):基于当前内嵌会话创建
                  // side session;草稿态(无会话)禁用。
                  const SizedBox(width: EmberSpacing.gapS),
                  Expanded(
                    child: _DashedActionButton(
                      label: tr(context, 'session.sideChat'),
                      icon: Icons.quickreply_outlined,
                      enabled: widget.currentSessionId != null,
                      onTap: widget.onOpenSideChat,
                    ),
                  ),
                ],
              ),
            ),
          if (_managing)
            _buildSelectionBar(context)
          else if (!widget.pageMode && _controller.entries.isNotEmpty)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => setState(() => _managing = true),
                child: Text(tr(context, 'session.manage')),
              ),
            ),
          Expanded(
            child: _expanded
                ? _buildListArea(context)
                : const SizedBox.shrink(),
          ),
          if (_managing && _selected.isNotEmpty) _buildActionBar(context),
          if (!widget.pageMode) _buildDeviceBar(context),
        ],
      ),
    );
  }

  Widget _buildPageToolbar(BuildContext context) {
    final colors = EmberColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        EmberSpacing.page + EmberSpacing.cardPad,
        0,
        EmberSpacing.page,
        0,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              tr(context, 'session.activeGroup'),
              style: TextStyle(
                fontSize: EmberType.caption,
                fontWeight: FontWeight.w600,
                color: colors.textFaint,
              ),
            ),
          ),
          IconButton(
            tooltip: _searchOpen
                ? tr(context, 'session.searchCollapse')
                : tr(context, 'session.searchSessions'),
            onPressed: () => setState(() {
              _searchOpen = !_searchOpen;
              if (!_searchOpen) {
                _searchController.clear();
                _query = '';
              }
            }),
            icon: Icon(
              _searchOpen ? Icons.search_off_outlined : Icons.search,
              size: 20,
              color: _searchOpen ? colors.primary : colors.textMuted,
            ),
          ),
          if (!_controller.ready ||
              _controller.displayActive.isNotEmpty ||
              _controller.archived.isNotEmpty)
            IconButton(
              tooltip: tr(context, 'session.new'),
              onPressed: () => widget.onPick(null),
              icon: Icon(
                Icons.add_comment_outlined,
                size: 20,
                color: colors.textMuted,
              ),
            ),
          IconButton(
            tooltip: _managing
                ? tr(context, 'session.manageDone')
                : tr(context, 'session.manageSessions'),
            onPressed:
                _controller.entries.isEmpty &&
                    _controller.archived.isEmpty &&
                    _controller.seed.isEmpty
                ? null
                : () => setState(() {
                    _managing = !_managing;
                    if (!_managing) _selected.clear();
                  }),
            icon: Icon(
              _managing ? Icons.close : Icons.tune_outlined,
              size: 20,
              color: _managing ? colors.primary : colors.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWorkspaceBar(BuildContext context) {
    final colors = EmberColors.of(context);
    return InkWell(
      onTap: () => widget.onSwitchWorkspace(_controller.entries.length),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          EmberSpacing.page,
          EmberSpacing.gapM,
          EmberSpacing.page,
          EmberSpacing.gapM,
        ),
        child: Row(
          children: [
            if (widget.pageMode)
              IconButton(
                tooltip: _expanded
                    ? tr(context, 'session.collapseWorkspace')
                    : tr(context, 'session.expandWorkspace'),
                onPressed: () => setState(() => _expanded = !_expanded),
                icon: Icon(
                  _expanded ? Icons.expand_more : Icons.chevron_right,
                  size: 20,
                ),
              ),
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: colors.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(EmberRadius.avatar),
              ),
              child: Icon(Icons.folder_open, size: 16, color: colors.primary),
            ),
            const SizedBox(width: EmberSpacing.gapS),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.workspaceName,
                    style: TextStyle(
                      fontSize: EmberType.emphasis,
                      fontWeight: FontWeight.w600,
                      color: colors.textSolid,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (widget.workspacePath.isNotEmpty)
                    Text(
                      widget.workspacePath,
                      style: TextStyle(
                        fontSize: EmberType.caption,
                        fontFamily: EmberFonts.term,
                        color: colors.textFaint,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            Icon(Icons.keyboard_arrow_down, size: 20, color: colors.textMuted),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchField(BuildContext context) {
    final colors = EmberColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        EmberSpacing.page,
        0,
        EmberSpacing.page,
        EmberSpacing.gapS,
      ),
      child: TextField(
        controller: _searchController,
        autofocus: widget.pageMode,
        style: TextStyle(fontSize: EmberType.body, color: colors.textSolid),
        decoration: InputDecoration(
          isDense: true,
          hintText: tr(context, 'session.searchSessions'),
          hintStyle: TextStyle(color: colors.textFaint),
          border: widget.pageMode ? InputBorder.none : null,
          enabledBorder: widget.pageMode ? InputBorder.none : null,
          focusedBorder: widget.pageMode ? InputBorder.none : null,
          filled: widget.pageMode ? false : null,
          contentPadding: widget.pageMode
              ? const EdgeInsets.symmetric(vertical: 10)
              : null,
          prefixIcon: Icon(Icons.search, size: 18, color: colors.textFaint),
          suffixIcon: _query.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(Icons.clear, size: 16),
                  onPressed: () {
                    _searchController.clear();
                    setState(() => _query = '');
                  },
                ),
        ),
        onChanged: (v) => setState(() => _query = v),
      ),
    );
  }

  Widget _buildSelectionBar(BuildContext context) {
    final colors = EmberColors.of(context);
    return Container(
      color: colors.primary.withValues(alpha: 0.15),
      padding: const EdgeInsets.symmetric(
        horizontal: EmberSpacing.page,
        vertical: 6,
      ),
      child: Row(
        children: [
          Icon(Icons.checklist, size: 16, color: colors.primary),
          const SizedBox(width: EmberSpacing.gapS),
          Expanded(
            child: Text(
              tr(
                context,
                'session.selectedCount',
                args: {'count': _selected.length},
              ),
              style: TextStyle(
                fontSize: EmberType.secondary,
                fontWeight: FontWeight.w600,
                color: colors.primary,
              ),
            ),
          ),
          TextButton(
            onPressed: () => setState(() {
              _managing = false;
              _selected.clear();
            }),
            child: Text(tr(context, 'session.cancel')),
          ),
        ],
      ),
    );
  }

  Widget _buildActionBar(BuildContext context) {
    final colors = EmberColors.of(context);
    return Container(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: colors.hairline)),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: EmberSpacing.page,
        vertical: EmberSpacing.gapS,
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _controller.acting
                  ? null
                  : () => _applySelection(
                      'setTaskPinned',
                      'session.pinFailedCount',
                      pinned: true,
                    ),
              child: Text(tr(context, 'action.pin')),
            ),
          ),
          const SizedBox(width: EmberSpacing.gapS),
          Expanded(
            child: OutlinedButton(
              onPressed: _controller.acting
                  ? null
                  : () => _applySelection(
                      'archiveTask',
                      'session.archiveFailedCount',
                    ),
              child: Text(tr(context, 'action.archive')),
            ),
          ),
          const SizedBox(width: EmberSpacing.gapS),
          Expanded(
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: colors.err),
              onPressed: _controller.acting ? null : _deleteSelection,
              child: Text(tr(context, 'action.delete')),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildListArea(BuildContext context) {
    final colors = EmberColors.of(context);
    // A7:种子与实时列表共用同一搜索过滤语义。
    final seed = filterSessions(_controller.seed, _query);
    if (_controller.error != null) {
      // A3:订阅失败但离线种子可用 —— 展示种子列表兜底,横幅标记非最新。
      if (seed.isNotEmpty) {
        return Column(
          children: [
            _offlineBanner(context),
            Expanded(child: _buildSessionList(seed)),
          ],
        );
      }
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              tr(
                context,
                'session.loadFailed',
                args: {'error': _controller.error},
              ),
              style: TextStyle(
                fontSize: EmberType.caption,
                color: colors.textMuted,
              ),
            ),
            const SizedBox(height: EmberSpacing.gapS),
            TextButton(
              onPressed: _controller.subscribe,
              style: TextButton.styleFrom(foregroundColor: colors.primary),
              child: Text(tr(context, 'session.retry')),
            ),
          ],
        ),
      );
    }
    // 实时列表未到达时先展示离线种子(2c):仅当实时列表为空,数据到达即覆盖。
    if (!_controller.ready) {
      if (_controller.seed.isEmpty) {
        return const Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        );
      }
      return seed.isEmpty ? _noMatch(context) : _buildSessionList(seed);
    }
    final filtered = _filtered;
    final archived = filterSessions(_controller.archived, _query);
    if (filtered.isEmpty && archived.isEmpty) {
      if (_query.trim().isNotEmpty) return _noMatch(context);
      return Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: const EdgeInsets.all(EmberSpacing.page),
          child: ListTile(
            key: const ValueKey('empty-new-session'),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(EmberRadius.control),
            ),
            tileColor: colors.raise,
            leading: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: colors.primary,
                borderRadius: BorderRadius.circular(EmberRadius.control),
              ),
              child: Icon(
                Icons.add_comment_outlined,
                color: Theme.of(context).colorScheme.onPrimary,
              ),
            ),
            title: Text(tr(context, 'session.new')),
            subtitle: Text(tr(context, 'session.startNewChat')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => widget.onPick(null),
          ),
        ),
      );
    }
    return _buildSessionList(filtered);
  }

  Widget _noMatch(BuildContext context) {
    final colors = EmberColors.of(context);
    return Center(
      child: Text(
        tr(context, 'session.noMatch', args: {'query': _query}),
        style: TextStyle(fontSize: EmberType.caption, color: colors.textFaint),
      ),
    );
  }

  /// A3 离线横幅:订阅失败仍展示缓存种子时,顶部 muted 提示数据可能过期,
  /// 并保留重试入口。
  Widget _offlineBanner(BuildContext context) {
    final colors = EmberColors.of(context);
    return Container(
      width: double.infinity,
      color: colors.raise.withValues(alpha: 0.6),
      padding: const EdgeInsets.symmetric(
        horizontal: EmberSpacing.page,
        vertical: 4,
      ),
      child: Row(
        children: [
          Icon(Icons.cloud_off_outlined, size: 14, color: colors.textMuted),
          const SizedBox(width: EmberSpacing.gapS),
          Expanded(
            child: Text(
              tr(context, 'session.offline'),
              style: TextStyle(
                fontSize: EmberType.secondary,
                color: colors.textMuted,
              ),
            ),
          ),
          TextButton(
            onPressed: _controller.subscribe,
            style: TextButton.styleFrom(
              foregroundColor: colors.primary,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              minimumSize: const Size(0, 32),
            ),
            child: Text(tr(context, 'session.retry')),
          ),
        ],
      ),
    );
  }

  /// 分组会话列表(spec §7.1:置顶/今天/更早),实时列表与离线种子共用。
  static const _groupLabelKeys = {
    'active': 'session.activeGroup',
    'archived': 'session.archivedGroup',
  };

  Widget _buildSessionList(List<SessionEntry> entries) {
    final colors = EmberColors.of(context);
    final groups = groupSessions([
      ...entries,
      ...filterSessions(_controller.archived, _query),
    ], _controller.pinnedIds);
    final items = <({String group, SessionEntry? entry, int occurrence})>[];
    for (final group in groups.entries) {
      if (!widget.pageMode || group.key != 'active') {
        items.add((group: group.key, entry: null, occurrence: 0));
      }
      final occurrences = <String, int>{};
      final visible = widget.pageMode && !_managing
          ? visibleRecentSessions(group.value, query: _query, showAll: _showAll)
          : group.value;
      for (final entry in visible) {
        final occurrence = occurrences.update(
          entry.sessionId,
          (count) => count + 1,
          ifAbsent: () => 0,
        );
        items.add((group: group.key, entry: entry, occurrence: occurrence));
      }
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(
        horizontal: EmberSpacing.page,
        vertical: EmberSpacing.gapS,
      ),
      itemCount:
          items.length +
          (widget.pageMode &&
                  !_managing &&
                  _query.trim().isEmpty &&
                  groups.values.any((group) => group.length > 5)
              ? 1
              : 0),
      itemBuilder: (context, index) {
        if (index == items.length) {
          return TextButton(
            onPressed: () => setState(() => _showAll = !_showAll),
            child: Text(
              _showAll
                  ? tr(context, 'session.collapseSessions')
                  : tr(context, 'session.viewAll'),
            ),
          );
        }
        final item = items[index];
        final entry = item.entry;
        if (entry == null) {
          return KeyedSubtree(
            key: ValueKey('session-group-${item.group}'),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                EmberSpacing.cardPad,
                EmberSpacing.gapS,
                0,
                4,
              ),
              child: Text(
                tr(context, _groupLabelKeys[item.group] ?? item.group),
                style: TextStyle(
                  fontSize: EmberType.caption,
                  fontWeight: FontWeight.w600,
                  color: colors.textFaint,
                ),
              ),
            ),
          );
        }
        return KeyedSubtree(
          key: ValueKey(
            'session-row-${item.group}-${entry.sessionId}-${item.occurrence}',
          ),
          child: _buildRow(context, entry),
        );
      },
    );
  }

  Widget _buildRow(BuildContext context, SessionEntry entry) {
    final colors = EmberColors.of(context);
    final dot = statusDotColor(entry.phase);
    final selected = _selected.contains(entry.sessionId);
    final isCurrent = entry.sessionId == widget.currentSessionId;
    // 行按压缩放(spec §5 动效);InkWell 水波保留。
    return EmberPressable(
      child: InkWell(
        onTap: () {
          if (_managing) {
            setState(
              () => selected
                  ? _selected.remove(entry.sessionId)
                  : _selected.add(entry.sessionId),
            );
            return;
          }
          if (widget.onOpenEntry != null) {
            widget.onOpenEntry!(entry);
          } else {
            widget.onPick(entry.sessionId);
          }
        },
        onLongPress: () {
          if (_managing) return;
          _showItemActions(entry);
        },
        child: Container(
          margin: EdgeInsets.symmetric(vertical: widget.pageMode ? 4 : 0),
          padding: const EdgeInsets.symmetric(
            horizontal: EmberSpacing.cardPad,
            vertical: 10,
          ),
          decoration: BoxDecoration(
            color: selected
                ? colors.primary.withValues(alpha: 0.12)
                : isCurrent
                ? colors.raise.withValues(alpha: 0.6)
                : Colors.transparent,
            border: Border(bottom: BorderSide(color: colors.hairline)),
            borderRadius: BorderRadius.circular(EmberRadius.control),
          ),
          child: Row(
            children: [
              if (_managing) ...[
                Icon(
                  selected ? Icons.check_circle : Icons.radio_button_unchecked,
                  size: 18,
                  color: selected ? colors.primary : colors.textFaint,
                ),
                const SizedBox(width: EmberSpacing.gapM),
              ],
              SizedBox(
                width: 8,
                height: 8,
                child: dot == null
                    ? null
                    : DecoratedBox(
                        decoration: BoxDecoration(
                          color: dot,
                          shape: BoxShape.circle,
                        ),
                      ),
              ),
              const SizedBox(width: EmberSpacing.gapM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.title.isEmpty ? entry.sessionId : entry.title,
                      style: TextStyle(
                        fontSize: EmberType.body,
                        fontWeight: isCurrent
                            ? FontWeight.w600
                            : FontWeight.w400,
                        color: colors.textSolid,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (_controller.pinnedIds.contains(entry.sessionId))
                          tr(context, 'session.pinnedBadge'),
                        if (entry.phase == 'running' ||
                            entry.phase == 'prewarming')
                          tr(context, 'session.working'),
                        if (entry.phase == 'waiting' ||
                            entry.pendingInteraction != null)
                          tr(context, 'session.waitingAction'),
                        if ((entry.lastAssistantPreview ?? '')
                            .trim()
                            .isNotEmpty)
                          sessionPreviewText(entry.lastAssistantPreview!),
                      ].join(' · '),
                      style: TextStyle(
                        fontSize: EmberType.secondary,
                        color: colors.textMuted,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: EmberSpacing.gapS),
              Text(
                _relativeDayLabel(entry.lastActivityAt),
                style: TextStyle(
                  fontSize: EmberType.caption,
                  color: colors.textFaint,
                ),
              ),
              IconButton(
                tooltip: tr(context, 'session.actions'),
                onPressed: () => _showItemActions(entry),
                icon: Icon(Icons.more_horiz, size: 18, color: colors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDeviceBar(BuildContext context) {
    final colors = EmberColors.of(context);
    return InkWell(
      onTap: widget.onManageDevices,
      child: Container(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: colors.hairline)),
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: EmberSpacing.page,
          vertical: 10,
        ),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: widget.deviceOnline ? colors.ok : colors.textFaint,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: EmberSpacing.gapS),
            Text(
              tr(
                context,
                'session.deviceCount',
                args: {'count': widget.deviceCount},
              ),
              style: TextStyle(
                fontSize: EmberType.secondary,
                color: colors.textMuted,
              ),
            ),
            const Spacer(),
            Icon(Icons.chevron_right, size: 16, color: colors.textFaint),
          ],
        ),
      ),
    );
  }
}

/// 虚线「＋新会话」按钮(spec:虚线常驻入口)。
class _DashedActionButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  /// 前置图标(默认 ＋);[enabled] false 时整钮禁用置灰。
  final IconData icon;
  final bool enabled;

  const _DashedActionButton({
    required this.label,
    required this.onTap,
    this.icon = Icons.add,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    final tint = enabled ? colors.primary : colors.textFaint;
    return CustomPaint(
      painter: _DashedRectPainter(
        color: enabled ? colors.textFaint : colors.hairline,
      ),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(EmberRadius.control),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: tint),
              const SizedBox(width: EmberSpacing.gapS),
              Text(
                label,
                style: TextStyle(fontSize: EmberType.body, color: tint),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DashedRectPainter extends CustomPainter {
  static const _dashWidth = 4.0;
  static const _dashGap = 3.0;

  final Color color;

  _DashedRectPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(EmberRadius.control),
    );
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      var dist = 0.0;
      while (dist < metric.length) {
        final next = (dist + _dashWidth).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(dist, next), paint);
        dist = next + _dashGap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedRectPainter oldDelegate) =>
      oldDelegate.color != color;
}
