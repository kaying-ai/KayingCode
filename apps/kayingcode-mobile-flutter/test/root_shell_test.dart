import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/protocol/backend/backend_type.dart';
import 'package:kayingcode_mobile/ui/root_shell.dart';

void main() {
  test('KayingCode bridge uses catalog grant id, not path or identity', () {
    final workspace = {
      'workspaceId': 'catalog-id',
      'workspacePath': '/workspace/project',
      'workspaceIdentity': 'stable-identity',
    };

    expect(
      bridgeWorkspaceKeyOf(workspace, BackendType.kayingcode),
      'catalog-id',
    );
    expect(
      bridgeWorkspaceKeyOf(workspace, BackendType.zcode),
      'stable-identity',
    );
  });

  test('KayingCode entries without a catalog id fail closed', () {
    expect(
      bridgeWorkspaceKeyOf({
        'workspacePath': '/workspace/project',
      }, BackendType.kayingcode),
      isNull,
    );
  });

  test('KayingCode attachment scope uses Host canonical path', () {
    final catalog = {
      'workspaceId': 'opaque-grant',
      'workspacePath': 'opaque-grant',
      'workspaceIdentity': 'opaque-grant',
      'label': 'Project',
    };
    final resolved = resolvedWorkspaceForBridge(
      catalog,
      BackendType.kayingcode,
      {'workspacePath': '/actual/project'},
    );
    expect(resolved['workspaceId'], 'opaque-grant');
    expect(resolved['workspacePath'], '/actual/project');
    expect(resolved.containsKey('workspaceIdentity'), isFalse);
  });
}
