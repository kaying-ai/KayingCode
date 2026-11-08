import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/l10n/strings.dart';

final RegExp _placeholder = RegExp(r'\{(\w+)\}');

Set<String> _placeholders(String value) =>
    _placeholder.allMatches(value).map((match) => match[1]!).toSet();

void main() {
  test('每张区域表三语 key 集合完全一致', () {
    for (final table in appStringTables) {
      final zhCN = table.zhCN.keys.toSet();
      expect(
        table.zhTW.keys.toSet(),
        zhCN,
        reason: '${table.area} 的 zhTW 缺少或多出 key',
      );
      expect(
        table.enUS.keys.toSet(),
        zhCN,
        reason: '${table.area} 的 enUS 缺少或多出 key',
      );
    }
  });

  test('跨区域表没有重复 key', () {
    final owner = <String, String>{};
    for (final table in appStringTables) {
      for (final key in table.zhCN.keys) {
        expect(
          owner.containsKey(key),
          isFalse,
          reason: '重复 key "$key"：${owner[key]} 与 ${table.area}',
        );
        owner[key] = table.area;
      }
    }
  });

  test('三语文案非空且占位符一致', () {
    for (final table in appStringTables) {
      for (final key in table.zhCN.keys) {
        final zhCN = table.zhCN[key]!;
        final zhTW = table.zhTW[key]!;
        final enUS = table.enUS[key]!;
        for (final entry in {
          'zhCN': zhCN,
          'zhTW': zhTW,
          'enUS': enUS,
        }.entries) {
          expect(entry.value.trim(), isNotEmpty, reason: '$key/${entry.key}');
        }
        expect(
          _placeholders(zhTW),
          _placeholders(zhCN),
          reason: '$key 的 zhTW 占位符与 zhCN 不一致',
        );
        expect(
          _placeholders(enUS),
          _placeholders(zhCN),
          reason: '$key 的 enUS 占位符与 zhCN 不一致',
        );
      }
    }
  });
}
