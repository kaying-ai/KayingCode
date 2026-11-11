import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/l10n/strings.dart';

const _fontFiles = <String>[
  'assets/fonts/Zflow-UI-Regular.ttf',
  'assets/fonts/Zflow-UI-Bold.ttf',
  'assets/fonts/Zflow-Term-Regular.ttf',
];

final RegExp _cjk = RegExp(r'[\u4e00-\u9fff]');
final RegExp _cyrillic = RegExp(r'[\u0400-\u04ff]');

Set<int> _unicodeCmap(String path) {
  final bytes = File(path).readAsBytesSync();
  final data = ByteData.sublistView(bytes);
  final tableCount = data.getUint16(4);
  int? cmapOffset;
  for (var i = 0; i < tableCount; i++) {
    final record = 12 + i * 16;
    final tag = String.fromCharCodes(bytes.sublist(record, record + 4));
    if (tag == 'cmap') {
      cmapOffset = data.getUint32(record + 8);
      break;
    }
  }
  if (cmapOffset == null) throw StateError('$path 缺少 cmap 表');

  final codepoints = <int>{};
  final subtableCount = data.getUint16(cmapOffset + 2);
  for (var i = 0; i < subtableCount; i++) {
    final record = cmapOffset + 4 + i * 8;
    final platformId = data.getUint16(record);
    final encodingId = data.getUint16(record + 2);
    final unicode =
        platformId == 0 ||
        (platformId == 3 && (encodingId == 1 || encodingId == 10));
    if (!unicode) continue;
    final offset = cmapOffset + data.getUint32(record + 4);
    final format = data.getUint16(offset);
    if (format == 4) {
      _readFormat4(data, offset, codepoints);
    } else if (format == 12) {
      _readFormat12(data, offset, codepoints);
    }
  }
  return codepoints;
}

void _readFormat4(ByteData data, int offset, Set<int> codepoints) {
  final length = data.getUint16(offset + 2);
  final limit = offset + length;
  final segCount = data.getUint16(offset + 6) ~/ 2;
  final endCodes = offset + 14;
  final startCodes = endCodes + segCount * 2 + 2;
  final deltas = startCodes + segCount * 2;
  final rangeOffsets = deltas + segCount * 2;
  for (var segment = 0; segment < segCount; segment++) {
    final end = data.getUint16(endCodes + segment * 2);
    final start = data.getUint16(startCodes + segment * 2);
    if (start > end || end == 0xFFFF) continue;
    final delta = data.getInt16(deltas + segment * 2);
    final rangeOffsetPosition = rangeOffsets + segment * 2;
    final rangeOffset = data.getUint16(rangeOffsetPosition);
    for (var cp = start; cp <= end; cp++) {
      if (rangeOffset == 0) {
        codepoints.add(cp);
        continue;
      }
      final glyphPosition =
          rangeOffsetPosition + rangeOffset + (cp - start) * 2;
      if (glyphPosition + 2 > limit) continue;
      final glyph = data.getUint16(glyphPosition);
      if (glyph == 0) continue;
      if (((glyph + delta) & 0xFFFF) != 0) codepoints.add(cp);
    }
  }
}

void _readFormat12(ByteData data, int offset, Set<int> codepoints) {
  final groupCount = data.getUint32(offset + 12);
  for (var group = 0; group < groupCount; group++) {
    final record = offset + 16 + group * 12;
    final start = data.getUint32(record);
    final end = data.getUint32(record + 4);
    for (var cp = start; cp <= end; cp++) {
      codepoints.add(cp);
    }
  }
}

void main() {
  test('打包字体 cmap 覆盖四语表全部汉字与俄文西里尔字母', () {
    final requiredCjk = <int>{};
    final requiredCyrillic = <int>{};
    for (final table in appStringTables) {
      for (final map in [table.zhCN, table.zhTW, table.enUS]) {
        for (final value in map.values) {
          for (final rune in value.runes) {
            final char = String.fromCharCode(rune);
            if (_cjk.hasMatch(char)) requiredCjk.add(rune);
          }
        }
      }
      for (final value in table.ruRU.values) {
        for (final rune in value.runes) {
          final char = String.fromCharCode(rune);
          if (_cyrillic.hasMatch(char)) requiredCyrillic.add(rune);
        }
      }
    }
    expect(requiredCjk, isNotEmpty);
    expect(requiredCyrillic, isNotEmpty);

    for (final path in _fontFiles) {
      expect(File(path).existsSync(), isTrue, reason: '$path 缺失');
      final cmap = _unicodeCmap(path);
      final missingCjk = requiredCjk.where((cp) => !cmap.contains(cp)).toList()
        ..sort();
      expect(
        missingCjk,
        isEmpty,
        reason:
            '$path 缺少 ${missingCjk.length} 个汉字：'
            '${missingCjk.map(String.fromCharCode).join()}',
      );
      final missingCyrillic =
          requiredCyrillic.where((cp) => !cmap.contains(cp)).toList()..sort();
      expect(
        missingCyrillic,
        isEmpty,
        reason:
            '$path 缺少 ${missingCyrillic.length} 个西里尔字母：'
            '${missingCyrillic.map(String.fromCharCode).join()}',
      );
    }
  });
}
