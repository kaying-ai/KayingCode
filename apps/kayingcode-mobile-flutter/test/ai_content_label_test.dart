import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/ui/ai_content_label.dart';
import 'package:kayingcode_mobile/ui/theme.dart';

double _contrast(Color a, Color b) {
  final x = a.computeLuminance();
  final y = b.computeLuminance();
  return ((x > y ? x : y) + .05) / ((x > y ? y : x) + .05);
}

void main() {
  for (final dark in [false, true]) {
    testWidgets('${dark ? 'dark' : 'light'} 主题下「内容由AI生成」标识中性、可读且不占大面积', (
      tester,
    ) async {
      final theme = dark ? buildDarkTheme() : buildLightTheme();
      final colors = dark
          ? const EmberColors.dark()
          : const EmberColors.light();
      await tester.pumpWidget(
        MaterialApp(
          locale: appLocaleZhCN,
          supportedLocales: supportedAppLocales,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          theme: theme,
          home: const Scaffold(body: Center(child: AiContentLabel())),
        ),
      );
      expect(find.text('内容由AI生成'), findsOneWidget);
      // 文字与底色对比度、中性色口径与 theme_test.dart 一致。
      expect(
        _contrast(colors.textSoft, colors.card),
        greaterThanOrEqualTo(4.5),
      );
      expect(colors.card.r, colors.card.g);
      expect(colors.card.g, colors.card.b);
      // 悬浮标识要压在小高度内,避免遮挡消息流内容。
      expect(
        tester.getSize(find.byType(AiContentLabel)).height,
        lessThanOrEqualTo(24),
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('标识贴消息流顶部居中悬浮,且不拦截点击(不得挡住消息流交互)', (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      MaterialApp(
        locale: appLocaleZhCN,
        supportedLocales: supportedAppLocales,
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: buildDarkTheme(),
        home: Scaffold(
          body: Stack(
            children: [
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => taps++,
                  child: const SizedBox.expand(),
                ),
              ),
              // 与 chat_page.dart 相同的挂载方式与位置。
              Positioned(
                top: 4,
                left: 0,
                right: 0,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: const [AiContentLabel()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    final labelRect = tester.getRect(find.byType(AiContentLabel));
    final surface = tester.getSize(find.byType(Scaffold));
    expect(labelRect.top, 4);
    expect(
      labelRect.center.dx,
      moreOrLessEquals(surface.width / 2, epsilon: 0.5),
    );

    // 命中的是下层 GestureDetector,不是标识本身——这正是 IgnorePointer 的预期,
    // 因此关掉「点不到目标 widget」的告警。
    await tester.tap(find.text('内容由AI生成'), warnIfMissed: false);
    expect(taps, 1);
    expect(tester.takeException(), isNull);
  });
}
