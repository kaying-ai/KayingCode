import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/protocol/conversation.dart';
import 'package:kayingcode_mobile/ui/session_drawer.dart';

void main() {
  test('摘要去除 Markdown 并压成单行，搜索保留原摘要语义', () {
    const preview = '## 你好\n- **完成** [链接](https://example.test) `code`';
    expect(sessionPreviewText(preview), '你好 完成 链接 code');
    final entries = List.generate(
      7,
      (i) => SessionEntry({
        'sessionId': '$i',
        'title': '会话 $i',
        'lastAssistantPreview': i == 6 ? preview : '摘要',
        'lastActivityAt': 100 - i,
      }),
    );
    expect(filterSessions(entries, 'example.test').single.sessionId, '6');
    expect(
      visibleRecentSessions(entries, query: '', showAll: false),
      hasLength(5),
    );
    expect(
      visibleRecentSessions(entries, query: '', showAll: true),
      hasLength(7),
    );
    expect(
      visibleRecentSessions(
        entries,
        query: '链接',
        showAll: false,
      ).single.sessionId,
      '6',
    );
  });
}
