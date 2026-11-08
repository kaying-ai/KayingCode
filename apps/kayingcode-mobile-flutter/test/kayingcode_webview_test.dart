import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/protocol/connection_params.dart';
import 'package:kayingcode_mobile/state/account_store.dart';
import 'package:kayingcode_mobile/state/credential_storage.dart';
import 'package:kayingcode_mobile/ui/bot_webview_uri.dart';

class _Storage implements CredentialStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String data) async {
    value = data;
  }
}

String web(String sid, [String secret = 'A']) =>
    'https://relay.example.test/remote/v4?sid=$sid#authorize=${List.filled(43, secret).join()}';
void main() {
  test(
    'current self-hosted Web uses the complete original URL and has no native fallback',
    () async {
      final account = Account.fromUrl(web('one'));
      expect(account.params?.isKayingcodeWebV2, isTrue);
      expect(await resolveKayingcodeWebviewUri(account), Uri.parse(web('one')));
      expect(botUsesWebview(account, enabled: false), isTrue);
      for (final value in [
        'https://relay.example.test#pairing#secret',
        'https://relay.example.test/remote/?relay&bot=old#v=1&pairing=old',
        'https://relay.example.test/remote/v4?sid=one&hash=old&t=1',
      ]) {
        expect(ZflowConnectionParams.parse(value), isNull);
      }
    },
  );
  test(
    'new invitation updates only the same device profile, and stale results cannot confirm it',
    () async {
      final store = AccountStore(storage: _Storage());
      await store.load();
      final first = await store.addUrl(web('one'));
      final refreshed = await store.addUrl(web('one', 'B'));
      expect(refreshed.id, first.id);
      await store.addUrl(web('two'));
      expect(store.accounts.length, 2);
      expect(
        await store.confirmConnection(first.id, expectedUrl: first.url),
        isNull,
      );
      expect(
        (await store.confirmConnection(
          first.id,
          expectedUrl: refreshed.url,
        ))?.id,
        first.id,
      );
      await expectLater(
        store.addUrl('https://relay.example.test#pairing#secret'),
        throwsFormatException,
      );
    },
  );
}
