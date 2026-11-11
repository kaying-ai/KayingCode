import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/app_locale.dart';
import '../l10n/strings.dart';
import '../protocol/relay_client.dart';
import '../protocol/zflow_client.dart';
import '../protocol/backend/backend_adapter.dart';
import '../notifications/notifications.dart';
import '../state/account_store.dart';
import '../state/app_session.dart';
import '../state/background_prefs.dart';
import '../state/crash_report.dart';
import '../state/log_store.dart';
import '../update/app_version.dart';
import 'automation_page.dart';
import 'channel_explorer_page.dart';
import 'log_page.dart';
import 'model_providers_page.dart';
import 'rpc_explorer_page.dart';
import 'services_page.dart';
import 'theme.dart';
import 'ui_settings.dart';
import 'usage_page.dart';

/// Builds a `{workspacePath, workspaceIdentity?}` scope from a bridge.
Map<String, dynamic> _scopeOf(BridgeSession session) => {
  'workspacePath': session.bridge['workspacePath'],
  if (session.bridge['workspaceIdentity'] != null)
    'workspaceIdentity': session.bridge['workspaceIdentity'],
};

/// 行组内统一的行导航箭头(与 leading 图标同为 20 档)。
const _chevron = Icon(Icons.chevron_right, size: 20);

enum SettingsSection { appearance, connections, models, about }

/// 「我的」只展示一级入口，具体配置在二级页。
class SettingsHomePage extends StatelessWidget {
  static const _companyUrl = 'https://kayingai.com';
  static const _privacyPolicyUrl =
      'https://kayingai.com/policy/kayingcode-mobile-privacy-policy.html';
  static const _supportQrAsset = 'assets/images/support-contact-qr.png';

  final BackendAdapter? client;
  final BridgeSession? bridge;
  final AccountStore store;
  final AppSession session;
  final VoidCallback onDisconnect;
  final ThemeController? themeController;
  final Map<String, dynamic>? workspace;
  final void Function(String taskId, String title)? onOpenTask;

  const SettingsHomePage({
    super.key,
    required this.client,
    required this.bridge,
    required this.store,
    required this.session,
    required this.onDisconnect,
    required this.themeController,
    required this.workspace,
    required this.onOpenTask,
  });

  Future<void> _showSupportQr(BuildContext context) => showDialog<void>(
    context: context,
    builder: (dialogContext) {
      final colors = EmberColors.of(dialogContext);
      return AlertDialog(
        title: Text(tr(context, 'settings.support.title')),
        content: SizedBox(
          width: 280,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: Image.asset(
                  _supportQrAsset,
                  fit: BoxFit.contain,
                  filterQuality: FilterQuality.none,
                  semanticLabel: tr(context, 'settings.support.qrSemantic'),
                ),
              ),
              const SizedBox(height: EmberSpacing.gapM),
              Text(
                tr(context, 'settings.support.qrHint'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: EmberType.secondary,
                  color: colors.textMuted,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(tr(context, 'settings.close')),
          ),
        ],
      );
    },
  );

  Future<void> _openPrivacyPolicy(BuildContext context) async {
    try {
      final opened = await launchUrl(
        Uri.parse(_privacyPolicyUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(tr(context, 'settings.home.privacyOpenFailed')),
          ),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(tr(context, 'settings.home.privacyOpenFailed')),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    void open(SettingsSection section, String titleKey) {
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          // 标题在路由内解析：语言切换后 AppBar 会随 Localizations 重建，
          // 若在 push 时把 tr() 结果作为字符串传入会停留在旧语言。
          builder: (routeContext) => Scaffold(
            appBar: AppBar(title: Text(tr(routeContext, titleKey))),
            body: SettingsPage(
              section: section,
              client: client,
              bridge: bridge,
              store: store,
              session: session,
              onDisconnect: onDisconnect,
              themeController: themeController,
            ),
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(EmberSpacing.page),
      children: [
        _GroupCard(
          children: [
            Padding(
              padding: const EdgeInsets.all(EmberSpacing.cardPad),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(EmberRadius.control),
                    child: Image.asset(
                      'assets/icon/kayingcode.png',
                      width: 52,
                      height: 52,
                    ),
                  ),
                  const SizedBox(width: EmberSpacing.gapM),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'KayingCode',
                          style: TextStyle(
                            fontSize: EmberType.title,
                            fontWeight: FontWeight.w700,
                            color: colors.textSolid,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          tr(
                            context,
                            'settings.home.version',
                            args: {'version': appVersion},
                          ),
                          style: TextStyle(
                            fontSize: EmberType.secondary,
                            color: colors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Divider(height: 1, color: colors.hairline),
            ListTile(
              dense: true,
              leading: const Icon(Icons.language_outlined, size: 20),
              title: Text(tr(context, 'settings.home.companySite')),
              subtitle: const Text(
                _companyUrl,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: const Icon(Icons.copy_outlined, size: 18),
              onTap: () async {
                await Clipboard.setData(const ClipboardData(text: _companyUrl));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(tr(context, 'settings.home.companyCopied')),
                    ),
                  );
                }
              },
            ),
            Divider(height: 1, indent: 52, color: colors.hairline),
            ListTile(
              dense: true,
              leading: const Icon(Icons.privacy_tip_outlined, size: 20),
              title: Text(tr(context, 'settings.home.privacy')),
              subtitle: const Text(
                _privacyPolicyUrl,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: const Icon(Icons.open_in_new_outlined, size: 18),
              onTap: () => _openPrivacyPolicy(context),
            ),
            Divider(height: 1, indent: 52, color: colors.hairline),
            ListTile(
              dense: true,
              leading: const Icon(Icons.support_agent_outlined, size: 20),
              title: Text(tr(context, 'settings.support.title')),
              subtitle: Text(tr(context, 'settings.home.supportSubtitle')),
              trailing: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: Image.asset(
                  _supportQrAsset,
                  width: 40,
                  height: 40,
                  filterQuality: FilterQuality.none,
                  semanticLabel: tr(
                    context,
                    'settings.home.supportThumbSemantic',
                  ),
                ),
              ),
              onTap: () => _showSupportQr(context),
            ),
          ],
        ),
        const SizedBox(height: EmberSpacing.gapM),
        _GroupCard(
          children: [
            ListTile(
              leading: const Icon(Icons.palette_outlined, size: 20),
              title: Text(tr(context, 'settings.home.appearanceLanguage')),
              trailing: _chevron,
              onTap: () => open(
                SettingsSection.appearance,
                'settings.home.appearanceLanguage',
              ),
            ),
            const Divider(indent: 52),
            ListTile(
              leading: const Icon(Icons.devices_outlined, size: 20),
              title: Text(
                tr(context, 'settings.home.connectionsNotifications'),
              ),
              trailing: _chevron,
              onTap: () => open(
                SettingsSection.connections,
                'settings.home.connectionsNotifications',
              ),
            ),
            const Divider(indent: 52),
            ListTile(
              leading: const Icon(Icons.extension_outlined, size: 20),
              title: Text(tr(context, 'settings.home.modelsServices')),
              trailing: _chevron,
              onTap: () =>
                  open(SettingsSection.models, 'settings.home.modelsServices'),
            ),
          ],
        ),
        const SizedBox(height: EmberSpacing.gapM),
        _GroupCard(
          children: [
            if (bridge != null && workspace != null && onOpenTask != null) ...[
              ListTile(
                leading: const Icon(Icons.schedule_outlined, size: 20),
                title: Text(tr(context, 'settings.home.automation')),
                trailing: _chevron,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => Scaffold(
                      appBar: AppBar(
                        title: Text(tr(context, 'settings.home.automation')),
                      ),
                      body: AutomationPage(
                        bridge: bridge!,
                        workspace: workspace!,
                        onOpenTask: onOpenTask!,
                      ),
                    ),
                  ),
                ),
              ),
              const Divider(indent: 52),
            ],
            ListTile(
              leading: const Icon(Icons.info_outline, size: 20),
              title: Text(tr(context, 'settings.home.diagnosticsAbout')),
              trailing: _chevron,
              onTap: () =>
                  open(SettingsSection.about, 'settings.home.diagnosticsAbout'),
            ),
          ],
        ),
      ],
    );
  }
}

/// 设置页(spec §7.3):外观 / 设备与连接 / 模型 / 关于 四组行组,
/// 控制区规范:card 底 + hairline + 小圆角,分组小标题间距字。
class SettingsPage extends StatelessWidget {
  final SettingsSection? section;
  final BackendAdapter? client;
  final BridgeSession? bridge;
  final AccountStore store;
  final AppSession session;
  final VoidCallback onDisconnect;
  final ThemeController? themeController;

  const SettingsPage({
    super.key,
    this.section,
    this.client,
    this.bridge,
    required this.store,
    required this.session,
    required this.onDisconnect,
    this.themeController,
  });

  @override
  Widget build(BuildContext context) {
    final controller = themeController;
    final ui = UiSettingsProvider.of(context);
    final colors = EmberColors.of(context);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (section == null) ...[
          Text(
            tr(context, 'settings.title'),
            style: const TextStyle(
              fontSize: EmberType.title,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 20),
        ],
        if (controller != null &&
            (section == null || section == SettingsSection.appearance)) ...[
          _groupTitle(context, tr(context, 'settings.appearance')),
          _GroupCard(
            children: [
              Padding(
                padding: const EdgeInsets.all(EmberSpacing.cardPad),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tr(context, 'settings.appearance'),
                      style: TextStyle(
                        fontSize: EmberType.body,
                        fontWeight: FontWeight.w600,
                        color: colors.textSolid,
                      ),
                    ),
                    const SizedBox(height: EmberSpacing.gapM),
                    AnimatedBuilder(
                      animation: controller,
                      builder: (context, _) => SegmentedButton<ThemeMode>(
                        segments: [
                          ButtonSegment(
                            value: ThemeMode.dark,
                            icon: const Icon(
                              Icons.dark_mode_outlined,
                              size: 16,
                            ),
                            label: Text(
                              tr(context, 'settings.theme.dark'),
                              style: const TextStyle(
                                fontSize: EmberType.secondary,
                              ),
                            ),
                          ),
                          ButtonSegment(
                            value: ThemeMode.light,
                            icon: const Icon(
                              Icons.light_mode_outlined,
                              size: 16,
                            ),
                            label: Text(
                              tr(context, 'settings.theme.light'),
                              style: const TextStyle(
                                fontSize: EmberType.secondary,
                              ),
                            ),
                          ),
                          ButtonSegment(
                            value: ThemeMode.system,
                            icon: const Icon(
                              Icons.settings_suggest_outlined,
                              size: 16,
                            ),
                            label: Text(
                              tr(context, 'settings.theme.system'),
                              style: const TextStyle(
                                fontSize: EmberType.secondary,
                              ),
                            ),
                          ),
                        ],
                        selected: {controller.mode},
                        onSelectionChanged: (modes) =>
                            controller.setMode(modes.first),
                        style: const ButtonStyle(
                          visualDensity: VisualDensity.compact,
                          // 俄语主题名较长；收紧段内边距，避免在窄屏上把单词拆行。
                          padding: WidgetStatePropertyAll(
                            EdgeInsets.symmetric(horizontal: 8),
                          ),
                          textStyle: WidgetStatePropertyAll(
                            TextStyle(fontSize: EmberType.secondary),
                          ),
                          iconSize: WidgetStatePropertyAll(16),
                        ),
                      ),
                    ),
                    if (ui != null) ...[
                      const SizedBox(height: 16),
                      Text(
                        tr(context, 'settings.language'),
                        style: TextStyle(
                          fontSize: EmberType.body,
                          color: colors.textSoft,
                        ),
                      ),
                      const SizedBox(height: 8),
                      AnimatedBuilder(
                        animation: ui,
                        builder: (context, _) {
                          // 语言名用各自母语书写，不随当前界面语言翻译。
                          final options = <(AppLanguage, String)>[
                            (
                              AppLanguage.system,
                              tr(context, 'settings.language.system'),
                            ),
                            (AppLanguage.zhCN, '简体中文'),
                            (AppLanguage.zhTW, '繁體中文'),
                            (AppLanguage.enUS, 'English'),
                            (AppLanguage.ruRU, 'Русский'),
                          ];
                          return Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final (language, label) in options)
                                ChoiceChip(
                                  label: Text(
                                    label,
                                    style: const TextStyle(
                                      fontSize: EmberType.secondary,
                                    ),
                                  ),
                                  selected: ui.language == language,
                                  onSelected: (_) => ui.setLanguage(language),
                                ),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 16),
                      Text(
                        '${tr(context, 'settings.textScale')} · ${ui.textScale.toStringAsFixed(2)}x',
                        style: TextStyle(
                          fontSize: EmberType.body,
                          color: colors.textSoft,
                        ),
                      ),
                      AnimatedBuilder(
                        animation: ui,
                        builder: (context, _) => Slider(
                          value: ui.textScale,
                          min: 0.8,
                          max: 1.4,
                          divisions: 12,
                          onChanged: ui.setTextScale,
                        ),
                      ),
                      Text(
                        '${tr(context, 'settings.codeFont')} · ${ui.codeFontSize.toStringAsFixed(1)}',
                        style: TextStyle(
                          fontSize: EmberType.body,
                          color: colors.textSoft,
                        ),
                      ),
                      AnimatedBuilder(
                        animation: ui,
                        builder: (context, _) => Slider(
                          value: ui.codeFontSize,
                          min: 10,
                          max: 20,
                          divisions: 20,
                          onChanged: ui.setCodeFontSize,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        if (section == null || section == SettingsSection.connections) ...[
          _groupTitle(
            context,
            tr(context, 'settings.group.devicesConnections'),
          ),
          _GroupCard(
            children: [
              const _VerboseFramesTile(),
              const Divider(indent: 52),
              const _DiagLogTile(),
            ],
          ),
          if (Notifications.isSupported) ...[
            const SizedBox(height: 12),
            _groupTitle(
              context,
              tr(context, 'settings.group.backgroundNotifications'),
            ),
            _GroupCard(
              children: const [
                _KeepAliveTile(),
                Divider(indent: 52),
                _WakeLockTile(),
                Divider(indent: 52),
                _BatteryWhitelistTile(),
                Divider(indent: 52),
                _NotifyToggle(kind: NotifyKind.approvals),
                Divider(indent: 52),
                _NotifyToggle(kind: NotifyKind.completions),
                Divider(indent: 52),
                _NotifyToggle(kind: NotifyKind.failures),
              ],
            ),
          ],
        ],
        if (section == SettingsSection.models && bridge == null)
          ListTile(
            leading: const Icon(Icons.link_off_outlined),
            title: Text(tr(context, 'settings.models.noBridge')),
          ),
        if (bridge != null &&
            (section == null || section == SettingsSection.models)) ...[
          const SizedBox(height: 12),
          _groupTitle(context, tr(context, 'settings.group.models')),
          _GroupCard(
            children: [
              ListTile(
                leading: const Icon(Icons.model_training, size: 20),
                title: Text(tr(context, 'settings.models.providers')),
                subtitle: Text(
                  bridge!.bridge['backendType'] == 'kayingcode'
                      ? tr(context, 'settings.models.providersSubtitleKaying')
                      : tr(context, 'settings.models.providersSubtitle'),
                ),
                trailing: _chevron,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ModelProvidersPage(
                      session: bridge!,
                      scope: _scopeOf(bridge!),
                    ),
                  ),
                ),
              ),
              const Divider(indent: 52),
              ListTile(
                leading: const Icon(Icons.query_stats, size: 20),
                title: Text(tr(context, 'settings.usage')),
                subtitle: Text(tr(context, 'settings.usageSubtitle')),
                trailing: _chevron,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => UsagePage(session: bridge!),
                  ),
                ),
              ),
              const Divider(indent: 52),
              ListTile(
                leading: const Icon(Icons.extension_outlined, size: 20),
                title: Text(tr(context, 'settings.services')),
                subtitle: Text(tr(context, 'settings.servicesSubtitle')),
                trailing: _chevron,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ServicesPage(
                      session: bridge!,
                      scope: _scopeOf(bridge!),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
        if (section == null || section == SettingsSection.about) ...[
          const SizedBox(height: 12),
          _groupTitle(context, tr(context, 'settings.group.about')),
          _GroupCard(
            children: [
              ListTile(
                leading: const Icon(Icons.monitor_heart_outlined, size: 20),
                title: Text(tr(context, 'settings.diagnostics.title')),
                subtitle: Text(tr(context, 'settings.diagnostics.subtitle')),
                trailing: _chevron,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        _DiagnosticsPage(client: client, bridge: bridge),
                  ),
                ),
              ),
              const Divider(indent: 52),
              ListTile(
                leading: const Icon(Icons.info_outline, size: 20),
                title: Text(tr(context, 'settings.group.about')),
                subtitle: const Text('KayingCode v$appVersion'),
                trailing: _chevron,
                onTap: () => _showAbout(context),
              ),
            ],
          ),
        ],
        if (section == null || section == SettingsSection.connections) ...[
          const SizedBox(height: 12),
          _GroupCard(
            children: [
              ListTile(
                leading: Icon(
                  Icons.link_off,
                  color: EmberColors.of(context).err,
                  size: 20,
                ),
                title: Text(
                  tr(context, 'settings.disconnect'),
                  style: TextStyle(
                    fontSize: EmberType.emphasis,
                    color: EmberColors.of(context).err,
                  ),
                ),
                onTap: onDisconnect,
              ),
            ],
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _groupTitle(BuildContext context, String text) {
    final colors = EmberColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 6),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: EmberType.caption,
          letterSpacing: 2,
          color: colors.textMuted,
        ),
      ),
    );
  }

  void _showAbout(BuildContext pageContext) {
    showDialog<void>(
      context: pageContext,
      builder: (context) => AlertDialog(
        title: const Text('KayingCode'),
        content: Text(
          'KayingCode v$appVersion\n\n'
          '${tr(context, 'settings.about.body')}\n'
          '${tr(context, 'settings.about.licenseHint')}',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              showLicensePage(
                context: pageContext,
                applicationName: 'KayingCode',
                applicationVersion: 'v$appVersion',
              );
            },
            child: Text(tr(context, 'settings.about.licenses')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: Text(tr(context, 'settings.close')),
          ),
        ],
      ),
    );
  }
}

/// 控制区行组容器:card 底 + hairline + 小圆角(spec §4/§7.3)。
/// 行组字阶一处定义:title=emphasis 15、subtitle=secondary 12 muted,
/// 行内不再逐个写样式。
class _GroupCard extends StatelessWidget {
  final List<Widget> children;

  const _GroupCard({required this.children});

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: colors.card,
        borderRadius: BorderRadius.circular(EmberRadius.control),
        border: Border.all(color: colors.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      // ListTile paints ink on the nearest Material; without this the
      // decorated Container would hide the splash (framework assertion).
      child: Material(
        type: MaterialType.transparency,
        child: ListTileTheme.merge(
          titleTextStyle: TextStyle(
            fontSize: EmberType.emphasis,
            color: colors.textSolid,
          ),
          subtitleTextStyle: TextStyle(
            fontSize: EmberType.secondary,
            color: colors.textMuted,
          ),
          child: Column(children: children),
        ),
      ),
    );
  }
}

/// Toggles per-frame relay logging ([RelayClient.verboseFrames]). Off by
/// default in release: every inbound frame costs a jsonEncode + truncation,
/// which is real CPU during streaming. Diagnostics always log regardless.
class _VerboseFramesTile extends StatefulWidget {
  const _VerboseFramesTile();

  @override
  State<_VerboseFramesTile> createState() => _VerboseFramesTileState();
}

class _VerboseFramesTileState extends State<_VerboseFramesTile> {
  late bool _value = RelayClient.verboseFrames;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      secondary: const Icon(Icons.article_outlined, size: 20),
      title: Text(tr(context, 'settings.verboseFrames.title')),
      subtitle: Text(tr(context, 'settings.verboseFrames.subtitle')),
      value: _value,
      onChanged: (v) async {
        setState(() => _value = v);
        RelayClient.verboseFrames = v;
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setBool('relayVerboseFrames', v);
        } catch (_) {}
      },
    );
  }
}

/// 诊断日志开关:开 = [wire]/[chat]/[zflow] 探针同时写 logcat
/// (release 真机取证:连接/桥/订阅/发送的时序与降级-恢复循环只在
/// wire 层可见);关 = 仅应用内协议日志页。
class _DiagLogTile extends StatefulWidget {
  const _DiagLogTile();

  @override
  State<_DiagLogTile> createState() => _DiagLogTileState();
}

class _DiagLogTileState extends State<_DiagLogTile> {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: diagLogEnabled,
      builder: (context, value, _) => SwitchListTile(
        secondary: const Icon(Icons.bug_report_outlined, size: 20),
        title: Text(tr(context, 'settings.diagLog.title')),
        subtitle: Text(tr(context, 'settings.diagLog.subtitle')),
        value: value,
        onChanged: (v) => setDiagLogEnabled(v),
      ),
    );
  }
}

class _KeepAliveTile extends StatefulWidget {
  const _KeepAliveTile();

  @override
  State<_KeepAliveTile> createState() => _KeepAliveTileState();
}

class _KeepAliveTileState extends State<_KeepAliveTile> {
  @override
  Widget build(BuildContext context) {
    final prefs = BackgroundPrefs.instance;
    return AnimatedBuilder(
      animation: prefs,
      builder: (context, _) => SwitchListTile(
        secondary: const Icon(Icons.sync_lock_outlined, size: 20),
        title: Text(tr(context, 'settings.keepAlive.title')),
        subtitle: Text(tr(context, 'settings.keepAlive.subtitle')),
        value: prefs.keepAliveEnabled,
        onChanged: (v) async {
          await prefs.setKeepAliveEnabled(v);
          if (v && context.mounted) await _guideBatteryWhitelist(context);
        },
      ),
    );
  }

  /// 开启时引导一次电池优化白名单（系统确认框;拒绝也可稍后手动再来）。
  Future<void> _guideBatteryWhitelist(BuildContext context) async {
    final notifications = notificationsService;
    if (!Notifications.isSupported) return;
    if (await notifications.isIgnoringBatteryOptimizations()) return;
    final remembered =
        (await SharedPreferences.getInstance()).getBool('battery.guideShown') ??
        false;
    if (remembered) return;
    await SharedPreferences.getInstance().then(
      (p) => p.setBool('battery.guideShown', true),
    );
    if (!context.mounted) return;
    await notifications.requestIgnoreBatteryOptimizations();
  }
}

/// 息屏保持在线:息屏期间持部分 WakeLock,防 Doze 冻结连接(耗电换稳定)。
class _WakeLockTile extends StatefulWidget {
  const _WakeLockTile();

  @override
  State<_WakeLockTile> createState() => _WakeLockTileState();
}

class _WakeLockTileState extends State<_WakeLockTile> {
  @override
  Widget build(BuildContext context) {
    final prefs = BackgroundPrefs.instance;
    return AnimatedBuilder(
      animation: prefs,
      builder: (context, _) => SwitchListTile(
        secondary: const Icon(Icons.screen_lock_portrait_outlined, size: 20),
        title: Text(tr(context, 'settings.wakeLock.title')),
        subtitle: Text(tr(context, 'settings.wakeLock.subtitle')),
        value: prefs.keepAliveEnabled && prefs.wakeLock,
        onChanged: prefs.keepAliveEnabled ? (v) => prefs.setWakeLock(v) : null,
      ),
    );
  }
}

/// 电池优化白名单状态行:未加白显 ⚠,点按弹系统确认框。
class _BatteryWhitelistTile extends StatefulWidget {
  const _BatteryWhitelistTile();

  @override
  State<_BatteryWhitelistTile> createState() => _BatteryWhitelistTileState();
}

class _BatteryWhitelistTileState extends State<_BatteryWhitelistTile>
    with WidgetsBindingObserver {
  bool _ignoring = true;
  bool _meizu = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _query();
    notificationsService
        .deviceManufacturer()
        .then((m) {
          if (mounted) setState(() => _meizu = m.contains('meizu'));
        })
        .catchError((_) {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // 系统白名单确认框返回后,initState 的查询已过期;回前台重查。
    if (state == AppLifecycleState.resumed) _query();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _query() {
    notificationsService.isIgnoringBatteryOptimizations().then((v) {
      if (mounted) setState(() => _ignoring = v);
    });
  }

  @override
  Widget build(BuildContext context) {
    // Flyme 不认标准白名单(实测:弹窗允许后 isIgnoringBatteryOptimizations
    // 仍为 false),引导去手机管家的后台管理手动放行。
    final subtitle = _ignoring
        ? tr(context, 'settings.battery.whitelisted')
        : _meizu
        ? tr(context, 'settings.battery.flyme')
        : tr(context, 'settings.battery.notWhitelisted');
    return ListTile(
      leading: _ignoring
          ? const Icon(Icons.battery_saver_outlined, size: 20)
          : Icon(
              Icons.warning_amber_outlined,
              size: 20,
              color: EmberColors.of(context).warn,
            ),
      title: Text(tr(context, 'settings.battery.title')),
      subtitle: Text(subtitle),
      trailing: _ignoring
          ? const Icon(Icons.check, size: 20)
          : const Icon(Icons.chevron_right, size: 20),
      onTap: _ignoring
          ? null
          : () async {
              await notificationsService.requestIgnoreBatteryOptimizations();
              _query();
            },
    );
  }
}

enum NotifyKind { approvals, completions, failures }

/// 通知三分开关：审批请求 / 任务完成 / 任务失败。
class _NotifyToggle extends StatefulWidget {
  final NotifyKind kind;

  const _NotifyToggle({required this.kind});

  @override
  State<_NotifyToggle> createState() => _NotifyToggleState();
}

class _NotifyToggleState extends State<_NotifyToggle> {
  @override
  Widget build(BuildContext context) {
    final prefs = BackgroundPrefs.instance;
    return AnimatedBuilder(
      animation: prefs,
      builder: (context, _) {
        final (title, subtitle, icon, value) = switch (widget.kind) {
          NotifyKind.approvals => (
            tr(context, 'settings.notify.approvals'),
            tr(context, 'settings.notify.approvalsSubtitle'),
            Icons.approval_outlined,
            prefs.notifyApprovals,
          ),
          NotifyKind.completions => (
            tr(context, 'settings.notify.completions'),
            tr(context, 'settings.notify.completionsSubtitle'),
            Icons.task_alt_outlined,
            prefs.notifyCompletions,
          ),
          NotifyKind.failures => (
            tr(context, 'settings.notify.failures'),
            tr(context, 'settings.notify.failuresSubtitle'),
            Icons.error_outline,
            prefs.notifyFailures,
          ),
        };
        return SwitchListTile(
          secondary: Icon(icon, size: 20),
          title: Text(title),
          subtitle: Text(subtitle),
          value: value,
          onChanged: (v) => switch (widget.kind) {
            NotifyKind.approvals => prefs.setNotifyApprovals(v),
            NotifyKind.completions => prefs.setNotifyCompletions(v),
            NotifyKind.failures => prefs.setNotifyFailures(v),
          },
        );
      },
    );
  }
}

/// 诊断与日志二级页(spec §7.4 诊断中心):上次崩溃摘要前置,
/// 二级列表:诊断日志 / 协议日志 / RPC 调试器 / 信道浏览器。
class _DiagnosticsPage extends StatelessWidget {
  final BackendAdapter? client;
  final BridgeSession? bridge;

  const _DiagnosticsPage({this.client, this.bridge});

  /// 诊断计数前置(spec §7.4):有 [诊断] 条目时在行尾显示计数徽。
  /// AnimatedBuilder 挂 LogStore:进页后新增条目实时刷新(A8)。
  Widget _diagCountTrailing(BuildContext context) {
    return AnimatedBuilder(
      animation: LogStore.instance,
      builder: (context, _) {
        final count = LogStore.instance.entries
            .where((e) => e.isDiagnostic)
            .length;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (count > 0) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: EmberColors.of(context).warn.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Text(
                  '$count',
                  style: TextStyle(
                    fontSize: EmberType.caption,
                    color: EmberColors.of(context).warn,
                  ),
                ),
              ),
              const SizedBox(width: EmberSpacing.gapS),
            ],
            _chevron,
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'settings.diagnostics.title'))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const _LastCrashCard(),
          const SizedBox(height: 12),
          _GroupCard(
            children: [
              ListTile(
                leading: const Icon(Icons.bug_report_outlined, size: 20),
                title: Text(tr(context, 'settings.diagnostics.log')),
                subtitle: Text(tr(context, 'settings.diagnostics.logSubtitle')),
                trailing: _diagCountTrailing(context),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const LogPage(diagnosticsOnly: true),
                  ),
                ),
              ),
              const Divider(indent: 52),
              ListTile(
                leading: const Icon(Icons.terminal, size: 20),
                title: Text(tr(context, 'settings.log')),
                subtitle: Text(
                  tr(context, 'settings.diagnostics.protocolLogSubtitle'),
                ),
                trailing: _chevron,
                onTap: () => Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => const LogPage())),
              ),
              if (client != null) ...[
                const Divider(indent: 52),
                ListTile(
                  leading: const Icon(Icons.bug_report_outlined, size: 20),
                  title: Text(tr(context, 'settings.diagnostics.rpc')),
                  subtitle: Text(
                    tr(context, 'settings.diagnostics.rpcSubtitle'),
                  ),
                  trailing: _chevron,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => RpcExplorerPage(client: client!),
                    ),
                  ),
                ),
              ],
              if (bridge != null) ...[
                const Divider(indent: 52),
                ListTile(
                  leading: const Icon(Icons.hub_outlined, size: 20),
                  title: Text(tr(context, 'settings.diagnostics.channel')),
                  subtitle: Text(
                    tr(context, 'settings.diagnostics.channelSubtitle'),
                  ),
                  trailing: _chevron,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ChannelExplorerPage(session: bridge!),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// Shows the last persisted crash (from [crashStore]), hidden when none.
class _LastCrashCard extends StatefulWidget {
  const _LastCrashCard();

  @override
  State<_LastCrashCard> createState() => _LastCrashCardState();
}

class _LastCrashCardState extends State<_LastCrashCard> {
  CrashInfo? _crash;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final c = await crashStore?.read();
    if (mounted) setState(() => _crash = c);
  }

  void _showDetails() {
    final c = _crash;
    if (c == null) return;
    final text = tr(
      context,
      'settings.crash.details',
      args: {
        'time': c.time,
        'kind': c.kind,
        'version': c.appVersion,
        'error': c.error,
        'stack': c.stack ?? '',
      },
    );
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'settings.crash.title')),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: SelectableText(
              text,
              style: TextStyle(fontFamily: EmberFonts.term, fontSize: 10.5),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: text));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(tr(context, 'settings.crash.copied'))),
              );
            },
            child: Text(tr(context, 'settings.copy')),
          ),
          TextButton(
            onPressed: () async {
              await crashStore?.clear();
              if (context.mounted) Navigator.pop(context);
              await _load();
            },
            child: Text(tr(context, 'settings.clear')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: Text(tr(context, 'settings.close')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = _crash;
    if (c == null) return const SizedBox.shrink();
    final colors = EmberColors.of(context);
    return _GroupCard(
      children: [
        ListTile(
          leading: Icon(Icons.bug_report_outlined, size: 20, color: colors.err),
          title: Text(tr(context, 'settings.crash.title')),
          subtitle: Text(
            '${c.time} · ${c.error.split('\n').first}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: _chevron,
          onTap: _showDetails,
        ),
      ],
    );
  }
}
