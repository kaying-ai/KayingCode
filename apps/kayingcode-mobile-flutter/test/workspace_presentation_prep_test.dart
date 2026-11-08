import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/protocol/conversation.dart';

void main() {
  test('workspace presentation 映射为 mode + slash 目录，丢弃缺键条目', () {
    final config = workspacePresentationToConfig({
      'mode': 'build',
      'slashCommands': [
        {'name': 'compact', 'description': '压缩', 'inputHint': '[说明]'},
        {'description': '缺 name'},
      ],
      'provider': 'glm',
    });
    expect(config['configOptions'], [
      {
        'id': 'mode',
        'name': '模式',
        'category': 'mode',
        'type': 'select',
        'currentValue': 'build',
      },
    ]);
    expect(config['slashCommands'], [
      {'name': 'compact', 'description': '压缩', 'inputHint': '[说明]'},
    ]);
  });

  test('presentation 缺 mode / 形状异常时给出空目录而不是半成品', () {
    expect(workspacePresentationToConfig(null), {'configOptions': [], 'slashCommands': []});
    expect(workspacePresentationToConfig({'slashCommands': 'nope'}), {
      'configOptions': [],
      'slashCommands': [],
    });
    expect(workspacePresentationToConfig({'mode': '  '}), {
      'configOptions': [],
      'slashCommands': [],
    });
  });
}
