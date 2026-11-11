import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/l10n/strings.dart';

final RegExp _placeholder = RegExp(r'\{(\w+)\}');

Set<String> _placeholders(String value) =>
    _placeholder.allMatches(value).map((match) => match[1]!).toSet();

void main() {
  test('每张区域表四语 key 集合完全一致', () {
    for (final table in appStringTables) {
      final zhCN = table.zhCN.keys.toSet();
      final others = <String, Map<String, String>>{
        'zhTW': table.zhTW,
        'enUS': table.enUS,
        'ruRU': table.ruRU,
      };
      for (final entry in others.entries) {
        expect(
          entry.value.keys.toSet(),
          zhCN,
          reason: '${table.area} 的 ${entry.key} 缺少或多出 key',
        );
      }
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

  test('四语文案非空且占位符一致', () {
    for (final table in appStringTables) {
      for (final key in table.zhCN.keys) {
        final zhCN = table.zhCN[key]!;
        final values = <String, String>{
          'zhCN': zhCN,
          'zhTW': table.zhTW[key]!,
          'enUS': table.enUS[key]!,
          'ruRU': table.ruRU[key]!,
        };
        for (final entry in values.entries) {
          expect(entry.value.trim(), isNotEmpty, reason: '$key/${entry.key}');
        }
        for (final entry in values.entries) {
          if (entry.key == 'zhCN') continue;
          expect(
            _placeholders(entry.value),
            _placeholders(zhCN),
            reason: '$key 的 ${entry.key} 占位符与 zhCN 不一致',
          );
        }
      }
    }
  });
}
