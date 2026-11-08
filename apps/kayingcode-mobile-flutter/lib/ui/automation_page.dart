import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_locale.dart';
import '../l10n/formatting.dart';
import '../l10n/strings.dart';
import '../protocol/channel_client.dart';
import '../protocol/zflow_client.dart';
import 'ember_pressable.dart';
import 'theme.dart';

/// Typed wrapper over the `zcode-agent` automation RPCs (arg shapes
/// verified live against the desktop):
///   listAutomations / listAutomationRuns / createAutomation /
///   updateAutomation / setAutomationEnabled / deleteAutomation
///   runAutomationNow / restartAutomation
/// (the last two + the lifecycleStatus/scheduleRule fields; schemas
/// verified in the host bundle).
/// plus the `off-peak-task` queue `list`.
/// Human-readable schedule: prefers the structured `scheduleRule`
/// ({unit: minute|hour|day|week, interval, hour, minute, weekday}) and
/// falls back to the raw cron expression. Pure for tests.
String scheduleLabel(Map<String, dynamic> automation) {
  final rule = automation['scheduleRule'];
  final cron = '${automation['cronExpr'] ?? ''}';
  if (rule is! Map) return cron.isEmpty ? '—' : cron;
  final unit = '${rule['unit'] ?? ''}';
  final interval = (rule['interval'] as num?)?.toInt() ?? 1;
  String two(int v) => v.toString().padLeft(2, '0');
  switch (unit) {
    case 'minute':
      return interval == 1
          ? t('automation.schedule.everyMinute')
          : t('automation.schedule.everyNMinutes', args: {'count': interval});
    case 'hour':
      return interval == 1
          ? t('automation.schedule.everyHour')
          : t('automation.schedule.everyNHours', args: {'count': interval});
    case 'day':
      final h = (rule['hour'] as num?)?.toInt() ?? 0;
      final m = (rule['minute'] as num?)?.toInt() ?? 0;
      final time = '${two(h)}:${two(m)}';
      return interval == 1
          ? t('automation.schedule.dailyAt', args: {'time': time})
          : t('automation.schedule.everyNDaysAt',
              args: {'count': interval, 'time': time});
    case 'week':
      final dow = rule['weekday'] ?? rule['dayOfWeek'];
      final idx = dow is num ? dow.toInt() : -1;
      final h = (rule['hour'] as num?)?.toInt() ?? 0;
      final m = (rule['minute'] as num?)?.toInt() ?? 0;
      final time = '${two(h)}:${two(m)}';
      // cron 的 weekday 0=周日、1=周一……6=周六；DateTime.weekday 为 1..7。
      final day = idx >= 0 && idx < 7
          ? weekdayShort(AppLocale.current, idx == 0 ? 7 : idx)
          : t('automation.schedule.everyWeek');
      return t(
        idx >= 0 && idx < 7
            ? 'automation.schedule.weeklyAt'
            : 'automation.schedule.everyWeekAt',
        args: {'day': day, 'time': time},
      );
    default:
      return cron.isEmpty ? '—' : cron;
  }
}

/// Chinese label for the automation lifecycle (host enum:
/// active|completed|failed|paused). Null for active — the default needs
/// no badge.
String? lifecycleLabel(String status) => switch (status) {
      'completed' => t('automation.lifecycle.completed'),
      'failed' => t('automation.lifecycle.failed'),
      'paused' => t('automation.lifecycle.paused'),
      _ => null,
    };

/// 生命周期徽色(spec §7.2:完成绿 / 失败红 / 其余灰)。
Color lifecycleColor(String status, EmberColors c) => switch (status) {
      'completed' => c.ok,
      'failed' => c.err,
      _ => c.textFaint,
    };

class AutomationApi {
  final BridgeSession bridge;
  final Map<String, dynamic> scope;

  AutomationApi({required this.bridge, required this.scope});

  Future<dynamic> _agent(String method, Map<String, dynamic> extra) =>
      bridge.channels.call(Channels.zcodeAgent, method, [
        {...scope, ...extra},
      ]);

  Future<List<Map<String, dynamic>>> listAutomations() async =>
      _asMaps(await _agent('listAutomations', {}));

  Future<List<Map<String, dynamic>>> listRuns(String automationId) async =>
      _asMaps(await _agent('listAutomationRuns', {'automationId': automationId}));

  Future<void> setEnabled(String automationId, bool enabled) =>
      _agent('setAutomationEnabled', {
        'automationId': automationId,
        'enabled': enabled,
      });

  Future<void> delete(String automationId) =>
      _agent('deleteAutomation', {'automationId': automationId});

  /// Queues an immediate run. Returns 'queued' | 'duplicate' | 'failed'.
  Future<String> runNow(String automationId) async {
    try {
      final res = await _agent(
          'runAutomationNow', {'automationId': automationId});
      return res is Map ? '${res['status'] ?? 'queued'}' : 'queued';
    } on ChannelRpcError {
      return 'failed';
    }
  }

  /// Restarts a completed/errored automation back to active scheduling.
  Future<void> restart(String automationId) =>
      _agent('restartAutomation', {'automationId': automationId});

  Future<void> create({
    required String title,
    required String cronExpr,
    required String prompt,
  }) =>
      _agent('createAutomation', {
        'title': title,
        'cronExpr': cronExpr,
        'prompt': prompt,
      });

  Future<void> update({
    required String automationId,
    String? title,
    String? cronExpr,
    String? prompt,
  }) =>
      _agent('updateAutomation', {
        'automationId': automationId,
        'title': ?title,
        'cronExpr': ?cronExpr,
        'prompt': ?prompt,
      });

  /// Off-peak (闲时算力) queue — separate channel, read-only.
  Future<List<Map<String, dynamic>>> offPeakQueue() async {
    final res = await bridge.channels.call(
        Channels.offPeakTask, 'list', [scope],
        timeout: const Duration(seconds: 8));
    return _asMaps(res);
  }

  static List<Map<String, dynamic>> _asMaps(dynamic res) {
    if (res is! List) return const [];
    return [
      for (final e in res)
        if (e is Map) e.cast<String, dynamic>(),
    ];
  }
}

String _fmtMs(num? v) {
  if (v == null) return '';
  final d = DateTime.fromMillisecondsSinceEpoch(v.toInt());
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
}

/// KV 格空值占位(spec §7.2)。
String _orDash(String v) => v.isEmpty ? '—' : v;

class AutomationPage extends StatefulWidget {
  final BridgeSession bridge;
  final Map<String, dynamic> workspace;

  /// Opens a task chat by sessionId (from a run's history entry).
  final void Function(String taskId, String title) onOpenTask;

  const AutomationPage({
    super.key,
    required this.bridge,
    required this.workspace,
    required this.onOpenTask,
  });

  @override
  State<AutomationPage> createState() => _AutomationPageState();
}

class _AutomationPageState extends State<AutomationPage> {
  late final AutomationApi _api;

  List<Map<String, dynamic>> _automations = const [];
  Map<String, List<Map<String, dynamic>>> _runs = {};
  List<Map<String, dynamic>> _queue = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = AutomationApi(
      bridge: widget.bridge,
      scope: {
        'workspacePath': widget.workspace['workspacePath'],
        if (widget.workspace['workspaceIdentity'] != null)
          'workspaceIdentity': widget.workspace['workspaceIdentity'],
      },
    );
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final autos = await _api.listAutomations();
      final runs = <String, List<Map<String, dynamic>>>{};
      await Future.wait(autos.map((a) async {
        final id = '${a['automationId']}';
        try {
          runs[id] = await _api.listRuns(id);
        } catch (_) {
          runs[id] = const [];
        }
      }));
      List<Map<String, dynamic>> queue = const [];
      try {
        queue = await _api.offPeakQueue();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _automations = autos;
        _runs = runs;
        _queue = queue;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  Future<void> _toggle(String id, bool enabled) async {
    try {
      await _api.setEnabled(id, enabled);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'automation.operationFailed', args: {'error': e}),
            ),
          ),
        );
      }
    }
  }

  Future<void> _delete(Map<String, dynamic> a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'automation.deleteTitle')),
        content: Text(
          tr(
            context,
            'automation.deleteConfirm',
            args: {'title': a['title']},
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(tr(context, 'automation.cancel'))),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(tr(context, 'action.delete'))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _api.delete('${a['automationId']}');
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'automation.deleteFailed', args: {'error': e}),
            ),
          ),
        );
      }
    }
  }

  Future<void> _showEditor({Map<String, dynamic>? existing}) async {
    final saved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => _AutomationEditor(api: _api, existing: existing),
    );
    if (saved == true) await _load();
  }

  Future<void> _runNow(Map<String, dynamic> a) async {
    final status = await _api.runNow('${a['automationId']}');
    if (!mounted) return;
    final message = switch (status) {
      'queued' => tr(context, 'automation.queued'),
      'duplicate' => tr(context, 'automation.duplicate'),
      _ => tr(context, 'automation.triggerFailed'),
    };
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
    if (status == 'queued') _load();
  }

  Future<void> _restart(Map<String, dynamic> a) async {
    try {
      await _api.restart('${a['automationId']}');
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'automation.restartFailed', args: {'error': e}),
            ),
          ),
        );
      }
    }
  }

  void _showDetail(Map<String, dynamic> a) {
    final id = '${a['automationId']}';
    final runs = _runs[id] ?? const [];
    final lifecycle = lifecycleLabel('${a['lifecycleStatus'] ?? ''}');
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
            top: Radius.circular(EmberRadius.sheet)),
      ),
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (context, scrollController) {
          final c = EmberColors.of(context);
          return ListView(
            controller: scrollController,
            padding: const EdgeInsets.all(EmberSpacing.page),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('${a['title']}',
                        style: TextStyle(
                            fontSize: EmberType.emphasis,
                            fontWeight: FontWeight.w600,
                            color: c.textSolid)),
                  ),
                  if (lifecycle != null) _LifecycleBadge(a),
                ],
              ),
              const SizedBox(height: EmberSpacing.gapM),
              // 操作按钮三型(spec §5):主=primary 填充,次=raise 底,
              // 幽灵=无底文字(重启 primary / 删除 err)。
              // 主/次按钮带按压缩放(spec §5 动效);ListTile 自带
              // 水波,设置行不叠加。
              Wrap(
                spacing: EmberSpacing.gapS,
                runSpacing: EmberSpacing.gapS,
                children: [
                  EmberPressable(
                    child: FilledButton.icon(
                      onPressed: () => _runNow(a),
                      icon: const Icon(Icons.play_arrow, size: 18),
                      label: Text(tr(context, 'automation.runNow')),
                    ),
                  ),
                  if (lifecycle != null)
                    EmberPressable(
                      child: TextButton.icon(
                        onPressed: () => _restart(a),
                        icon: const Icon(Icons.restart_alt, size: 18),
                        label: Text(tr(context, 'automation.restartSchedule')),
                      ),
                    ),
                  EmberPressable(
                    child: FilledButton.tonalIcon(
                      onPressed: () {
                        Navigator.pop(context);
                        _showEditor(existing: a);
                      },
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: Text(tr(context, 'automation.edit')),
                    ),
                  ),
                  EmberPressable(
                    child: TextButton(
                      style: TextButton.styleFrom(foregroundColor: c.err),
                      onPressed: () {
                        Navigator.pop(context);
                        _delete(a);
                      },
                      child: Text(tr(context, 'action.delete')),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: EmberSpacing.gapM),
              Container(
                padding: const EdgeInsets.all(EmberSpacing.cardPad),
                decoration: BoxDecoration(
                  color: Color.lerp(c.bg, c.card, 0.5),
                  borderRadius:
                      BorderRadius.circular(EmberRadius.control),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _KvRow(
                        tr(context, 'automation.schedule'), scheduleLabel(a)),
                    _KvRow(tr(context, 'automation.mode'), '${a['mode'] ?? '-'}'),
                    _KvRow(tr(context, 'automation.provider'),
                        '${a['provider'] ?? '-'}'),
                    _KvRow(tr(context, 'automation.model'),
                        '${a['model'] ?? '-'}'),
                    if (lifecycle != null)
                      _KvRow(tr(context, 'automation.lifecycle'), lifecycle),
                    _KvRow(
                        tr(context, 'automation.runCountLabel'),
                        tr(context, 'automation.runCountValue',
                            args: {'count': a['runCount'] ?? 0})),
                    _KvRow(tr(context, 'automation.nextRun'),
                        _orDash(_fmtMs(a['nextRunAt'] as num?))),
                    _KvRow(tr(context, 'automation.lastRun'),
                        _orDash(_fmtMs(a['lastRunAt'] as num?))),
                  ],
                ),
              ),
              const SizedBox(height: EmberSpacing.gapM),
              Text(tr(context, 'automation.prompt'),
                  style: TextStyle(
                      fontSize: EmberType.body,
                      fontWeight: FontWeight.w600,
                      color: c.textSolid)),
              const SizedBox(height: EmberSpacing.gapS),
              Container(
                padding: const EdgeInsets.all(EmberSpacing.cardPad),
                decoration: BoxDecoration(
                  color: Color.lerp(c.bg, c.card, 0.5),
                  borderRadius:
                      BorderRadius.circular(EmberRadius.control),
                ),
                child: SelectableText(
                  '${a['prompt'] ?? ''}',
                  style: TextStyle(
                      fontSize: EmberType.caption,
                      height: EmberType.lineHeight,
                      color: c.textSolid),
                ),
              ),
              const SizedBox(height: EmberSpacing.gapM),
              Text(tr(context, 'automation.runHistory'),
                  style: TextStyle(
                      fontSize: EmberType.body,
                      fontWeight: FontWeight.w600,
                      color: c.textSolid)),
              const SizedBox(height: EmberSpacing.gapS),
              if (runs.isEmpty)
                Text(tr(context, 'automation.noRuns'),
                    style: TextStyle(
                        fontSize: EmberType.caption,
                        color: c.textFaint))
              else
                for (final r in runs)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: Icon(
                      '${r['outcome']}' == 'succeeded'
                          ? Icons.check_circle
                          : Icons.error_outline,
                      size: 16,
                      color: '${r['outcome']}' == 'succeeded'
                          ? c.ok
                          : c.err,
                    ),
                    title: Text(
                      '${r['outcome'] ?? r['dispatchStatus'] ?? ''}'
                      ' · ${r['trigger'] ?? ''}',
                      style: TextStyle(
                          fontSize: EmberType.secondary,
                          color: c.textSolid),
                    ),
                    subtitle: Text(
                      _orDash(_fmtMs(r['scheduledAt'] as num?)),
                      style: TextStyle(
                          fontSize: EmberType.caption,
                          color: c.textFaint),
                    ),
                    trailing: r['sessionId'] is String
                        ? const Icon(Icons.chevron_right, size: 18)
                        : null,
                    onTap: () {
                      final sid = r['sessionId'];
                      if (sid is! String) return;
                      Navigator.pop(context);
                      widget.onOpenTask(sid, '${a['title']}');
                    },
                  ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
                tr(
                  context,
                  'automation.loadFailed',
                  args: {'error': _error},
                ),
                style: TextStyle(
                    color: EmberColors.of(context).err,
                    fontSize: EmberType.secondary)),
            const SizedBox(height: EmberSpacing.gapS),
            FilledButton(
                onPressed: _load,
                child: Text(tr(context, 'automation.retry'))),
          ],
        ),
      );
    }
    final c = EmberColors.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 12, 6),
          child: Row(
            children: [
              Text(tr(context, 'automation.title'),
                  style: TextStyle(
                      fontSize: EmberType.title,
                      fontWeight: FontWeight.w700,
                      color: c.textSolid)),
              const SizedBox(width: EmberSpacing.gapS),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: c.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('Beta',
                    style: TextStyle(
                        fontSize: EmberType.caption, color: c.primary)),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.add),
                tooltip: tr(context, 'automation.createTitle'),
                onPressed: () => _showEditor(),
              ),
              IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: tr(context, 'automation.refresh'),
                onPressed: _load,
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
            children: [
              // A5:空态与统计卡只看 automations 本身 —— 闲时队列非空但无
              // 自动化时不再渲染 0/0/0 统计卡,空态提示与队列同屏不冲突。
              if (_automations.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                    child: Text(tr(context, 'automation.empty'),
                        style: TextStyle(
                            fontSize: EmberType.secondary,
                            color: c.textFaint)),
                  ),
                )
              else ...[
                // 统计卡行(spec §7.2:全部/活跃/失败,lifecycleStatus 聚合)。
                Row(
                  children: [
                    _statCard(context, tr(context, 'automation.statAll'),
                        _automations.length),
                    const SizedBox(width: EmberSpacing.gapS),
                    _statCard(
                        context,
                        tr(context, 'automation.statActive'),
                        _automations
                            .where((a) => '${a['lifecycleStatus']}' == 'active')
                            .length,
                        countColor: c.ok),
                    const SizedBox(width: EmberSpacing.gapS),
                    _statCard(
                        context,
                        tr(context, 'automation.statFailed'),
                        _automations
                            .where((a) => '${a['lifecycleStatus']}' == 'failed')
                            .length,
                        countColor: c.err),
                  ],
                ),
                const SizedBox(height: EmberSpacing.gapS),
                for (final a in _automations) _automationTile(context, a),
              ],
              if (_queue.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 16, bottom: 6),
                  child: Text(tr(context, 'automation.offPeakQueue'),
                      style: TextStyle(
                          fontSize: EmberType.secondary,
                          fontWeight: FontWeight.w600,
                          color: c.textFaint)),
                ),
                for (final q in _queue)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.schedule, size: 18),
                    title: Text(
                        '${q['title'] ?? q['offPeakTaskId'] ?? tr(context, 'automation.offPeakTask')}',
                        style: TextStyle(
                            fontSize: EmberType.secondary,
                            color: c.textSolid)),
                    subtitle: Text(
                      '${q['status'] ?? ''}'
                      '${q['queuePosition'] != null ? ' · ${tr(context, 'automation.queuePosition', args: {'position': q['queuePosition']})}' : ''}',
                      style: TextStyle(
                          fontSize: EmberType.caption, color: c.textFaint),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  /// 统计卡:card 底 + hairline 边 + control 圆角,数值 section 17、
  /// 标签 caption 11 muted(spec §7.2)。
  Widget _statCard(BuildContext context, String label, int count,
      {Color? countColor}) {
    final c = EmberColors.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: EmberSpacing.cardPad),
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: BorderRadius.circular(EmberRadius.control),
          border: Border.all(color: c.hairline),
        ),
        child: Column(
          children: [
            Text('$count',
                style: TextStyle(
                    fontSize: EmberType.section,
                    fontWeight: FontWeight.w600,
                    color: countColor ?? c.textSolid)),
            const SizedBox(height: 2),
            Text(label,
                style: TextStyle(
                    fontSize: EmberType.caption, color: c.textMuted)),
          ],
        ),
      ),
    );
  }

  Widget _automationTile(BuildContext context, Map<String, dynamic> a) {
    final id = '${a['automationId']}';
    final enabled = a['enabled'] == true;
    final runs = _runs[id] ?? const [];
    final lastOutcome = runs.isEmpty ? null : '${runs.first['outcome']}';
    final c = EmberColors.of(context);
    // 任务卡按压缩放(spec §5 动效);ListTile 水波保留。
    return EmberPressable(
      child: Container(
        margin: const EdgeInsets.only(bottom: EmberSpacing.gapS),
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: BorderRadius.circular(EmberRadius.control),
          border: Border.all(color: c.hairline),
        ),
        clipBehavior: Clip.antiAlias,
        // ListTile paints ink on the nearest Material; without this the
        // decorated Container would hide the splash (framework assertion).
        child: Material(
          type: MaterialType.transparency,
          child: ListTile(
            onTap: () => _showDetail(a),
            title: Row(
              children: [
                Flexible(
                  child: Text('${a['title']}',
                      style: TextStyle(
                          fontSize: EmberType.body,
                          fontWeight: FontWeight.w600,
                          color: c.textSolid),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ),
                if (lifecycleLabel('${a['lifecycleStatus'] ?? ''}') !=
                    null) ...[
                  const SizedBox(width: EmberSpacing.gapS),
                  _LifecycleBadge(a),
                ],
              ],
            ),
            subtitle: Text(
              [
                scheduleLabel(a),
                tr(context, 'automation.nextRunAt',
                    args: {'time': _fmtMs(a['nextRunAt'] as num?)}),
                tr(context, 'automation.runCountValue',
                    args: {'count': a['runCount'] ?? 0}),
                if (lastOutcome != null)
                  lastOutcome == 'succeeded'
                      ? tr(context, 'automation.lastSucceeded')
                      : tr(context, 'automation.lastFailed'),
                if (!enabled) tr(context, 'automation.disabled'),
              ].join(' · '),
              style:
                  TextStyle(fontSize: EmberType.caption, color: c.textFaint),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: Switch(
              value: enabled,
              onChanged: (v) => _toggle(id, v),
            ),
          ),
        ),
      ),
    );
  }
}

/// 生命周期徽:底色同色 14% alpha、文字 ok/err/textFaint(spec §7.2)。
class _LifecycleBadge extends StatelessWidget {
  final Map<String, dynamic> automation;

  const _LifecycleBadge(this.automation);

  @override
  Widget build(BuildContext context) {
    final status = '${automation['lifecycleStatus']}';
    final color = lifecycleColor(status, EmberColors.of(context));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(lifecycleLabel(status)!,
          style:
              TextStyle(fontSize: EmberType.caption, color: color)),
    );
  }
}

/// KV 信息行:label 辅助小字 + value 正文(spec §7.2 KV 格)。
class _KvRow extends StatelessWidget {
  final String label;
  final String value;

  const _KvRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    final c = EmberColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 64,
            child: Text(label,
                style: TextStyle(
                    fontSize: EmberType.caption, color: c.textFaint)),
          ),
          Expanded(
            child: Text(value,
                style: TextStyle(
                    fontSize: EmberType.body, color: c.textSolid)),
          ),
        ],
      ),
    );
  }
}

/// Create / edit form. Templates mirror the desktop's official preset
/// library (weekly review / morning brief / risk scan).
class _AutomationEditor extends StatefulWidget {
  final AutomationApi api;
  final Map<String, dynamic>? existing;

  const _AutomationEditor({required this.api, this.existing});

  @override
  State<_AutomationEditor> createState() => _AutomationEditorState();
}

class _AutomationTemplate {
  final String label;
  final String cron;
  final String prompt;
  const _AutomationTemplate(this.label, this.cron, this.prompt);
}

class _AutomationEditorState extends State<_AutomationEditor> {
  late final TextEditingController _title;
  late final TextEditingController _cron;
  late final TextEditingController _prompt;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _title = TextEditingController(text: '${e?['title'] ?? ''}');
    _cron = TextEditingController(text: '${e?['cronExpr'] ?? ''}');
    _prompt = TextEditingController(text: '${e?['prompt'] ?? ''}');
  }

  @override
  void dispose() {
    _title.dispose();
    _cron.dispose();
    _prompt.dispose();
    super.dispose();
  }

  Future<void> _save(AutomationApi api) async {
    final title = _title.text.trim();
    final cron = _cron.text.trim();
    final prompt = _prompt.text.trim();
    if (title.isEmpty || cron.isEmpty || prompt.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(tr(context, 'automation.requiredFields'))));
      return;
    }
    setState(() => _saving = true);
    try {
      final e = widget.existing;
      if (e == null) {
        await api.create(title: title, cronExpr: cron, prompt: prompt);
      } else {
        await api.update(
          automationId: '${e['automationId']}',
          title: title,
          cronExpr: cron,
          prompt: prompt,
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (err) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(
                tr(context, 'automation.saveFailed', args: {'error': err}))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.existing != null;
    final templates = [
      _AutomationTemplate(
        t('automation.template.weeklyReview.title'),
        '0 16 * * 5',
        t('automation.template.weeklyReview.prompt'),
      ),
      _AutomationTemplate(
        t('automation.template.morningBrief.title'),
        '0 9 * * 1-5',
        t('automation.template.morningBrief.prompt'),
      ),
      _AutomationTemplate(
        t('automation.template.riskScan.title'),
        '0 10 * * *',
        t('automation.template.riskScan.prompt'),
      ),
    ];
    // 输入框 raise 底:dialog 是 card 面,输入一档更亮以示可编辑
    // (spec §5 次面语义)。
    final fieldColor = EmberColors.of(context).raise;
    InputDecoration field(InputDecoration base) =>
        base.copyWith(fillColor: fieldColor);
    return AlertDialog(
      title: Text(editing
          ? tr(context, 'automation.editTitle')
          : tr(context, 'automation.createTitle')),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!editing)
                Wrap(
                  spacing: 6,
                  children: [
                    for (final template in templates)
                      ActionChip(
                        label: Text(template.label,
                            style: const TextStyle(
                                fontSize: EmberType.caption)),
                        onPressed: () {
                          _cron.text = template.cron;
                          _prompt.text = template.prompt;
                          if (_title.text.trim().isEmpty) {
                            _title.text = template.label;
                          }
                        },
                      ),
                  ],
                ),
              if (!editing) const SizedBox(height: 10),
              TextField(
                controller: _title,
                decoration: field(InputDecoration(
                    labelText: tr(context, 'automation.fieldTitle'),
                    isDense: true)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _cron,
                decoration: field(InputDecoration(
                  labelText: tr(context, 'automation.fieldCron'),
                  hintText: tr(context, 'automation.cronHint'),
                  isDense: true,
                )),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _prompt,
                maxLines: 6,
                decoration: field(InputDecoration(
                  labelText: tr(context, 'automation.fieldPrompt'),
                  alignLabelWithHint: true,
                  isDense: true,
                )),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr(context, 'automation.cancel'))),
        FilledButton(
          onPressed: _saving ? null : () => _save(widget.api),
          child: _saving
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Text(tr(context, 'automation.save')),
        ),
      ],
    );
  }
}
