import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import 'theme.dart';

/// AI 生成内容显式标识文案（《人工智能生成合成内容标识办法》与 GB 45438-2025
/// 的显式标识要求）。与 Taro 端 `src/ui/chat/aiContentLabel.ts` 逐字一致，由
/// `apps/kayingcode-mobile-taro/src/ui/chat/aiContentLabel.test.ts` 跨端锁定。
const String aiContentLabelText = '内容由AI生成';

/// 消息流顶部常驻的合规标识：悬浮在消息之上、不随滚动移动、不拦截指针事件。
/// 只用中性色（card / hairline / textSoft），深浅主题共用同一规则。
class AiContentLabel extends StatelessWidget {
  const AiContentLabel({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return IgnorePointer(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: colors.card,
          borderRadius: BorderRadius.circular(EmberRadius.control),
          border: Border.all(color: colors.hairline),
          boxShadow: const [
            BoxShadow(
              color: Color(0x24000000),
              blurRadius: 4,
              offset: Offset(0, 1),
            ),
          ],
        ),
        child: Text(
          tr(context, 'chat.content.aiGenerated'),
          style: TextStyle(
            fontSize: EmberType.secondary,
            height: 1.2,
            color: colors.textSoft,
          ),
        ),
      ),
    );
  }
}
