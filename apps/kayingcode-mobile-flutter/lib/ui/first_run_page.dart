import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../protocol/backend/backend_type.dart';
import 'theme.dart';

/// 设备档案为空时的首次入口；是否展示由 RootShell 根据 AccountStore 决定。
class FirstRunPage extends StatelessWidget {
  final ValueChanged<BackendType> onConnect;
  final VoidCallback onImport;
  final VoidCallback onSettings;

  const FirstRunPage({
    super.key,
    required this.onConnect,
    required this.onImport,
    required this.onSettings,
  });

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(EmberSpacing.page),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(
                              EmberRadius.content,
                            ),
                            child: Image.asset(
                              'assets/icon/kayingcode.png',
                              width: 48,
                              height: 48,
                              cacheWidth:
                                  (48 * MediaQuery.devicePixelRatioOf(context))
                                      .round(),
                              semanticLabel: 'KayingCode',
                            ),
                          ),
                          const SizedBox(width: EmberSpacing.gapM),
                          Expanded(
                            child: Text(
                              'KayingCode',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: EmberType.section,
                                fontWeight: FontWeight.w600,
                                color: colors.textSolid,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: onSettings,
                      tooltip: tr(context, 'settings.title'),
                      icon: const Icon(Icons.settings_outlined),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text(
                  tr(context, 'firstRun.heroTitle'),
                  style: TextStyle(
                    fontSize: EmberType.title,
                    fontWeight: FontWeight.w600,
                    color: colors.textSolid,
                  ),
                ),
                const SizedBox(height: EmberSpacing.gapS),
                Text(
                  tr(context, 'firstRun.heroSubtitle'),
                  style: TextStyle(
                    fontSize: EmberType.body,
                    height: EmberType.lineHeight,
                    color: colors.textMuted,
                  ),
                ),
                const SizedBox(height: 24),
                _ConnectChoice(
                  title: tr(context, 'firstRun.connectKayingcode'),
                  description: tr(context, 'firstRun.connectKayingcodeHint'),
                  icon: Icons.link_outlined,
                  onTap: () => onConnect(BackendType.kayingcode),
                ),
                const SizedBox(height: EmberSpacing.gapS),
                TextButton.icon(
                  onPressed: onImport,
                  icon: const Icon(Icons.settings_backup_restore, size: 18),
                  label: Text(tr(context, 'firstRun.importBackup')),
                ),
                const SizedBox(height: 24),
                Text(
                  tr(context, 'firstRun.beforeStart'),
                  style: TextStyle(
                    fontSize: EmberType.emphasis,
                    fontWeight: FontWeight.w600,
                    color: colors.textSolid,
                  ),
                ),
                const SizedBox(height: EmberSpacing.gapS),
                Text(
                  tr(context, 'firstRun.beforeStartDetail'),
                  style: TextStyle(
                    fontSize: EmberType.secondary,
                    height: EmberType.lineHeight,
                    color: colors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ConnectChoice extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final VoidCallback onTap;

  const _ConnectChoice({
    required this.title,
    required this.description,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return Material(
      color: colors.card,
      borderRadius: BorderRadius.circular(EmberRadius.content),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(EmberRadius.content),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(EmberSpacing.page),
          decoration: BoxDecoration(
            border: Border.all(color: colors.hairline),
            borderRadius: BorderRadius.circular(EmberRadius.content),
          ),
          child: Row(
            children: [
              Icon(icon, size: 24, color: colors.textSolid),
              const SizedBox(width: EmberSpacing.gapM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: EmberType.body,
                        fontWeight: FontWeight.w600,
                        color: colors.textSolid,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: TextStyle(
                        fontSize: EmberType.secondary,
                        height: EmberType.lineHeight,
                        color: colors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: EmberSpacing.gapS),
              Icon(Icons.chevron_right, size: 20, color: colors.textFaint),
            ],
          ),
        ),
      ),
    );
  }
}
