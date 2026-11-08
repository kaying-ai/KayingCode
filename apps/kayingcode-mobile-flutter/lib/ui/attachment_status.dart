import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../protocol/zflow_client.dart';
import 'theme.dart';

/// bridge 保留页面身份，状态来自 adapter；视图只发送显式重试命令。
class AttachmentStatus extends StatelessWidget {
  const AttachmentStatus({super.key, required this.bridge, this.onRetry});
  final BridgeSession bridge;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<String?>(
    valueListenable: bridge.degraded,
    builder: (context, reason, _) {
      if (reason == null) return const SizedBox.shrink();
      // adapter 写入非本地化哨兵 `recovery-failed: <detail>`，失败判定只看
      // 稳定前缀，展示文案在 UI 侧按当前语言生成。
      final failed = reason.startsWith('recovery-failed');
      const detailPrefix = 'recovery-failed:';
      final detail = reason.startsWith(detailPrefix)
          ? reason.substring(detailPrefix.length).trim()
          : '';
      final colors = EmberColors.of(context);
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: EmberSpacing.page),
        child: Row(
          children: [
            Icon(
              failed ? Icons.error_outline : Icons.sync,
              size: 18,
              color: failed ? colors.err : colors.textMuted,
            ),
            const SizedBox(width: EmberSpacing.gapS),
            Expanded(
              child: Text(
                failed
                    ? tr(
                        context,
                        'chat.status.recoveryFailed',
                        args: {'error': detail},
                      )
                    : tr(context, 'chat.status.reconnecting'),
                style: TextStyle(
                  fontSize: EmberType.caption,
                  color: failed ? colors.err : colors.textMuted,
                ),
              ),
            ),
            if (failed && onRetry != null)
              TextButton(
                  onPressed: onRetry,
                  child: Text(tr(context, 'chat.status.retryConnect'))),
          ],
        ),
      );
    },
  );
}
