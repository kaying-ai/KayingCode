import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kayingcode_mobile/state/recent_projects.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/credential_storage.dart';

class _Storage implements CredentialStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String data) async {
    value = data;
  }
}

void main() {
  test(
    'recent projects persist by account and workspace identity without credentials',
    () async {
      SharedPreferences.setMockInitialValues({});
      final storage = _Storage();
      final store = AccountStore(storage: storage);
      await store.load();
      final account = await store.addUrl(
        'https://example.test/remote/v4?sid=test&app_version=3.17.2#authorize=${'A' * 43}',
      );
      final message = {
        'type': 'kayingcode.project-opened.v1',
        'workspacePath': '/game',
        'workspaceIdentity': 'remote-a',
        'token': 'never-save',
      };
      await RecentProjects.remember(store, account.id, message);
      await RecentProjects.remember(store, account.id, {
        ...message,
        'workspaceIdentity': 'remote-b',
      });
      await RecentProjects.remember(store, account.id, message);
      final restart = AccountStore(storage: storage);
      await restart.load();
      final items = await RecentProjects.load(restart);
      expect(items.length, 2);
      expect(items.first.workspaceKey, 'remote-a');
      expect(
        jsonEncode(items.map((p) => p.toJson()).toList()),
        isNot(contains('never-save')),
      );
      expect(
        RecentProject.parse(account.id, {
          'type': 'other',
          'workspacePath': '/game',
        }),
        isNull,
      );
      await expectLater(
        store.addUrl('https://zcode.z.ai/remote/v4?sid=old&app_version=3.17.2'),
        throwsFormatException,
      );
    },
  );

  test('项目按连接分组、按最近使用排序并折叠 Windows 分隔符别名', () {
    RecentProject project(
      String accountId,
      String path,
      int usedAt, {
      String? identity,
      String? deviceSid,
    }) => RecentProject(accountId, path, identity, usedAt, deviceSid);

    final original = project(
      'a',
      'D:/code/game',
      1,
      deviceSid: 'device',
    );
    final latest = project(
      'a',
      r'D:\code\game',
      8,
      deviceSid: 'device',
    );
    final otherAccount = project(
      'b',
      'D:/code/game',
      5,
      deviceSid: 'device',
    );
    final otherDevice = project(
      'a',
      'D:/code/game',
      4,
      deviceSid: 'other',
    );
    final explicit = project(
      'a',
      'D:/code/game',
      3,
      identity: 'D:/code/game',
      deviceSid: 'device',
    );
    final posix = project('a', '/code/game', 1, deviceSid: 'device');
    final posixWithBackslash = project(
      'a',
      r'/code\game',
      1,
      deviceSid: 'device',
    );

    final groups = groupRecentProjects([
      original,
      otherAccount,
      otherDevice,
      explicit,
      posix,
      posixWithBackslash,
      latest,
    ]);

    expect(groups.keys.toList(), ['a', 'b']);
    // 同连接、同设备、无显式身份：只显示最近的一条（latest），original 折叠。
    // 不同设备、显式身份和 POSIX 路径保持独立；时间相同的 POSIX 项保持原顺序。
    expect(groups['a']!.map((p) => p.lastUsedAt).toList(), [8, 4, 3, 1, 1]);
    expect(groups['a']!.first.workspacePath, r'D:\code\game');
    expect(groups['a']![3].workspacePath, '/code/game');
    expect(groups['a']![4].workspacePath, r'/code\game');
    expect(groups['b']!.single.lastUsedAt, 5);
    // 展示层折叠不改变导航键。
    expect(projectKey(original), isNot(projectKey(latest)));
  });

  test('项目键按连接、设备及显式身份隔离', () {
    const base = RecentProject('a', '/game', null, 1, 'device');
    expect(
      projectKey(base),
      isNot(projectKey(const RecentProject('b', '/game', null, 1, 'device'))),
    );
    expect(
      projectKey(base),
      isNot(projectKey(const RecentProject('a', '/game', null, 1, 'other'))),
    );
    expect(
      projectKey(base),
      isNot(
        projectKey(const RecentProject('a', '/game', 'remote-a', 1, 'device')),
      ),
    );
    expect(
      projectKey(const RecentProject('a', '/game', ' remote-a ', 1)),
      projectKey(const RecentProject('a', '/other', 'remote-a', 1)),
    );
  });
}
