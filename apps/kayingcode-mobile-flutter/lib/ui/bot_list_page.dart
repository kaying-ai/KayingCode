import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../protocol/backend/backend_adapter.dart';
import '../protocol/backend/backend_type.dart';
import '../state/account_store.dart';
import '../state/app_session.dart';
import 'text_input_dialog.dart';
import 'theme.dart';
import 'bot_webview_uri.dart';

/// Bot 档案入口；连接事实仍由 AppSession 持有。
class BotListPage extends StatefulWidget {
  final AccountStore store;
  final AppSession session;
  final ValueChanged<Account> onSelect;
  final ValueChanged<BackendType> onAdd;
  final VoidCallback onManage;
  final bool webviewEnabled;

  const BotListPage({
    super.key,
    required this.store,
    required this.session,
    required this.onSelect,
    required this.onAdd,
    required this.onManage,
    this.webviewEnabled = true,
  });

  @override
  State<BotListPage> createState() => _BotListPageState();
}

class _BotListPageState extends State<BotListPage> {
  final Set<String> _removing = {};

  Future<void> _rename(BuildContext context, Account account) async {
    final label = await TextInputDialog.show(
      context,
      title: tr(context, 'bot.renameTitle'),
      initial: account.label,
    );
    if (label == null || widget.store.find(account.id) == null) return;
    try {
      await widget.store.rename(account.id, label);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'bot.renameFailed', args: {'error': error}),
            ),
          ),
        );
      }
    }
  }

  Future<bool> _confirmDelete(BuildContext context, Account account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(tr(dialogContext, 'bot.deleteTitle')),
        content: Text(
          tr(dialogContext, 'bot.deleteBody', args: {'name': account.label}),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(tr(dialogContext, 'dialog.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: EmberColors.of(dialogContext).err,
            ),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(tr(dialogContext, 'action.delete')),
          ),
        ],
      ),
    );
    return confirmed == true &&
        mounted &&
        widget.store.find(account.id) != null;
  }

  Future<void> _delete(Account account) async {
    // Dismissible 滑出后先移除列表项，再执行异步删除；失败时恢复卡片。
    setState(() => _removing.add(account.id));
    try {
      await widget.session.removeAccount(account);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'bot.deleteFailed', args: {'error': error}),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _removing.remove(account.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    final accounts = widget.store.accounts
        .where(
          (account) =>
              account.backendType == BackendType.kayingcode &&
              !_removing.contains(account.id),
        )
        .toList(growable: false);
    return ListView(
      padding: const EdgeInsets.all(EmberSpacing.page),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                tr(context, 'nav.sessionList'),
                style: TextStyle(
                  fontSize: EmberType.title,
                  fontWeight: FontWeight.w700,
                  color: colors.textSolid,
                ),
              ),
            ),
            IconButton(
              onPressed: widget.onManage,
              tooltip: tr(context, 'bot.manage'),
              icon: const Icon(Icons.tune_outlined),
            ),
          ],
        ),
        const SizedBox(height: EmberSpacing.gapS),
        Text(
          accounts.isEmpty
              ? tr(context, 'bot.emptyHint')
              : tr(context, 'bot.selectHint'),
          style: TextStyle(
            fontSize: EmberType.secondary,
            color: colors.textMuted,
          ),
        ),
        const SizedBox(height: EmberSpacing.gapM),
        for (final account in accounts) ...[
          Dismissible(
            key: ValueKey('bot-${account.id}'),
            direction: DismissDirection.endToStart,
            confirmDismiss: (_) => _confirmDelete(context, account),
            onDismissed: (_) async => _delete(account),
            background: Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: EmberSpacing.page),
              decoration: BoxDecoration(
                color: colors.err,
                borderRadius: BorderRadius.circular(EmberRadius.content),
              ),
              child: const Icon(Icons.delete_outline, color: Colors.white),
            ),
            child: _BotRow(
              webviewEnabled: widget.webviewEnabled,
              account: account,
              session: widget.session,
              onTap: () => widget.onSelect(account),
              onRename: () => _rename(context, account),
            ),
          ),
          const SizedBox(height: EmberSpacing.gapS),
        ],
        const SizedBox(height: EmberSpacing.gapS),
        Text(
          tr(context, 'bot.addTitle'),
          style: TextStyle(
            fontSize: EmberType.emphasis,
            fontWeight: FontWeight.w600,
            color: colors.textSolid,
          ),
        ),
        const SizedBox(height: EmberSpacing.gapS),
        _AddBotRow(
          title: tr(context, 'bot.connectKayingCode'),
          subtitle: tr(context, 'bot.connectKayingCodeSubtitle'),
          icon: Icons.link_outlined,
          onTap: () => widget.onAdd(BackendType.kayingcode),
        ),
        const SizedBox(height: EmberSpacing.gapS),
      ],
    );
  }
}

class _BotRow extends StatelessWidget {
  final bool webviewEnabled;
  final Account account;
  final AppSession session;
  final VoidCallback onTap;
  final VoidCallback onRename;

  const _BotRow({
    required this.webviewEnabled,
    required this.account,
    required this.session,
    required this.onTap,
    required this.onRename,
  });

  @override
  Widget build(BuildContext context) {
    final client = session.clientOf(account.id);
    if (client == null) return _buildRow(context, null);
    return ValueListenableBuilder<BackendConnectionState>(
      valueListenable: client.connectionStateListenable,
      builder: (context, state, _) => _buildRow(context, state),
    );
  }

  Widget _buildRow(BuildContext context, BackendConnectionState? state) {
    final colors = EmberColors.of(context);
    final current = session.current?.id == account.id;
    final connecting = session.connecting(account.id);
    final error = session.errorOf(account.id);
    final connected =
        !connecting && error == null && state == BackendConnectionState.paired;
    final source = account.params?.source;
    final host = source?.host ?? '';
    final remoteAddress = host.isEmpty
        ? tr(context, 'bot.remoteUnknown')
        : tr(
            context,
            'bot.remoteAddress',
            args: {
              'address':
                  '${host.contains(':') ? '[$host]' : host}${source!.hasPort ? ':${source.port}' : ''}',
            },
          );
    // 网页状态由网站持有，原生卡片不能把未创建 socket 误报为连接失败。
    final status = botUsesWebview(account, enabled: webviewEnabled)
        ? tr(
            context,
            account.backendType == BackendType.zcode
                ? 'zcodeWeb.website'
                : 'zcodeWeb.workbench',
          )
        : connecting
        ? tr(context, 'bot.statusConnecting')
        : error != null
        ? tr(context, 'bot.statusConnectFailed')
        : switch (state) {
            BackendConnectionState.paired => tr(context, 'bot.statusPaired'),
            BackendConnectionState.connecting ||
            BackendConnectionState.authenticating => tr(
              context,
              'bot.statusConnecting',
            ),
            BackendConnectionState.waiting => tr(
              context,
              account.params?.isV2 == true
                  ? 'zcodeAuth.waitingDevice'
                  : 'bot.statusWaitingApproval',
            ),
            BackendConnectionState.reconnecting => tr(
              context,
              'bot.statusReconnecting',
            ),
            BackendConnectionState.error => tr(
              context,
              'bot.statusConnectFailed',
            ),
            BackendConnectionState.kicked => tr(
              context,
              'bot.statusDisconnected',
            ),
            _ => tr(context, 'bot.statusNotConnected'),
          };
    return Material(
      color: colors.card,
      borderRadius: BorderRadius.circular(EmberRadius.content),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(EmberRadius.content),
        child: Container(
          padding: const EdgeInsets.all(EmberSpacing.cardPad),
          decoration: BoxDecoration(
            border: Border.all(color: colors.hairline),
            borderRadius: BorderRadius.circular(EmberRadius.content),
          ),
          child: Row(
            children: [
              Icon(
                account.backendType == BackendType.kayingcode
                    ? Icons.smart_toy_outlined
                    : Icons.desktop_windows_outlined,
                size: 26,
                color: connected ? colors.ok : colors.textSolid,
              ),
              const SizedBox(width: EmberSpacing.gapM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      account.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: EmberType.emphasis,
                        fontWeight: FontWeight.w600,
                        color: colors.textSolid,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        Text(
                          account.backendType.displayName,
                          style: TextStyle(
                            fontSize: EmberType.caption,
                            fontWeight: FontWeight.w600,
                            color: colors.textSoft,
                          ),
                        ),
                        Text(
                          status,
                          style: TextStyle(
                            fontSize: EmberType.caption,
                            color:
                                error != null ||
                                    state == BackendConnectionState.error ||
                                    state == BackendConnectionState.kicked
                                ? colors.err
                                : connected
                                ? colors.ok
                                : colors.textMuted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      remoteAddress,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: EmberType.caption,
                        color: colors.textFaint,
                      ),
                    ),
                    if (error != null)
                      Text(
                        error,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: EmberType.caption,
                          color: colors.err,
                        ),
                      ),
                  ],
                ),
              ),
              if (current)
                Icon(
                  Icons.check_circle,
                  size: 18,
                  color: connected ? colors.ok : colors.primary,
                ),
              IconButton(
                onPressed: onRename,
                tooltip: tr(context, 'bot.renameTitle'),
                visualDensity: VisualDensity.compact,
                icon: Icon(
                  Icons.edit_outlined,
                  size: 18,
                  color: colors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddBotRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  const _AddBotRow({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return ListTile(
      tileColor: colors.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(EmberRadius.control),
        side: BorderSide(color: colors.hairline),
      ),
      leading: Icon(icon, color: colors.textSolid),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.add),
      onTap: onTap,
    );
  }
}
