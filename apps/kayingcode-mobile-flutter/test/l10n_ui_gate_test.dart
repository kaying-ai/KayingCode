import 'dart:io';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';

final RegExp _cjk = RegExp(r'[\u4e00-\u9fff]');
final RegExp _skipCall = RegExp(
  r'(debugLog|debugPrint|log|StateError|FormatException|UnimplementedError|ArgumentError)\s*\(',
);
final RegExp _singleQuoted = RegExp(r"'(?:[^'\\]|\\.)*'");
final RegExp _doubleQuoted = RegExp(r'"(?:[^"\\]|\\.)*"');

/// 去掉行尾注释，保留字符串里的 `//`（URL 等）。
String _stripLineComment(String line) {
  var quote = '';
  for (var i = 0; i < line.length - 1; i++) {
    final char = line[i];
    if (quote.isNotEmpty) {
      if (char == r'\') {
        i++;
      } else if (char == quote) {
        quote = '';
      }
      continue;
    }
    if (char == "'" || char == '"') {
      quote = char;
    } else if (char == '/' && line[i + 1] == '/') {
      return line.substring(0, i);
    }
  }
  return line;
}

String _stripStrings(String code) =>
    code.replaceAll(_singleQuoted, "''").replaceAll(_doubleQuoted, '""');

int _parenDelta(String code) {
  var depth = 0;
  for (final unit in code.codeUnits) {
    if (unit == 0x28) depth++;
    if (unit == 0x29) depth--;
  }
  return depth;
}

bool _whitelisted(String path, String code) {
  // Windows listSync 返回混合分隔符，先归一化才能正确匹配既有的精确文件白名单。
  path = path.replaceAll(r'\', '/');
  if (path.endsWith('lib/ui/ai_content_label.dart')) return true;
  // 语言名按各语言母语书写，是给用户切换的目标，不参与界面语言翻译。
  return path.endsWith('lib/ui/settings_page.dart') &&
      (code.contains("'简体中文'") || code.contains("'繁體中文'"));
}

void main() {
  test('lib/ui 不含未抽取的中文字面量（日志与内部异常除外）', () {
    final root = Directory('lib/ui');
    expect(root.existsSync(), isTrue, reason: '请在 app 根目录运行测试');

    final offenders = <String>[];
    for (final entity in root.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final lines = entity.readAsLinesSync();
      var skipDepth = 0;
      var inBlockComment = false;
      for (var i = 0; i < lines.length; i++) {
        var code = _stripLineComment(lines[i]);
        final trimmed = code.trimLeft();
        if (inBlockComment) {
          if (trimmed.contains('*/')) {
            inBlockComment = false;
            code = code.substring(code.indexOf('*/') + 2);
          } else {
            continue;
          }
        } else if (trimmed.startsWith('/*')) {
          if (!trimmed.contains('*/')) inBlockComment = true;
          continue;
        }

        final stripped = _stripStrings(code);
        final delta = _parenDelta(stripped);
        if (skipDepth > 0) {
          skipDepth = math.max(0, skipDepth + delta);
          continue;
        }
        if (_skipCall.hasMatch(stripped)) {
          skipDepth = math.max(0, delta);
          continue;
        }
        if (!_cjk.hasMatch(code)) continue;
        if (_whitelisted(entity.path, code)) continue;
        offenders.add('${entity.path}:${i + 1}: ${lines[i].trim()}');
      }
    }

    expect(
      offenders,
      isEmpty,
      reason:
          '以下中文字面量尚未进入 lib/l10n（日志、StateError/FormatException '
          '与语言名除外）：\n${offenders.join('\n')}',
    );
  });
}
