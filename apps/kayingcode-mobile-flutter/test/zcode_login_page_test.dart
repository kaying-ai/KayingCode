import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kayingcode_mobile/protocol/zcode_auth.dart';
import 'package:kayingcode_mobile/ui/zcode_login_page.dart';

void main() {
  testWidgets(
    'login offers both providers, opens returned browser URL and cancels pending flow on close',
    (tester) async {
      Uri? opened;
      final auth = ZcodeAuthSession(
        origin: 'https://relay.example.com',
        client: MockClient((request) async {
          expect(jsonDecode(request.body), {'provider': 'bigmodel'});
          return http.Response(
            jsonEncode({
              'code': 0,
              'data': {
                'flow_id': 'flow',
                'authorize_url': 'https://bigmodel.cn/login?state=test',
                'expires_at':
                    DateTime.now().millisecondsSinceEpoch ~/ 1000 + 300,
                'poll_interval_sec': 2,
              },
            }),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ZcodeLoginPage(
            auth: auth,
            openUrl: (url) async {
              opened = url;
              return true;
            },
          ),
        ),
      );
      expect(find.textContaining('Z.ai'), findsOneWidget);
      await tester.tap(find.textContaining('BigModel'));
      await tester.pumpAndSettle();
      expect(opened?.host, 'bigmodel.cn');
      expect(find.byType(OutlinedButton), findsNWidgets(3));
      await tester.pumpWidget(const SizedBox.shrink());
      expect(await auth.poll(), isFalse);
      expect(await auth.signedIn(), isFalse);
    },
  );
}
