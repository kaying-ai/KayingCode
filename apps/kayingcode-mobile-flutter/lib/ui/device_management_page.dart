import 'dart:convert';

import '../platform/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/strings.dart';
import '../protocol/connection_params.dart';
import '../protocol/backend/backend_adapter.dart';
import '../protocol/backend/backend_type.dart';
import '../state/account_store.dart';
import '../state/app_session.dart';
import 'qr_scan_page.dart';
import 'text_input_dialog.dart';
import 'theme.dart';
import 'zcode_webview_page.dart';
import 'bot_webview_uri.dart';

/// 设备管理页(设备列表新家):增删改查 + 导入导出。连接由壳自动化,
/// 此页只管理设备档案,不再提供"点击连接"手势。
class DeviceManagementPage extends StatefulWidget {
  final AccountStore store;
  final AppSession session;

  /// 当前活跃设备已打开的工作区标题(壳层取自 activeWorkspace 传入)。
  /// null/空 = 无已知工作区,设备卡不显示该行。
  final String? activeWorkspaceTitle;

  /// 首次连接入口只提供对应说明；实际后端由连接信息自动识别。
  final BackendType? initialBackend;
  final bool exitOnAdd;
  final bool webviewEnabled;

  const DeviceManagementPage({
    super.key,
    required this.store,
    required this.session,
    this.activeWorkspaceTitle,
    this.initialBackend,
    this.exitOnAdd = false,
    this.webviewEnabled = true,
  });

  @override
  State<DeviceManagementPage> createState() => _DeviceManagementPageState();
}

class _DeviceManagementPageState extends State<DeviceManagementPage> {
  @override
  void initState() {
    super.initState();
    if (!widget.store.loaded) {
      widget.store.load().then((_) {
        if (mounted) setState(() {});
      });
    }
    if (widget.initialBackend != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showAddSheet(backend: widget.initialBackend);
      });
    }
  }

  /// Exports all devices to a JSON file (backup / transfer). The connection
  /// URLs contain credentials — warn the user before sharing.
  Future<void> _exportDevices(BuildContext context) async {
    final json = widget.store.exportJson();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'device.exportTitle')),
        content: Text(tr(context, 'device.exportBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr(context, 'dialog.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr(context, 'device.exportAction')),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      final path = await FilePicker.platform.saveFile(
        dialogTitle: tr(context, 'device.exportTitle'),
        fileName: 'kayingcode-devices.json',
        bytes: utf8.encode(json),
      );
      if (path == null) return; // cancelled
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(
                context,
                'device.exported',
                args: {'count': widget.store.accounts.length},
              ),
            ),
          ),
        );
      }
    } catch (e) {
      // Fallback: hand the JSON to the user via clipboard.
      await Clipboard.setData(ClipboardData(text: json));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr(context, 'device.exportCopied'))),
        );
      }
    }
  }

  /// Imports devices from a JSON export file.
  Future<void> _importDevices(BuildContext context) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
      );
      if (result == null || result.files.isEmpty) return;
      final bytes = result.files.first.bytes;
      if (bytes == null) return;
      final count = await widget.store.importJson(utf8.decode(bytes));
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            count > 0
                ? tr(context, 'device.imported', args: {'count': count})
                : tr(context, 'device.importEmpty'),
          ),
        ),
      );
      if (widget.exitOnAdd && count > 0 && mounted) {
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'device.importFailed', args: {'error': e}),
            ),
          ),
        );
      }
    }
  }

  /// 未知 Relay 会收到对话内容。连接串先解析 URI host，再决定是否额外确认；
  /// 旧逻辑只认 ZCode 域名，会把 KayingCode 已知服务器误报为非官方。
  Future<bool> _confirmUnknownServer(String url) async {
    final params = ZflowConnectionParams.parse(url);
    if (params == null || params.backendType != BackendType.kayingcode) {
      return false;
    }
    if (params.isKnownHost) return true;
    if (!mounted) return false;
    final go = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'device.unknownServerTitle')),
        content: Text(
          tr(
            context,
            'device.unknownServerBody',
            args: {'host': params.source.host},
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr(context, 'dialog.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr(context, 'device.unknownServerConfirm')),
          ),
        ],
      ),
    );
    return go ?? false;
  }

  Future<void> _addByUrl() async {
    final url = await TextInputDialog.show(
      context,
      title: tr(context, 'device.pasteTitle'),
      maxLines: 4,
      autofocus: true,
      confirmLabel: tr(context, 'device.addConfirm'),
      inputStyle: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
      hintText: tr(context, 'device.connectionHint'),
    );
    if (url == null || url.isEmpty) return;
    if (ZflowConnectionParams.parse(url) == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr(context, 'device.invalidLink'))),
        );
      }
      return;
    }
    if (!await _confirmUnknownServer(url)) return;
    await _addAndConnect(url);
  }

  Future<void> _addByScan() async {
    final url = await Navigator.of(
      context,
    ).push<String>(MaterialPageRoute(builder: (_) => const QrScanPage()));
    if (url == null || url.isEmpty) return;
    if (ZflowConnectionParams.parse(url) == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr(context, 'device.invalidQr'))),
        );
      }
      return;
    }
    if (!await _confirmUnknownServer(url)) return;
    await _addAndConnect(url);
  }

  Future<void> _addAndConnect(String url) async {
    final account = await widget.store.addUrl(url);
    if (widget.exitOnAdd) {
      // Bot 入口只保存档案，点击具体 Bot 才连接，避免添加时抢走当前工作区。
      if (mounted) Navigator.of(context).pop();
      return;
    }
    try {
      if (botUsesWebview(account, enabled: widget.webviewEnabled)) {
        if (mounted) {
          await ZcodeWebviewPage.open(context, account, widget.store);
        }
        return;
      }
      await widget.session.connect(account);
    } catch (_) {
      /* 错误由连接行显示，保留新码配对意图。 */
    }
  }

  Future<void> _showAddSheet({BackendType? backend}) async {
    final selected = await showModalBottomSheet<bool>(
      context: context,
      // 首次入口在页面动画中打开弹层，使用窗口坐标避免叠加内层导航的位移。
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (backend != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tr(
                          context,
                          'device.connectBackend',
                          args: {'backend': backend.displayName},
                        ),
                        style: const TextStyle(
                          fontSize: EmberType.section,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        backend == BackendType.zcode
                            ? tr(context, 'device.zcodeHint')
                            : tr(context, 'device.kayingcodeHint'),
                        style: TextStyle(
                          fontSize: EmberType.secondary,
                          color: EmberColors.of(context).textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ListTile(
                leading: const Icon(Icons.qr_code_scanner),
                title: Text(tr(context, 'accounts.scan')),
                subtitle: Text(tr(context, 'device.scanSubtitle')),
                onTap: () {
                  Navigator.pop(context, true);
                  _addByScan();
                },
              ),
              ListTile(
                leading: const Icon(Icons.link),
                title: Text(tr(context, 'accounts.paste')),
                subtitle: Text(tr(context, 'device.connectionHintInput')),
                onTap: () {
                  Navigator.pop(context, true);
                  _addByUrl();
                },
              ),
            ],
          ),
        ),
      ),
    );
    // 首次入口取消方式选择时直接回到双后端引导，避免停在空设备管理页。
    if (selected != true && widget.exitOnAdd && mounted) {
      Navigator.of(context).pop();
    }
  }

  Future<void> _rename(Account account) async {
    final label = await TextInputDialog.show(
      context,
      title: tr(context, 'device.renameTitle'),
      initial: account.label,
    );
    if (label != null) await widget.store.rename(account.id, label);
  }

  Future<void> _delete(Account account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'device.deleteTitle')),
        content: Text(
          tr(context, 'device.deleteBody', args: {'name': account.label}),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr(context, 'dialog.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr(context, 'action.delete')),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      try {
        await widget.session.removeAccount(account);
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                tr(context, 'device.deleteFailed', args: {'error': error}),
              ),
            ),
          );
        }
      }
    }
  }

  String _stateText(BackendConnectionState state) {
    switch (state) {
      case BackendConnectionState.connecting:
        return tr(context, 'device.stateConnecting');
      case BackendConnectionState.authenticating:
        return tr(context, 'device.stateAuthenticating');
      case BackendConnectionState.waiting:
        return tr(context, 'device.stateWaiting');
      case BackendConnectionState.paired:
        return tr(context, 'device.statePaired');
      case BackendConnectionState.reconnecting:
        return tr(context, 'device.stateReconnecting');
      case BackendConnectionState.error:
        return tr(context, 'device.stateError');
      case BackendConnectionState.kicked:
        return tr(context, 'device.stateKicked');
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return AnimatedBuilder(
      animation: Listenable.merge([widget.store, widget.session]),
      builder: (context, _) {
        final accounts = widget.store.accounts;
        final session = widget.session;
        return Scaffold(
          backgroundColor: colors.bg,
          appBar: AppBar(
            title: Text(
              tr(context, 'device.title'),
              style: const TextStyle(fontSize: EmberType.section),
            ),
            actions: [
              PopupMenuButton<String>(
                tooltip: tr(context, 'device.more'),
                onSelected: (v) {
                  if (v == 'import') _importDevices(context);
                  if (v == 'export') _exportDevices(context);
                },
                itemBuilder: (context) => [
                  PopupMenuItem(
                    value: 'import',
                    child: Text(tr(context, 'device.importTitle')),
                  ),
                  PopupMenuItem(
                    value: 'export',
                    child: Text(tr(context, 'device.exportTitle')),
                  ),
                ],
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(EmberSpacing.page),
            children: [
              for (var i = 0; i < accounts.length; i++) ...[
                if (i > 0) const SizedBox(height: EmberSpacing.gapS),
                _DeviceCard(
                  webviewEnabled: widget.webviewEnabled,
                  store: widget.store,
                  account: accounts[i],
                  isCurrent: session.current?.id == accounts[i].id,
                  session: session,
                  activeWorkspaceTitle: widget.activeWorkspaceTitle,
                  stateText: _stateText,
                  onRename: () => _rename(accounts[i]),
                  onDelete: () => _delete(accounts[i]),
                ),
              ],
              const SizedBox(height: EmberSpacing.gapS),
              _DashedAddButton(onTap: () => _showAddSheet()),
            ],
          ),
        );
      },
    );
  }
}

/// 单台设备卡:头像 + 名称 + 在线态 + 当前工作区(仅活跃设备有本地已知
/// 数据,其余设备不显示该行);操作仅重命名/删除(连接自动化,无连接手势)。
class _DeviceCard extends StatelessWidget {
  final bool webviewEnabled;
  final Account account;
  final AccountStore store;
  final bool isCurrent;
  final AppSession session;
  final String? activeWorkspaceTitle;
  final String Function(BackendConnectionState) stateText;
  final VoidCallback onRename;
  final VoidCallback onDelete;

  const _DeviceCard({
    required this.webviewEnabled,
    required this.account,
    required this.store,
    required this.isCurrent,
    required this.session,
    required this.activeWorkspaceTitle,
    required this.stateText,
    required this.onRename,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    final client = session.clientOf(account.id);
    final connecting = session.connecting(account.id);
    final error = session.errorOf(account.id);
    final host = account.params?.source.host ?? '';
    final label = account.label;
    return Container(
      decoration: BoxDecoration(
        color: colors.card,
        borderRadius: BorderRadius.circular(EmberRadius.control),
        border: Border.all(color: colors.hairline),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: EmberSpacing.cardPad,
        vertical: EmberSpacing.listItemV,
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: colors.primary.withValues(alpha: isCurrent ? 0.22 : 0.12),
              borderRadius: BorderRadius.circular(EmberRadius.avatar),
            ),
            child: Text(
              label.isEmpty ? '?' : label[0],
              style: TextStyle(
                fontSize: EmberType.emphasis,
                fontWeight: FontWeight.w700,
                color: colors.primary,
              ),
            ),
          ),
          const SizedBox(width: EmberSpacing.gapM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 名称与后端徽标同排会挤占操作区；窄屏和放大字号时分行约束宽度。
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: EmberType.emphasis,
                        fontWeight: FontWeight.w600,
                        color: colors.textSolid,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: colors.primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        account.backendType.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: EmberType.caption,
                          color: colors.primary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  host,
                  style: TextStyle(
                    fontSize: EmberType.caption,
                    color: colors.textFaint,
                  ),
                ),
                if (isCurrent && (activeWorkspaceTitle ?? '').isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    tr(
                      context,
                      'device.currentWorkspace',
                      args: {'title': activeWorkspaceTitle},
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: EmberType.caption,
                      color: colors.textMuted,
                    ),
                  ),
                ],
                if (client != null)
                  ValueListenableBuilder<BackendConnectionState>(
                    valueListenable: client.connectionStateListenable,
                    builder: (context, state, _) {
                      if (connecting &&
                          state != BackendConnectionState.paired &&
                          state != BackendConnectionState.error) {
                        return _PairSteps(state: state, colors: colors);
                      }
                      final text = stateText(state);
                      if (text.isEmpty) return const SizedBox.shrink();
                      return Text(
                        text,
                        style: TextStyle(
                          fontSize: EmberType.caption,
                          color: state == BackendConnectionState.paired
                              ? colors.ok
                              : state == BackendConnectionState.error ||
                                    state == BackendConnectionState.kicked
                              ? colors.err
                              : colors.warn,
                        ),
                      );
                    },
                  )
                else if (error != null)
                  Text(
                    error,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: EmberType.caption,
                      color: colors.err,
                    ),
                  )
                else if (connecting)
                  Text(
                    tr(context, 'device.connecting'),
                    style: TextStyle(
                      fontSize: EmberType.caption,
                      color: colors.warn,
                    ),
                  )
                else
                  Text(
                    tr(
                      context,
                      account.backendType == BackendType.zcode
                          ? 'zcodeWeb.website'
                          : 'device.notConnected',
                    ),
                    style: TextStyle(
                      fontSize: EmberType.caption,
                      color: colors.textFaint,
                    ),
                  ),
              ],
            ),
          ),
          // 手动重连(zremote 吸收):有凭据但未在连接时允许一键重连,
          // 配合自动恢复兜底。
          if (account.backendType == BackendType.kayingcode &&
              account.params != null &&
              !connecting)
            IconButton(
              icon: Icon(Icons.refresh, size: 18, color: colors.textMuted),
              tooltip: session.isConnected(account.id)
                  ? tr(context, 'device.reconnect')
                  : tr(context, 'device.connect'),
              onPressed: () async {
                try {
                  if (botUsesWebview(account, enabled: webviewEnabled)) {
                    await ZcodeWebviewPage.open(context, account, store);
                    return;
                  }
                  await session.connect(account);
                } catch (_) {
                  // 失败详情已在卡片状态与 errorOf 里展示。
                }
              },
            ),
          IconButton(
            icon: Icon(Icons.edit_outlined, size: 18, color: colors.textMuted),
            tooltip: tr(context, 'action.rename'),
            onPressed: onRename,
          ),
          IconButton(
            icon: Icon(Icons.delete_outline, size: 18, color: colors.err),
            tooltip: tr(context, 'action.delete'),
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

/// 虚线描边添加按钮(spec §7.3:扫码添加虚线按钮)。
class _DashedAddButton extends StatelessWidget {
  final VoidCallback onTap;

  const _DashedAddButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    final line = colors.primary.withValues(alpha: 0.55);
    return InkWell(
      borderRadius: BorderRadius.circular(EmberRadius.control),
      onTap: onTap,
      child: CustomPaint(
        painter: _DashedRectPainter(color: line),
        child: Container(
          height: 52,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: EmberSpacing.page),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.add, size: 18, color: line),
              const SizedBox(width: EmberSpacing.gapS),
              Text(
                tr(context, 'accounts.add'),
                style: TextStyle(
                  fontSize: EmberType.emphasis,
                  fontWeight: FontWeight.w600,
                  color: line,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DashedRectPainter extends CustomPainter {
  final Color color;

  _DashedRectPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    const dashWidth = 5.0;
    const dashGap = 4.0;
    final rect = Offset.zero & size;
    final rrect = RRect.fromRectAndRadius(
      rect,
      const Radius.circular(EmberRadius.control),
    );
    final path = Path()..addRRect(rrect);
    final dashed = Path();
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = distance + dashWidth;
        dashed.addPath(
          metric.extractPath(distance, next.clamp(0.0, metric.length)),
          Offset.zero,
        );
        distance = next + dashGap;
      }
    }
    canvas.drawPath(
      dashed,
      Paint()
        ..style = PaintingStyle.stroke
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(_DashedRectPainter old) => old.color != color;
}

/// 4-step pairing progress (mirrors the web bootstrap steps).
class _PairSteps extends StatelessWidget {
  final BackendConnectionState state;
  final EmberColors colors;

  const _PairSteps({required this.state, required this.colors});

  static const _steps = [
    'device.stepRelay',
    'device.stepAuth',
    'device.stepWait',
    'device.stepDone',
  ];

  @override
  Widget build(BuildContext context) {
    final current = switch (state) {
      BackendConnectionState.connecting => 0,
      BackendConnectionState.authenticating => 1,
      BackendConnectionState.waiting => 2,
      _ => 3,
    };
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < _steps.length; i++) ...[
            if (i > 0)
              Container(
                width: 10,
                height: 1,
                color: i <= current ? colors.ok : colors.textFaint,
              ),
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: i < current
                    ? colors.ok
                    : i == current
                    ? colors.warn
                    : colors.textFaint,
              ),
            ),
            const SizedBox(width: 3),
            Text(
              tr(context, _steps[i]),
              style: TextStyle(
                fontSize: 9,
                color: i <= current ? colors.textSoft : colors.textFaint,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
