import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/ui/chat_page.dart';

/// 协作模式文案必须与桌面端 `packages/ui/src/i18n/locales/zh-CN.ts` 的
/// `mode.label.glm.*` / `mode.description.glm.*` 逐字一致。
///
/// 这两端此前是脱钩的：移动端曾硬编码「构建 / 编辑 / 计划 / YOLO」加一套
/// 自造描述，与桌面文案完全不同。本测试把桌面文案钉成断言基准。
void main() {
  test('协作模式文案与桌面 locale 逐字一致', () {
    // 桌面 mode.label.glm.* / mode.description.glm.*
    expect(modeLabelOf('plan'), '计划模式');
    expect(modeDescriptionOf('plan'), '编辑前先出计划。');

    expect(modeLabelOf('build'), '变更前确认');
    expect(modeDescriptionOf('build'), '改文件前先问我。');

    expect(modeLabelOf('edit'), '自动编辑');
    expect(modeDescriptionOf('edit'), '自动编辑文件。');

    expect(modeLabelOf('yolo'), '完全访问');
    expect(modeDescriptionOf('yolo'), '减少确认次数。');
  });

  test('宿主别名 ask/full 与主值共用同一套文案', () {
    // 宿主实际下发 ask / full，桌面源码另有 build / yolo 别名。
    expect(modeLabelOf('ask'), modeLabelOf('build'));
    expect(modeDescriptionOf('ask'), modeDescriptionOf('build'));
    expect(modeLabelOf('full'), modeLabelOf('yolo'));
    expect(modeDescriptionOf('full'), modeDescriptionOf('yolo'));
    expect(modeLabelOf('auto'), modeLabelOf('edit'));
  });

  test('大小写不敏感，未知值原样返回且描述为 null', () {
    expect(modeLabelOf('PLAN'), '计划模式');
    expect(modeLabelOf('Yolo'), '完全访问');
    // 未知值：标签回落原值，描述为 null 由调用方回落协议 name。
    expect(modeLabelOf('unknown-mode'), 'unknown-mode');
    expect(modeDescriptionOf('unknown-mode'), isNull);
  });

  test('模式图标按桌面 resolveModeOptionIcon 映射且四模式互不相同', () {
    final icons = {
      for (final mode in ['plan', 'build', 'edit', 'yolo'])
        mode: modeIconOf(mode),
    };
    // 未知值回落 Hand（桌面同款兜底）。
    expect(modeIconOf('unknown-mode'), modeIconOf('build'));
    // 四个模式各有独立图标，避免菜单里四行长得一样。
    expect(icons.values.toSet().length, 4);
  });

  test('高风险模式仍只覆盖 plan 与 yolo/full', () {
    expect(modeIsHot('plan'), isTrue);
    expect(modeIsHot('yolo'), isTrue);
    expect(modeIsHot('full'), isTrue);
    expect(modeIsHot('build'), isFalse);
    expect(modeIsHot('edit'), isFalse);
  });
}
